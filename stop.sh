#!/bin/bash
# Script d'arrêt propre de tous les serveurs

echo "🛑 Arrêt des serveurs Lizzi..."

# Arrêt des serveurs llama
echo "  ⏹️  Arrêt serveurs llama-server..."
pkill -f "llama-server.*11434" 2>/dev/null
pkill -f "llama-server.*11435" 2>/dev/null

# Arrêt du serveur Node.js
echo "  ⏹️  Arrêt serveur Node.js..."
lsof -ti :3001 | xargs kill -9 2>/dev/null || true

# Nettoyage des ports
sleep 1
lsof -ti :11434 | xargs kill -9 2>/dev/null || true
lsof -ti :11435 | xargs kill -9 2>/dev/null || true

echo "✅ Tous les serveurs sont arrêtés"
