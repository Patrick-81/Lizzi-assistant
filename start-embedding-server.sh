#!/bin/bash
# Script pour lancer le serveur d'embeddings

# Charger la configuration depuis .env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a; source "$SCRIPT_DIR/.env"; set +a
fi

MODEL_DIR="${MODELS_DIR:-$HOME/.var/app/llama-server/models}"
MODEL_PATH="$MODEL_DIR/${EMBEDDING_MODEL:-jina-embeddings-v2-small-en-Q5_K_M.gguf}"
PORT=${EMBED_PORT:-11435}

echo "🚀 Démarrage du serveur d'embeddings..."
echo "📦 Modèle: jina-embeddings-v2-small-en"
echo "🌐 Port: $PORT"

llama-server \
  --model "$MODEL_PATH" \
  --host 0.0.0.0 \
  --port $PORT \
  --embeddings \
  --pooling mean \
  --n-gpu-layers 999 \
  --ctx-size 512 \
  --verbose

