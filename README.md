# 🌟 Lizzi - Assistant Personnel Intelligent

Assistant personnel local alimenté par IA avec capacités vocales et mémoire long terme.

## 📋 Table des Matières

- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Utilisation](#utilisation)
- [Système de Mémoire](#système-de-mémoire)
- [Outils Disponibles](#outils-disponibles)
- [Problèmes Connus & Solutions](#problèmes-connus--solutions)
- [Évolutions Planifiées](#évolutions-planifiées)
- [Développement](#développement)
- [Licence](#licence)

---

## 🎯 Fonctionnalités

### ✅ Actuellement Disponibles

- 💬 **Chat conversationnel** avec interface web élégante et responsive
- 🗣️ **Synthèse vocale** (Text-to-Speech) avec Piper
- 🧠 **Mémoire long terme** avec gestion des faits (format SPO)
- 🧮 **Calcul mathématique** avancé (opérations, fonctions, etc.)
- 📅 **Manipulation de dates** (différences, ajouts, formatage)
- 🔄 **Conversion d'unités** (longueur, poids, température)
- 🎨 **Affichage Markdown** des réponses avec coloration syntaxique
- 🌙 **Mode sombre** avec switch automatique
- 📊 **Statistiques système** (CPU, RAM, GPU) en temps réel
- 🔒 **100% local** - vos données restent privées

### 🚧 En Cours de Développement

- Fusion automatique des faits similaires
- Recherche sémantique avancée avec scoring
- Interface de gestion de la mémoire
- Export/Import des souvenirs
- Multi-utilisateurs avec profils

---

## 🚀 Installation

### Prérequis

- **Node.js** 18+ ([Télécharger](https://nodejs.org/))
- **Ollama** avec un modèle LLM ([Installation](https://ollama.ai/))
- **Piper** pour la synthèse vocale (optionnel)
- **GPU recommandé** (testé avec RTX 3060 12GB, mais CPU possible)

### Étapes

1. **Cloner le repository**
   ```bash
   git clone <url-du-repo>
   cd assistant-personnel
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Configurer l'environnement**
   ```bash
   cp .env.example .env
   # Éditer .env avec vos paramètres
   ```

4. **Installer Piper (optionnel pour TTS)**
   ```bash
   # Déjà inclus dans le projet
   # Télécharger une voix française si nécessaire
   ```

5. **Lancer Ollama**
   ```bash
   ollama serve
   # Dans un autre terminal :
   ollama pull qwen2.5:14b  # ou un autre modèle
   ```

6. **Build et démarrage**
   ```bash
   # Mode développement avec hot-reload
   npm run dev
   
   # OU mode production
   npm run build
   npm start
   ```

7. **Accéder à l'interface**
   Ouvrir [http://localhost:3001](http://localhost:3001) dans votre navigateur

---

## ⚙️ Configuration

### Fichier `.env`

```bash
# Hôte Ollama
OLLAMA_HOST=http://localhost:11434

# Modèle LLM à utiliser
MODEL_NAME=qwen2.5:14b

# Port du serveur Express
PORT=3001
```

### Modèles Recommandés

| Modèle | VRAM | Performance | Usage |
|--------|------|-------------|-------|
| `qwen2.5:14b` | ~9GB | Excellent | Recommandé |
| `mistral:7b` | ~5GB | Bon | GPU modeste |
| `llama3.2:3b` | ~2GB | Moyen | CPU/petit GPU |
| `deepseek-r1:14b` | ~10GB | Excellent | Raisonnement avancé |

### Personnalisation

Modifier `src/core/personality.ts` pour ajuster :
- Le ton de Lizzi
- Les règles de mémorisation
- Le comportement général

---

## 🏗️ Architecture

```
assistant-personnel/
├── src/
│   ├── core/
│   │   ├── assistant.ts          # Orchestrateur principal
│   │   ├── personality.ts        # Prompt système de Lizzi
│   │   ├── memory.ts             # Mémoire de conversation (court terme)
│   │   ├── long-term-memory.ts   # Mémoire persistante (faits)
│   │   ├── memory-detector.ts    # Détection intentions de mémorisation
│   │   ├── tools.ts              # Système d'outils (calcul, dates, etc.)
│   │   ├── voice.ts              # Synthèse vocale avec Piper
│   │   └── system-monitor.ts     # Monitoring système (CPU, RAM, GPU)
│   └── server.ts                 # Serveur Express + API REST
├── public/
│   └── index.html                # Interface utilisateur (SPA)
├── data/
│   └── memories.json             # Stockage des faits long terme
├── piper/                        # Binaire Piper TTS
├── piper-voices/                 # Voix françaises
└── package.json
```

### Technologies

- **Backend** : Node.js + Express + TypeScript
- **LLM** : Ollama (API compatible OpenAI)
- **TTS** : Piper (synthèse vocale locale haute qualité)
- **Frontend** : HTML/CSS/JS vanilla avec Markdown-it
- **Mémoire** : JSON (fichier plat, extensible vers SQLite)
- **Monitoring** : systeminformation (Node.js)

---

## 🎮 Utilisation

### Chat Basique

```
Utilisateur : Bonjour Lizzi !
Lizzi : Salut ! 😊 Comment puis-je t'aider aujourd'hui ?

Utilisateur : Calcule 2^10
Lizzi : 2^10 = 1 024
```

### Mémorisation

```
Utilisateur : Je m'appelle Patrick
Lizzi : Enchanté Patrick ! Je vais mémoriser ça.

Utilisateur : Mémorise que j'ai un chat nommé Belphégor
Lizzi : C'est noté ! Tu as un chat qui s'appelle Belphégor 🐱

Utilisateur : Qu'est-ce que tu sais sur moi ?
Lizzi : Voici ce que je sais :
Patrick :
  - s'appelle Patrick
  - possède un chat nommé Belphégor
```

### Outils

#### Calcul Mathématique
```
Utilisateur : Calcule sqrt(144) + cos(pi)
Lizzi : sqrt(144) + cos(pi) = 11
```

#### Dates
```
Utilisateur : Quelle différence entre le 1er janvier 2024 et aujourd'hui ?
Lizzi : Il s'est écoulé 379 jours, soit environ 54 semaines.
```

#### Conversions
```
Utilisateur : Convertis 100 km en miles
Lizzi : 100 km = 62.14 miles
```

### Synthèse Vocale

Cliquer sur l'icône 🔊 à côté d'une réponse pour l'écouter.

---

## 🧠 Système de Mémoire

### Architecture SPO (Sujet-Prédicat-Objet)

Les faits sont stockés sous forme de triplets :

```json
{
  "id": "fact_123",
  "subject": "Patrick",
  "predicate": "possède un chat",
  "object": "Belphégor",
  "createdAt": "2026-01-15T10:00:00Z",
  "updatedAt": "2026-01-15T10:00:00Z"
}
```

### Détection Automatique

Le système détecte automatiquement les phrases comme :
- "Je m'appelle X" → `(Utilisateur, s'appelle, X)`
- "J'ai un chat nommé Y" → `(Patrick, possède un chat, Y)`
- "J'aime le chocolat" → `(Patrick, aime, le chocolat)`
- "J'habite à Paris" → `(Patrick, habite à, Paris)`

### Commandes Manuelles

- `Mémorise que [information]`
- `Retiens que [information]`
- `N'oublie pas que [information]`
- `Qu'est-ce que tu sais sur moi ?`
- `Rappelle-toi de mes souvenirs`

### API REST

```bash
# Récupérer tous les faits
GET /api/facts

# Ajouter un fait
POST /api/facts
{
  "key": "couleur préférée",
  "value": "bleu"
}

# Modifier un fait
PUT /api/facts/:id
{
  "key": "couleur préférée",
  "value": "rouge",
  "subject": "Patrick"
}

# Supprimer un fait
DELETE /api/facts/:id
```

---

## 🛠️ Outils Disponibles

### 1. Calcul Mathématique (`calculate`)

**Capacités** :
- Opérations de base : `+`, `-`, `*`, `/`, `^`
- Fonctions : `sqrt`, `sin`, `cos`, `tan`, `log`, `exp`
- Constantes : `pi`, `e`
- Expressions complexes : `(2 + 3) * sqrt(16) / pi`

**Exemple JSON** :
```json
{
  "tool": "calculate",
  "params": {
    "expression": "2^10 + sqrt(144)"
  }
}
```

### 2. Opérations sur Dates (`date_operations`)

**Opérations** :
- `now` : Date/heure actuelle
- `diff` : Différence entre deux dates
- `add` : Ajouter une durée
- `subtract` : Soustraire une durée
- `format` : Formater une date
- `parse` : Parser une date texte

**Exemple JSON** :
```json
{
  "tool": "date_operations",
  "params": {
    "operation": "diff",
    "date1": "2024-01-01",
    "date2": "2026-01-15"
  }
}
```

### 3. Conversion d'Unités (`convert_units`)

**Unités supportées** :
- Longueur : `m`, `km`, `mile`, `inch`, `foot`
- Poids : `kg`, `g`, `lb`, `oz`
- Température : `celsius`, `fahrenheit`, `kelvin`
- Volume : `L`, `mL`, `gallon`, `cup`

**Exemple JSON** :
```json
{
  "tool": "convert_units",
  "params": {
    "value": 100,
    "from": "km",
    "to": "mile"
  }
}
```

---

## ⚠️ Problèmes Connus & Solutions

### 1. ✅ Erreurs TypeScript au Build (CORRIGÉ)

**Symptômes** :
```
error TS2339: Property 'save' does not exist on type 'LongTermMemory'
error TS2339: Property 'key' does not exist on type 'MemoryResult'
```

**Cause** : Incompatibilité entre interfaces et appels de méthodes

**Solution appliquée** :
- Remplacé `save()` par `add()` avec les bons paramètres
- Utilisé `predicate/object/subject` au lieu de `key/value`
- Ajouté le 4ème paramètre à `updateFact()`

✅ **Le build passe maintenant sans erreur**

### 2. 🔧 Doublons en Mémoire Long Terme

**Symptômes** :
```json
{"predicate": "aime", "object": "spaghettis"},
{"predicate": "aime", "object": "frites"},
{"predicate": "aime", "object": "poisson"}
// ... 6 faits "aime" au lieu d'un seul groupé
```

**Cause** : Le système ne détecte que les triplets EXACTS identiques, pas les faits similaires

**Solution en cours** :
- Implémentation du système multi-valeurs (voir Évolutions)
- Fusion automatique des prédicats groupables (`aime`, `possède`, etc.)

**Workaround temporaire** :
Supprimer manuellement les doublons via l'API :
```bash
curl -X DELETE http://localhost:3001/api/facts/fact_123
```

### 3. 🔧 Prénom Non Géré

**Symptômes** : Tous les faits sont pour "Utilisateur" au lieu de "Patrick"

**Cause** : Le système ne demande pas le prénom et ne remplace pas automatiquement

**Solution en cours** :
- Détection automatique du prénom au premier échange
- Remplacement de "Utilisateur" par le vrai nom dans tous les faits

**Workaround temporaire** :
Dire explicitement : "Je m'appelle Patrick" pour créer le fait identité

### 4. 🔧 Mémoire Contextuelle Limitée

**Symptômes** : Lizzi oublie le contexte après 20 messages

**Cause** : `ConversationMemory` limite à 20 messages (ligne 11 de `memory.ts`)

**Solution** :
Modifier la limite dans le constructeur :
```typescript
constructor(maxMessages: number = 50) {  // Augmenter à 50
```

---

## 🚀 Évolutions Planifiées

### Phase 1 - Fixes Critiques (1-2 jours)

- [x] ✅ Corriger les erreurs TypeScript
- [ ] 🔧 Implémenter le système multi-valeurs pour les prédicats
- [ ] 🔧 Corriger l'affichage des souvenirs (predicate/object)

### Phase 2 - Améliorations (1 semaine)

- [ ] 🔧 Ajouter la détection et demande du prénom utilisateur
- [ ] 🔧 Implémenter la fusion automatique des faits similaires
- [ ] 🔧 Améliorer la recherche sémantique avec scoring
- [ ] 🔧 Ajouter des tests unitaires

### Phase 3 - Évolutions (2 semaines)

- [ ] 🔧 Interface web de gestion des faits (CRUD complet)
- [ ] 🔧 Outil `manage_memory` (fusion, nettoyage, export)
- [ ] 🔧 Migration automatique de l'ancien format
- [ ] 🔧 Support multi-utilisateurs avec profils
- [ ] 🔧 Chiffrement des données sensibles

### Phase 4 - Fonctionnalités Avancées (1 mois)

- [ ] 🔧 Base de données SQLite pour meilleures performances
- [ ] 🔧 Recherche vectorielle avec embeddings
- [ ] 🔧 Intégration calendrier (Google Calendar, Outlook)
- [ ] 🔧 Rappels et notifications
- [ ] 🔧 Plugins système (recherche fichiers, commandes système)
- [ ] 🔧 Mode vocal complet (STT + TTS)

---

## 👨‍💻 Développement

### Structure du Code

```typescript
// Ajouter un nouvel outil
// src/core/tools.ts

this.tools.set('mon_outil', {
  name: 'mon_outil',
  description: 'Description de l\'outil',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '...' }
    },
    required: ['param1']
  },
  execute: async (params) => {
    // Logique de l'outil
    return {
      success: true,
      result: 'Résultat'
    };
  }
});
```

### Scripts Utiles

```bash
# Développement avec hot-reload
npm run dev

# Build TypeScript
npm run build

# Production
npm start

# Nettoyage
rm -rf dist/ node_modules/
npm install
npm run build

# Vérifier la santé du serveur
curl http://localhost:3001/api/health

# Tester la mémorisation
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Je m'\''appelle Patrick"}'
```

### Logs et Debugging

Les logs importants apparaissent dans la console :
```
📂 Initialisation mémoire : /path/to/data
💾 12 souvenirs chargés.
🎯 Pattern matched: {...}
✅ Nouveau fait créé: {...}
```

---

## 📚 Ressources

### Documentation

- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Piper TTS](https://github.com/rhasspy/piper)
- [Math.js](https://mathjs.org/docs/)
- [Markdown-it](https://markdown-it.github.io/)

### Modèles LLM

- [Ollama Library](https://ollama.ai/library)
- [Qwen 2.5](https://ollama.ai/library/qwen2.5)
- [Mistral](https://ollama.ai/library/mistral)
- [DeepSeek R1](https://ollama.ai/library/deepseek-r1)

### Voix Piper

- [Piper Voices](https://github.com/rhasspy/piper/releases)
- Recommandé : `fr_FR-upmc-medium` (voix française naturelle)

---

## 🐛 Rapport de Bugs

Pour signaler un bug :

1. Vérifier les [problèmes connus](#problèmes-connus--solutions)
2. Consulter les logs du serveur
3. Créer une issue avec :
   - Version de Node.js (`node -v`)
   - Modèle Ollama utilisé
   - Message d'erreur complet
   - Étapes pour reproduire

---

## 🤝 Contributions

Les contributions sont les bienvenues !

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

### Guidelines

- Suivre le style TypeScript existant
- Ajouter des commentaires pour la logique complexe
- Tester avant de commit
- Mettre à jour la documentation si nécessaire

---

## 📄 Licence

MIT License - voir le fichier [LICENSE](LICENSE)

---

## 👤 Auteur

Projet créé pour un assistant personnel local et privé.

**Testé avec** :
- Node.js 20.x
- Ollama 0.5.x
- GPU RTX 3060 12GB
- Ubuntu 22.04 / Windows 11

---

## 🙏 Remerciements

- [Ollama](https://ollama.ai/) pour l'infrastructure LLM locale
- [Piper](https://github.com/rhasspy/piper) pour la synthèse vocale
- [Math.js](https://mathjs.org/) pour les calculs avancés
- La communauté open source

---

## 📞 Support

Pour toute question :
- 📖 Consulter ce README
- 🐛 Ouvrir une issue GitHub
- 💬 Discussions dans l'onglet Discussions

**Dernière mise à jour** : 15 janvier 2026
