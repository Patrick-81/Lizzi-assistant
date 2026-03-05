#!/bin/bash
# Script de démarrage complet - Chat + Embeddings + Assistant

set -e

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Charger la configuration depuis .env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a; source "$SCRIPT_DIR/.env"; set +a
fi

# Chemins — tout vient du .env
MODEL_DIR="${MODELS_DIR}"
CHAT_MODEL="$MODEL_DIR/$MODEL_NAME"
EMBED_MODEL="$MODEL_DIR/$EMBEDDING_MODEL"

# Ports extraits des URLs du .env
CHAT_PORT=$(echo "$LLM_HOST" | sed 's/.*://')
EMBED_PORT=$(echo "$EMBEDDING_HOST" | sed 's/.*://')
APP_PORT="${PORT}"

# PIDs pour cleanup
CHAT_PID=""
EMBED_PID=""

# Fonction de nettoyage
cleanup() {
    echo -e "\n${YELLOW}🛑 Arrêt des serveurs...${NC}"
    
    if [ ! -z "$CHAT_PID" ]; then
        echo "  ⏹️  Arrêt serveur chat (PID: $CHAT_PID)"
        kill $CHAT_PID 2>/dev/null || true
    fi
    
    if [ ! -z "$EMBED_PID" ]; then
        echo "  ⏹️  Arrêt serveur embeddings (PID: $EMBED_PID)"
        kill $EMBED_PID 2>/dev/null || true
    fi
    
    # Nettoie les ports si nécessaire
    lsof -ti :$CHAT_PORT | xargs kill -9 2>/dev/null || true
    lsof -ti :$EMBED_PORT | xargs kill -9 2>/dev/null || true
    lsof -ti :$APP_PORT | xargs kill -9 2>/dev/null || true
    
    echo -e "${GREEN}✅ Arrêt terminé${NC}"
    exit 0
}

# Capture Ctrl+C et autres signaux
trap cleanup SIGINT SIGTERM EXIT

# Vérification des modèles
echo -e "${GREEN}📦 Vérification des modèles...${NC}"
if [ ! -f "$CHAT_MODEL" ]; then
    echo -e "${RED}❌ Modèle chat introuvable: $CHAT_MODEL${NC}"
    exit 1
fi
if [ ! -f "$EMBED_MODEL" ]; then
    echo -e "${RED}❌ Modèle embeddings introuvable: $EMBED_MODEL${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Modèles trouvés${NC}"

# Nettoyage des ports existants
echo -e "${YELLOW}🧹 Nettoyage des ports...${NC}"
lsof -ti :$CHAT_PORT | xargs kill -9 2>/dev/null || true
lsof -ti :$EMBED_PORT | xargs kill -9 2>/dev/null || true
lsof -ti :$APP_PORT | xargs kill -9 2>/dev/null || true
sleep 2

# Lancement serveur CHAT
echo -e "${GREEN}🚀 Démarrage serveur chat $MODEL_NAME  (port $CHAT_PORT)...${NC}"
llama-server \
  --model "$CHAT_MODEL" \
  --host 0.0.0.0 \
  --port $CHAT_PORT \
  --ctx-size $CTX_SIZE \
  --n-gpu-layers $LLM_GPU_LAYERS \
  > /tmp/llama-chat.log 2>&1 &
CHAT_PID=$!
echo "  📝 PID: $CHAT_PID"
sleep 3

# Vérification serveur chat
if ! kill -0 $CHAT_PID 2>/dev/null; then
    echo -e "${RED}❌ Échec démarrage serveur chat${NC}"
    cat /tmp/llama-chat.log
    exit 1
fi
echo -e "${GREEN}✅ Serveur chat démarré${NC}"

# Lancement serveur EMBEDDINGS
echo -e "${GREEN}🚀 Démarrage serveur embeddings (port $EMBED_PORT)...${NC}"
llama-server \
  --model "$EMBED_MODEL" \
  --host 0.0.0.0 \
  --port $EMBED_PORT \
  --embeddings \
  --pooling $EMBEDDING_POOLING \
  --n-gpu-layers $EMBEDDING_GPU_LAYERS \
  --ctx-size $EMBEDDING_CTX_SIZE \
  > /tmp/llama-embed.log 2>&1 &
EMBED_PID=$!
echo "  📝 PID: $EMBED_PID"
sleep 3

# Vérification serveur embeddings
if ! kill -0 $EMBED_PID 2>/dev/null; then
    echo -e "${RED}❌ Échec démarrage serveur embeddings${NC}"
    cat /tmp/llama-embed.log
    cleanup
    exit 1
fi
echo -e "${GREEN}✅ Serveur embeddings démarré${NC}"

# Test des serveurs
echo -e "${YELLOW}🔍 Test des endpoints...${NC}"
if curl -s http://localhost:$CHAT_PORT/health > /dev/null 2>&1; then
    echo -e "${GREEN}  ✅ Serveur chat opérationnel${NC}"
else
    echo -e "${YELLOW}  ⚠️  Serveur chat ne répond pas encore (normal)${NC}"
fi

if curl -s http://localhost:$EMBED_PORT/health > /dev/null 2>&1; then
    echo -e "${GREEN}  ✅ Serveur embeddings opérationnel${NC}"
else
    echo -e "${YELLOW}  ⚠️  Serveur embeddings ne répond pas encore (normal)${NC}"
fi

# Lancement de l'assistant
echo -e "${GREEN}🤖 Démarrage de l'assistant...${NC}"
echo -e "${YELLOW}📝 Logs chat: tail -f /tmp/llama-chat.log${NC}"
echo -e "${YELLOW}📝 Logs embeddings: tail -f /tmp/llama-embed.log${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

npm run dev

