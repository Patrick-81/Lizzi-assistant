# 🌟 Lizzi - Assistant Personnel Intelligent

Assistant personnel local alimenté par IA avec capacités vocales et mémoire long terme.

## Fonctionnalités

- 💬 Chat conversationnel avec interface web élégante
- 🗣️ Synthèse vocale (Text-to-Speech) avec Piper
- 🧠 Mémoire long terme avec gestion des faits
- 🧮 Outils de calcul mathématique avancé
- 📅 Manipulation de dates et conversions d'unités
- 🎨 Affichage Markdown des réponses
- 🔒 100% local - vos données restent privées

## Prérequis

- Node.js 18+
- Ollama avec un modèle LLM (mistral, qwen, llama, etc.)
- Piper pour la synthèse vocale
- GPU recommandé (testé avec RTX 3060 12GB)

## Installation

1. Clone le repo
2. Configure `.env` avec l'hôte Ollama et le modèle
3. `npm install`
4. `npm run dev`
5. Accède à `http://localhost:3001`

## Architecture

- **Backend** : Node.js + Express + TypeScript
- **LLM** : Ollama (flexible, n'importe quel modèle)
- **TTS** : Piper (synthèse vocale locale)
- **Frontend** : HTML/CSS/JS vanilla avec Markdown
- **Mémoire** : JSON pour les faits long terme

## Configuration

Fichier `.env` :
```
OLLAMA_HOST=http://localhost:11434
MODEL_NAME=qwen2.5:14b
PORT=3001
```

## Licence

MIT
