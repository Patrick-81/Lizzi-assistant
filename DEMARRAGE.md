# 🌟 Lizzi - Assistant Personnel

Scripts de démarrage mis à jour pour gérer automatiquement les serveurs LLM.

## 🚀 Démarrage Rapide

```bash
./start.sh
```

Ce script lance automatiquement :
1. **Serveur Chat** (llama-server port 11434) - Ministral-3-8B
2. **Serveur Embeddings** (llama-server port 11435) - Jina v2 Small
3. **Serveur Assistant** (Node.js port 3001) - Interface web

## 🛑 Arrêt

```bash
# Ctrl+C dans le terminal du start.sh
# OU dans un autre terminal :
./stop.sh
```

## 📝 Logs

Les logs des serveurs llama sont dans :
- Chat : `/tmp/llama-chat.log`
- Embeddings : `/tmp/llama-embed.log`

```bash
# Suivre les logs en direct
tail -f /tmp/llama-chat.log
tail -f /tmp/llama-embed.log
```

## ⚙️ Configuration

Voir `.env` pour modifier les ports et modèles :
```bash
LLM_HOST=http://localhost:11434
EMBEDDING_HOST=http://localhost:11435
```

## 🎤 Accès

Une fois démarré :
- **Interface web** : https://localhost:3001
- **API Chat** : http://localhost:11434
- **API Embeddings** : http://localhost:11435

## 🔧 Dépannage

Si un port est déjà utilisé :
```bash
./stop.sh
./start.sh
```

Vérifier les processus :
```bash
ps aux | grep llama-server
ps aux | grep node
```
