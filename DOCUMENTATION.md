# Documentation Technique — Lizzi, Assistant Personnel Local

> Version 1.0.0 — Février 2026

---

## Table des matières

1. [Présentation du projet](#1-présentation-du-projet)
2. [Pré-requis et installation](#2-pré-requis-et-installation)
3. [Configuration](#3-configuration)
4. [Architecture générale](#4-architecture-générale)
5. [Modules détaillés](#5-modules-détaillés)
6. [Système de mémoire long terme](#6-système-de-mémoire-long-terme)
7. [Système d'outils](#7-système-doutils)
8. [API REST](#8-api-rest)
9. [Pipeline de traitement d'un message](#9-pipeline-de-traitement-dun-message)
10. [Interface utilisateur](#10-interface-utilisateur)
11. [Démarrage et déploiement](#11-démarrage-et-déploiement)
12. [Tests](#12-tests)
13. [Étendre le projet](#13-étendre-le-projet)
14. [Glossaire](#14-glossaire)

---

## 1. Présentation du projet

### 1.1 Qu'est-ce que Lizzi ?

Lizzi est un assistant personnel conversationnel **100 % local** — aucune donnée ne quitte la machine. Il tourne entièrement sur du matériel personnel et utilise exclusivement des modèles open source. Les échanges restent privés, hors ligne, et entièrement sous contrôle de l'utilisateur.

Lizzi se distingue d'un simple chatbot par plusieurs capacités :

- **Mémoire persistante** : elle mémorise des faits sur l'utilisateur entre les sessions (préférences, animaux, habitudes…) et les retrouve par similarité sémantique.
- **Reconnaissance et synthèse vocale** : elle comprend la voix via Whisper.cpp et répond avec une voix française naturelle via Piper.
- **Outils intégrés** : calculatrice, opérations de dates, conversion d'unités, recherche web locale et gestion de l'agenda.
- **Agenda local** : création, consultation et suppression d'événements, sans aucune connexion à un service cloud.

### 1.2 Philosophie technique

Le projet suit trois principes :

| Principe | Traduction concrète |
|---|---|
| **Localité** | LLM servi par `llama.cpp`, embeddings sur un second serveur local, TTS/STT binaires locaux |
| **Minimalisme** | Pas de base de données : JSON pour les faits, JSON pour l'agenda |
| **Typage strict** | TypeScript avec `strict: true`, interfaces explicites, `any` banni sauf cas impossibles à éviter |

### 1.3 Capacités résumées

| Domaine | Capacité |
|---|---|
| Conversation | Multi-tours avec historique de 20 messages |
| Mémoire | Stockage et recherche vectorielle de faits (format SPO) |
| Voix (STT) | Transcription via Whisper.cpp, modèle `ggml-base` (~2-3 s) |
| Voix (TTS) | Synthèse via Piper, voix `fr_FR-siwis-medium` |
| Calcul | Expressions mathématiques complètes via Math.js |
| Dates | Différences, ajouts, formatage |
| Conversions | Unités de longueur, masse, température, volume |
| Recherche web | Via SearXNG (instance locale) |
| Agenda | CRUD complet sur `data/calendar.json` |
| Monitoring | CPU, RAM, VRAM (nvidia-smi) |

---

## 2. Pré-requis et installation

### 2.1 Matériel recommandé

| Composant | Minimum | Recommandé |
|---|---|---|
| RAM | 8 Go | 16 Go |
| GPU VRAM | 6 Go (CPU possible) | 12 Go (RTX 3060) |
| Stockage | 10 Go libres | 20 Go |
| CPU | x86-64 quad-core | 8+ cœurs |

> Le projet a été testé sur Ubuntu 22.04 avec une RTX 3060 12 Go. Il fonctionne sur CPU uniquement, mais les temps de génération sont nettement plus longs (×5 à ×10).

### 2.2 Logiciels requis

#### Node.js 18+

```bash
# Vérifier la version
node -v   # doit afficher v18.x ou supérieur
npm -v
```

#### llama.cpp (serveur LLM)

`llama-server` doit être installé et accessible dans le `PATH`. Il expose une API compatible OpenAI sur les ports 11434 (chat) et 11435 (embeddings).

```bash
# Vérifier l'installation
llama-server --version
```

#### ffmpeg (conversion audio)

Requis pour convertir le WebM du navigateur en WAV 16 kHz mono avant transcription Whisper.

```bash
sudo apt install ffmpeg   # Debian/Ubuntu
brew install ffmpeg        # macOS
```

#### Piper (TTS — inclus dans le repo)

Le binaire `piper/piper` et les voix `piper-voices/` sont inclus. Aucune installation supplémentaire.

#### Whisper.cpp (STT — inclus dans le repo)

Le binaire `whisper-cpp/build/bin/whisper-cli` et le modèle `ggml-base.bin` sont inclus.

#### SearXNG (optionnel — recherche web)

Instance locale SearXNG sur `http://localhost:8006`. Non bloquant si absent : l'outil `web_search` retourne simplement une erreur.

#### nvidia-smi (optionnel — monitoring GPU)

Inclus avec les drivers NVIDIA. Si absent, le monitoring VRAM est désactivé silencieusement.

### 2.3 Installation pas à pas

```bash
# 1. Cloner le repository
git clone <url-du-repo>
cd assistant-personnel

# 2. Installer les dépendances Node
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Éditer .env selon votre configuration (voir section 3)

# 4. Compiler TypeScript
npm run build

# 5. Télécharger les modèles LLM (exemple avec des modèles GGUF)
# Placer les fichiers .gguf dans $MODELS_DIR (défini dans .env)

# 6. Lancer tout le stack
./start.sh
```

---

## 3. Configuration

Toute la configuration passe par le fichier `.env` à la racine du projet.

### 3.1 Variables disponibles

```bash
# ── LLM Chat ────────────────────────────────────────────────────────────────
# URL du serveur llama.cpp (API /v1/chat/completions)
LLM_HOST=http://localhost:11434

# Nom du modèle GGUF utilisé (tel que passé à --model de llama-server)
MODEL_NAME=Ministral-3-8B-Reasoning-2512-Q4_K_M.gguf

# Taille du contexte en tokens (doit correspondre à --ctx-size de llama-server)
CTX_SIZE=4096

# ── Embeddings ──────────────────────────────────────────────────────────────
# URL du serveur llama.cpp dédié aux embeddings (API /v1/embeddings)
EMBEDDING_HOST=http://localhost:11435

# Modèle d'embedding utilisé (jina, nomic-embed, etc.)
EMBEDDING_MODEL=jina-embeddings-v2-small-en-Q5_K_M.gguf

# ── Application ─────────────────────────────────────────────────────────────
# Port du serveur Express
PORT=3001

# Passer à true pour démarrer en HTTPS (nécessite certs/key.pem et certs/cert.pem)
USE_HTTPS=false

# ── Outils ──────────────────────────────────────────────────────────────────
# URL de l'instance SearXNG locale (pour l'outil web_search)
SEARXNG_URL=http://localhost:8006

# ── Modèles sur disque ──────────────────────────────────────────────────────
# Dossier contenant les fichiers .gguf
MODELS_DIR=$HOME/.var/app/llama-server/models
```

### 3.2 Modèles GGUF recommandés

| Modèle | VRAM | Qualité | Cas d'usage |
|---|---|---|---|
| Ministral-3B Q4_K_M | ~3 Go | Bon | Réponses rapides |
| Mistral-7B Q4_K_M | ~5 Go | Très bon | Usage général |
| Qwen2.5-14B Q4_K_M | ~9 Go | Excellent | Compréhension fine |
| DeepSeek-R1-14B Q4_K_M | ~10 Go | Excellent | Raisonnement |

**Modèle d'embedding recommandé** : `jina-embeddings-v2-small-en` (82M paramètres, 512 dimensions, très rapide) ou `nomic-embed-text-v1.5` (768 dimensions, meilleure précision sémantique).

### 3.3 HTTPS (optionnel)

Pour accéder au micro depuis un autre appareil du réseau, HTTPS est obligatoire (exigence des navigateurs pour `getUserMedia`).

```bash
# Générer des certificats auto-signés avec mkcert
mkcert -install
mkcert localhost 192.168.1.xx

# Placer les fichiers
mkdir -p certs
cp localhost+1.pem certs/cert.pem
cp localhost+1-key.pem certs/key.pem

# Activer HTTPS dans .env
USE_HTTPS=true
```

---

## 4. Architecture générale

### 4.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────┐
│                      Navigateur (SPA)                        │
│  HTML/CSS/JS vanilla · Markdown-it · Push-to-talk (ESPACE)   │
└───────────────────────┬──────────────────────────────────────┘
                        │ HTTP/HTTPS + REST
┌───────────────────────▼──────────────────────────────────────┐
│                   Express (server.ts)                        │
│  Routes REST · Session TTL · Middleware CORS / JSON          │
└───┬──────────┬──────────┬──────────┬────────────┬────────────┘
    │          │          │          │            │
    ▼          ▼          ▼          ▼            ▼
Assistant  VoiceService Speech    SystemMonitor  LocalCalendar
(chat)     (Piper TTS)  (Whisper  (nvidia-smi   (calendar.json)
                         STT)      /proc)
    │
    ├── LlamaCppClient ──► llama-server :11434  (chat)
    ├── LlamaCppClient ──► llama-server :11435  (embeddings)
    ├── LongTermMemory ──► data/memories.json   (faits SPO)
    ├── ConversationMemory                       (historique)
    ├── MemoryDetector                           (détection intention)
    ├── SemanticExtractor ─► llama-server :11434 (extraction SPO)
    └── ToolSystem
            ├── calculate       (mathjs)
            ├── date_operations (Date JS)
            ├── convert_units   (calculs inline)
            ├── web_search      (SearXNG :8006)
            ├── manage_memory   (LongTermMemory)
            └── calendar        (LocalCalendar)
```

### 4.2 Flux de données — une requête de chat

```
Utilisateur tape / parle
        │
        ▼
[SPA] POST /api/chat { message, sessionId }
        │
        ▼
[server.ts] getDefaultAssistant()
        │
        ▼
[assistant.ts] chat(message)
    1. Récupérer le nom de l'utilisateur (LongTermMemory)
    2. Détecter intention mémorisation (MemoryDetector)
       └─ oui → SemanticExtractor → LongTermMemory.add/update
    3. Détecter intention calendrier (regex)
       └─ oui → LocalCalendar.createEvent / deleteEvent
    4. Élargir la requête (expandQuery)
    5. Générer l'embedding de la requête (LlamaCppClient :11435)
    6. Recherche vectorielle dans LongTermMemory (cosinus)
    7. Construire le prompt (SYSTEM + mémoire + historique)
    8. Appel LLM (LlamaCppClient :11434)
    9. Nettoyer la réponse (balises <think>, marqueurs…)
   10. Détecter appel d'outil (JSON dans la réponse)
       └─ oui → ToolSystem.executeTool → second appel LLM
        │
        ▼
[server.ts] res.json({ message, calendarAction? })
        │
        ▼
[SPA] Affichage Markdown · bouton TTS
```

### 4.3 Structure des dossiers

```
assistant-personnel/
├── src/
│   ├── server.ts               # Serveur Express, routes REST
│   └── core/
│       ├── assistant.ts        # Orchestrateur central
│       ├── personality.ts      # System prompt de Lizzi
│       ├── memory.ts           # Mémoire de conversation (court terme)
│       ├── long-term-memory.ts # Mémoire persistante, recherche vectorielle
│       ├── memory-detector.ts  # Détection intention de mémorisation
│       ├── semantic-extractor.ts # Extraction de triplets S-P-O via LLM
│       ├── llm-client.ts       # Client API llama.cpp (chat + embeddings)
│       ├── tools.ts            # Système d'outils (6 outils)
│       ├── voice.ts            # Synthèse vocale Piper
│       ├── speech.ts           # Reconnaissance vocale Whisper.cpp
│       ├── system-monitor.ts   # Monitoring CPU / RAM / VRAM
│       └── local-calendar.ts   # Agenda local (CRUD JSON)
├── public/
│   └── index.html              # Interface SPA (tout-en-un)
├── data/
│   ├── memories.json           # Faits long terme (SPO)
│   └── calendar.json           # Événements agenda
├── piper/                      # Binaire Piper TTS
├── piper-voices/               # Voix françaises ONNX
├── whisper-cpp/                # Binaire Whisper + modèles
├── certs/                      # Certificats SSL (optionnel)
├── tests/                      # Tests unitaires Vitest
├── dist/                       # Build TypeScript (généré)
├── start.sh                    # Script de démarrage complet
├── stop.sh                     # Script d'arrêt
├── .env                        # Variables d'environnement (non commité)
├── .env.example                # Modèle de configuration
├── package.json
└── tsconfig.json
```

---

## 5. Modules détaillés

### 5.1 `server.ts` — Serveur HTTP/HTTPS

Point d'entrée de l'application. Gère :

- **Express** avec middleware CORS et `json({ limit: '50mb' })` (pour les fichiers audio encodés en base64).
- **Sessions avec TTL** : chaque session est identifiée par un `sessionId`. Les sessions inactives depuis plus de 30 minutes sont purgées automatiquement (vérification toutes les 10 minutes via `setInterval`).
- **Serveur dual HTTP/HTTPS** : selon la variable `USE_HTTPS`, démarre un serveur `http` ou un serveur `https` avec les certificats du dossier `certs/`.
- **Static serving** : sert le frontend depuis le dossier `public/`.

### 5.2 `assistant.ts` — Orchestrateur

Classe centrale `Assistant`. Possède une instance unique par session (singleton via `Map<string, Assistant>` dans `server.ts`) mais partage la **mémoire long terme** entre toutes les sessions via `static sharedLongTermMemory`.

**Responsabilités** :
1. Initialiser tous les sous-systèmes (`initialize()`).
2. Orchestrer le flux de traitement de chaque message (`chat()`).
3. Exposer les méthodes CRUD sur les faits pour l'API REST.
4. Détecter et router les intentions calendrier sans passer par le LLM (regex rapides).

**État interne** :
- `hasAskedName : boolean` — évite de demander le prénom deux fois.
- `pendingDeletion : { event: LocalEvent } | null` — confirmation à deux étapes pour la suppression d'un événement.
- `CTX_SIZE` et `MAX_TOKENS` — contrôle la saturation du contexte.

**Estimation des tokens** : utilisée pour éviter de dépasser la fenêtre de contexte. L'approximation retenue est **4 caractères ≈ 1 token** — suffisamment précise pour de la gestion de seuil.

### 5.3 `personality.ts` — Identité de Lizzi

Contient uniquement la constante `SYSTEM_PROMPT` : le prompt système injecté en tête de chaque appel LLM. Il définit :

- L'identité de Lizzi (prénom, personnalité, règles de tutoiement).
- Les règles strictes de mémorisation (interdiction d'inventer).
- Les règles de style (2-3 phrases max, pas de code sauf si demandé explicitement).
- Les règles d'utilisation des balises (ne pas générer de marqueurs système).

Ce fichier est le **seul endroit à modifier** pour changer le comportement de base de Lizzi.

### 5.4 `memory.ts` — Mémoire de conversation

Classe `ConversationMemory` : gère l'historique des échanges du tour en cours.

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
```

- Fenêtre glissante de **20 messages** (configurable dans le constructeur).
- Si la limite est dépassée, les messages les plus anciens sont supprimés (`slice(-maxMessages)`).
- Méthodes : `addMessage()`, `getMessages()`, `clear()`.

### 5.5 `llm-client.ts` — Client LLM

Classe `LlamaCppClient` : couche mince sur l'API OpenAI-compatible de `llama-server`.

Deux méthodes :

**`chat(params)`** — POST vers `/v1/chat/completions`
```typescript
{
  messages: Message[];
  options?: {
    temperature?: number;   // défaut 0.7
    max_tokens?: number;    // défaut -1 (illimité)
    stop?: string[];
    top_p?: number;
  }
}
```

**`embeddings(params)`** — POST vers `/v1/embeddings`
```typescript
{
  model?: string;
  prompt: string;
}
// → { embedding: number[] }
```

En cas d'erreur d'embedding, retourne un vecteur nul de 512 dimensions pour ne pas bloquer le flux.

### 5.6 `long-term-memory.ts` — Mémoire persistante

Voir [Section 6](#6-système-de-mémoire-long-terme) pour la description complète.

### 5.7 `memory-detector.ts` — Détection d'intention

Classe `MemoryDetector` : détermine si un message utilisateur exprime une **intention explicite de mémorisation**, sans appel LLM (règles basées sur des mots-clés et regex).

**Priorité d'exclusion** : si le message contient un mot relatif à l'agenda (rendez-vous, calendrier) ou une date/heure précise, la détection court-circuite et retourne `false` — c'est une intention calendrier, pas mémorisation.

**Mots-clés d'action** : `mémorise`, `enregistre`, `note`, `retiens`, `souviens-toi`, `apprends`, `stocke`, `garde en mémoire`, `inscris`.

**Patterns de phrases** : `C'est important...`, `Je voudrais que tu te souviennes...`, `Peux-tu noter que...`, etc.

**Identité** : `Je m'appelle…`, `Mon nom est…` déclenchent toujours la mémorisation.

### 5.8 `semantic-extractor.ts` — Extraction sémantique

Classe `SemanticExtractor` : transforme une phrase en **triplet SPO** (Sujet, Prédicat, Objet) via un appel LLM avec `temperature: 0.1`.

Le prompt demande au modèle de :
1. Ignorer les mots d'action (`mémorise`, `note`, etc.).
2. Identifier le sujet réel (substituer `je`/`moi` par le prénom de l'utilisateur).
3. Utiliser un prédicat simple au présent.
4. Retourner **uniquement** du JSON.

Exemple :
```
Entrée : "Mémorise que mon chat s'appelle Belphégor"
Sortie : { "subject": "Patrick", "predicate": "a un chat nommé", "object": "Belphégor" }
```

Le prédicat est ensuite normalisé (`normalizePredicate`) pour retirer les pronoms résiduels.

### 5.9 `tools.ts` — Système d'outils

Voir [Section 7](#7-système-doutils) pour la description complète.

### 5.10 `voice.ts` — Synthèse vocale (TTS)

Classe `VoiceService` : génère des fichiers WAV à partir de texte via le binaire `piper`.

**Flux** :
1. Nettoyage du texte (`cleanTextForSpeech`) : suppression des emojis (regex `static readonly`), du Markdown, des balises HTML, des ZWJ.
2. Spawn du processus `piper` avec le modèle ONNX.
3. Envoi du texte nettoyé sur `stdin` de Piper.
4. Sauvegarde du WAV dans `public/audio/lizzi_<timestamp>.wav`.
5. Retourne l'URL relative `/audio/lizzi_<timestamp>.wav`.

Timeout de 30 secondes. Cleanup automatique (garde les 50 derniers fichiers WAV).

**Voix utilisée** : `fr_FR-siwis-medium` — voix française féminine, naturelle.

### 5.11 `speech.ts` — Reconnaissance vocale (STT)

Classe `SpeechRecognition` : transcrit l'audio en texte via `whisper-cli`.

**Flux** :
1. Réception du buffer audio (WebM encodé en base64 depuis le navigateur).
2. Sauvegarde en RAM (`/dev/shm/assistant-audio/`) pour éviter les I/O disque.
3. Conversion WebM → WAV 16 kHz mono via `ffmpeg`.
4. Génération d'un prompt contextuel enrichi (cache TTL 5 minutes) avec les noms propres issus de la mémoire.
5. Spawn de `whisper-cli` avec options : 8 threads, langue française, no timestamps, no prints.
6. Extraction du texte brut depuis la sortie stdout.
7. Cleanup automatique (garde les 10 derniers WAV).

Timeout de 60 secondes. Modèle utilisé : `ggml-base.bin` (meilleur compromis vitesse/précision, ~2-3 s).

### 5.12 `system-monitor.ts` — Monitoring système

Classe `SystemMonitor` : agrège les métriques système au moment de l'appel.

| Source | Métriques |
|---|---|
| `nvidia-smi` | VRAM utilisée, VRAM totale, pourcentage |
| `/proc/meminfo` | RAM utilisée, RAM totale, pourcentage |
| `process.memoryUsage()` | Heap Node.js utilisé / total |

Si `nvidia-smi` est absent, la VRAM est reportée à 0 (pas d'erreur).

### 5.13 `local-calendar.ts` — Agenda local

Classe `LocalCalendarClient` : gestion d'un agenda simple persisté dans `data/calendar.json`.

Chaque événement suit l'interface `LocalEvent` (compatible avec le format Google Calendar) :

```typescript
interface LocalEvent {
  id: string;            // UUID v4
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };  // ISO 8601
  end:   { dateTime?: string; date?: string };
  created: string;
  updated: string;
}
```

**Opérations** : `getEvents()`, `searchEvents()`, `createEvent()`, `updateEvent()`, `deleteEvent()`.

**Sécurité d'écriture** : un mécanisme de verrou (`saveLock: Promise<void>`) chaîne les écritures asynchrones pour éviter les conditions de course.

**Filtrage** : `getEvents()` supporte `timeMin`/`timeMax` pour filtrer par plage de dates. Les résultats sont triés chronologiquement.

---

## 6. Système de mémoire long terme

### 6.1 Format des faits (Sujet-Prédicat-Objet)

La mémoire long terme stocke des **faits atomiques** au format SPO (Sujet-Prédicat-Objet), dérivé des graphes de connaissances. Chaque fait est identifié par un ID unique et horodaté.

```json
{
  "id": "fact_1706000000000",
  "subject": "Patrick",
  "predicate": "a un chat nommé",
  "objects": ["Belphégor"],
  "isMultiValue": true,
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T10:00:00.000Z"
}
```

Le champ `objects` est un tableau : un fait peut avoir plusieurs valeurs (ex. `aime : ["spaghettis", "pizza", "chocolat"]`). La propriété `isMultiValue` indique si le prédicat accepte plusieurs valeurs ou non.

**Prédicats à valeur unique** (remplacement au lieu de fusion) : `s'appelle`, `nom`, `habite`, `vit à`, `travaille`, `est né`, `âge`, `est`, `mesure`, `pèse`.

### 6.2 Stockage et vectorisation

`data/memories.json` est le fichier de persistance. Au démarrage, chaque fait est **vectorisé** par le modèle d'embedding pour permettre la recherche sémantique.

**Optimisation** : la vectorisation se fait en parallèle par **batch de 5 faits** (`Promise.all`), ce qui réduit le temps de démarrage d'un facteur ~5 par rapport à un traitement séquentiel.

Les vecteurs sont conservés en mémoire dans `vectorCache : Map<string, number[]>`. En cas de vecteur manquant lors d'une recherche, il est régénéré à la volée.

### 6.3 Recherche sémantique

Lors de chaque message, la requête est :

1. **Élargie** (`expandQuery`) : synonymes ajoutés selon le thème détecté (identité, animaux, goûts…).
2. **Vectorisée** par le modèle d'embedding.
3. **Comparée** à tous les vecteurs en cache par **similarité cosinus**.

```typescript
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    mA  += vecA[i] * vecA[i];
    mB  += vecB[i] * vecB[i];
  }
  return Math.sqrt(mA) * Math.sqrt(mB) === 0 ? 0 : dot / (Math.sqrt(mA) * Math.sqrt(mB));
}
```

Le seuil par défaut est **0.35** (assez bas pour être permissif). Les résultats sont triés par score décroissant.

**Fallbacks** : si la recherche vectorielle ne retourne rien, 4 stratégies de repli sont appliquées dans l'ordre (identité, tous les faits utilisateur, animaux, goûts) avec un seul appel `getAll()` partagé (lazy cache local).

### 6.4 Injection dans le prompt

Les faits pertinents sont injectés dans le system prompt dans une section délimitée :

```
═══════════════════════════════════════
        MÉMOIRE LONG TERME
═══════════════════════════════════════

👤 Utilisateur : Patrick

📋 FAITS CONNUS (UTILISE CES INFORMATIONS EXACTEMENT) :
  • s'appelle : Patrick
  • a un chat nommé : Belphégor
  • aime : spaghettis, chocolat [TOTAL: 2]
═══════════════════════════════════════
```

Le style de formatage est volontairement très visible pour que le LLM le traite en priorité.

### 6.5 Sauvegarde

La méthode `saveToFile()` est appelée avec un **debounce de 500 ms** (`scheduleSave()`). Cela évite des écritures disque répétitives lors d'opérations en rafale (ex. import de faits).

---

## 7. Système d'outils

### 7.1 Architecture

Le `ToolSystem` enregistre les outils dans une `Map<string, Tool>`. Chaque outil implémente l'interface :

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: object;      // Schéma JSON-Schema-like
  execute: (params: any) => Promise<any>;
}
```

L'invocation se fait en deux temps :
1. Le LLM décide d'utiliser un outil et répond avec un JSON brut : `{"tool":"nom","params":{...}}`.
2. `assistant.ts` détecte ce JSON, exécute l'outil, puis relance le LLM avec le résultat pour qu'il formule une réponse naturelle.

### 7.2 Outils disponibles

#### `calculate` — Calcul mathématique

Utilise la bibliothèque **Math.js** pour évaluer des expressions arbitraires.

```
Supporté : +, -, *, /, ^, sqrt, sin, cos, tan, log, exp, pi, e, ...
Exemple  : "sqrt(144) + 2^10 - cos(pi)"
```

| Paramètre | Type | Requis | Description |
|---|---|---|---|
| `expression` | `string` | ✅ | Expression mathématique à évaluer |

#### `date_operations` — Opérations sur les dates

| Opération | Description | Paramètres supplémentaires |
|---|---|---|
| `now` | Date/heure actuelle formatée | — |
| `diff` | Différence entre deux dates | `date1`, `date2` (ISO 8601 ou texte naturel) |
| `add` | Ajouter une durée | `date`, `amount`, `unit` (days/weeks/months/years) |
| `subtract` | Soustraire une durée | `date`, `amount`, `unit` |
| `format` | Formater une date | `date`, `locale` (optionnel) |
| `parse` | Parser une date texte | `text` |

#### `convert_units` — Conversion d'unités

| Catégorie | Unités supportées |
|---|---|
| Longueur | `m`, `km`, `cm`, `mm`, `mile`, `yard`, `foot`, `inch` |
| Masse | `kg`, `g`, `mg`, `lb`, `oz` |
| Température | `celsius`, `fahrenheit`, `kelvin` |
| Volume | `L`, `mL`, `gallon`, `cup`, `fluid_oz` |

| Paramètre | Type | Requis |
|---|---|---|
| `value` | `number` | ✅ |
| `from` | `string` | ✅ |
| `to` | `string` | ✅ |

#### `web_search` — Recherche web

Interroge l'instance SearXNG locale. Retourne les N premiers résultats (titre, URL, extrait).

| Paramètre | Type | Requis | Défaut |
|---|---|---|---|
| `query` | `string` | ✅ | — |
| `max_results` | `number` | ❌ | 5 |

#### `manage_memory` — Gestion de la mémoire long terme

Permet au LLM (via l'utilisateur) de gérer directement les faits mémorisés.

| Action | Description |
|---|---|
| `list` | Retourne tous les faits |
| `search` | Recherche par similarité sémantique (`query`) |
| `delete` | Supprime un fait par `id` |
| `update` | Met à jour un fait existant (`id`, `subject`, `predicate`, `objects`) |

#### `calendar` — Agenda local

| Action | Description |
|---|---|
| `create` | Crée un événement (`summary`, `start`, `end`, `description?`, `location?`) |
| `list` | Liste les événements sur une période (`timeMin?`, `timeMax?`, `maxResults?`) |
| `search` | Recherche textuelle dans les événements (`query`) |
| `delete` | Supprime un événement (`eventId`) |
| `show` | Ouvre la vue calendrier dans l'interface (`year`, `month`) |

---

## 8. API REST

Le serveur expose les routes suivantes. Toutes les routes API retournent du JSON.

### 8.1 Chat

```
POST /api/chat
Body : { "message": string, "sessionId"?: string }
Réponse : {
  "response": string,
  "sessionId": string,
  "calendarAction"?: { "year": number, "month": number }
}
```

### 8.2 Mémoire de conversation

```
POST /api/clear
Body : { "sessionId"?: string }
Réponse : { "success": true }
```

### 8.3 Santé

```
GET /api/health
Réponse : { "status": "ok", "timestamp": string }
```

### 8.4 Faits long terme

```
GET    /api/facts                          # Tous les faits
POST   /api/facts                          # Créer un fait
       Body : { "predicate", "objects"|"value", "subject"? }
PUT    /api/facts/:id                      # Modifier un fait
       Body : { "predicate", "objects", "subject"? }
DELETE /api/facts/:id                      # Supprimer un fait
GET    /api/facts/search?q=<requête>       # Recherche sémantique
```

### 8.5 Synthèse vocale

```
POST /api/speak
Body : { "text": string }
Réponse : { "success": true, "audioUrl": string }
```

Le fichier audio est servi statiquement depuis `/audio/<filename>.wav`.

### 8.6 Transcription vocale

```
POST /api/transcribe
Body : { "audio": string }   // base64 du fichier WebM
Réponse : { "text": string }
```

### 8.7 Statistiques système

```
GET /api/system/stats
Réponse : {
  "success": true,
  "stats": {
    "vram": { "used": number, "total": number, "percentage": number, "unit": "MiB" },
    "ram":  { "used": number, "total": number, "percentage": number },
    "process": { "heapUsed": number, "heapTotal": number }
  },
  "model": { "name": string, "size": string }
}
```

### 8.8 Agenda

```
GET /api/calendar/status
Réponse : { "configured": true, "connected": boolean, "type": "local" }

GET /api/calendar/events?year=2026&month=2
Réponse : { "connected": boolean, "events": LocalEvent[], "year": number, "month": number }
```

---

## 9. Pipeline de traitement d'un message

Voici le détail complet du flux dans `assistant.chat()` pour un message ordinaire (hors mémorisation et calendrier).

```
Message reçu : "Qu'est-ce que j'aime comme nourriture ?"
                │
                ▼
1. getUserName()           → Patrick  (depuis LongTermMemory)

2. hasAskedName check      → name existe, pas de demande de prénom

3. pendingDeletion check   → null, pas de confirmation en attente

4. MemoryDetector.detect() → false (pas de mot-clé de mémorisation)

5. isCalendarCreateIntent()→ false (pas de date)

6. isCalendarShowIntent()  → false

7. expandQuery()
   "Qu'est-ce que j'aime comme nourriture ?"
   → "j'aime nourriture aime préfère adore apprécie"

8. LlamaCppClient.embeddings(expandedQuery)
   → vecteur float32[512]   (≈ 50-200 ms)

9. LongTermMemory.vectorSearch(vector, threshold=0.35)
   → [] (score < 0.35)

10. Fallback 4 : /aime|préfère|goûts|aliments|nourriture/
    allFacts (appel unique) → filtrage
    → [{ predicate: "aime", objects: ["spaghettis", "chocolat"] }]

11. Construction du contexte mémoire (string) :
    "MÉMOIRE LONG TERME\n👤 Patrick\n• aime : spaghettis, chocolat"

12. Estimation tokens prompt :
    systemPrompt + dateContext + mémoire + historique ≈ 800 tokens
    disponibles pour réponse : 4096 - 800 - 50 = 3246 tokens

13. LlamaCppClient.chat(messages, { temperature: 0.3, max_tokens: 1500 })
    → "Tu aimes les spaghettis et le chocolat 🍫"   (≈ 1-5 s)

14. Nettoyage réponse :
    - Suppression balises <think>...</think>
    - Suppression marqueurs ### User / ### Assistant
    - Normalisation des retours à la ligne

15. detectToolCall(response) → null (pas de JSON outil)

16. memory.addMessage('user', message)
    memory.addMessage('assistant', response)

17. Retour : { message: "Tu aimes les spaghettis et le chocolat 🍫" }
```

---

## 10. Interface utilisateur

L'interface est une **Single Page Application** contenue dans `public/index.html` (HTML/CSS/JS vanilla, sans framework).

### 10.1 Fonctionnalités

| Fonctionnalité | Détail |
|---|---|
| **Chat** | Messages rendus en Markdown (Markdown-it + highlight.js) |
| **Mode sombre** | Toggle manuel + détection automatique `prefers-color-scheme` |
| **TTS** | Bouton 🔊 sur chaque message assistant → appel `/api/speak` |
| **Push-to-Talk** | Maintenir `ESPACE` → enregistrement → relâcher → transcription |
| **Mode bouton micro** | Alternative click-to-record pour les appareils tactiles |
| **Éditeur de faits** | Panel latéral CRUD sur les faits mémorisés |
| **Vue calendrier** | Grille mensuelle avec affichage des événements |
| **Statistiques** | Widget en bas d'écran : RAM, VRAM, modèle actif |
| **Copie de code** | Bouton "Copier" sur chaque bloc de code |

### 10.2 Mode Push-to-Talk

Le Push-to-Talk capture l'audio via `MediaRecorder` (WebM/Opus) sur `ESPACE` maintenu enfoncé. À l'arrêt, le blob est converti en base64 et envoyé à `/api/transcribe`. Le texte transcrit est placé dans le champ de saisie, prêt à être envoyé ou modifié.

**Note** : le micro n'est accessible que via HTTPS sur Chrome/Firefox (sauf `localhost`). En HTTP, seul `localhost` est autorisé.

---

## 11. Démarrage et déploiement

### 11.1 Script `start.sh`

Le script de démarrage orchestre trois processus :

```
start.sh
├── 1. Vérification des fichiers .gguf (CHAT_MODEL, EMBED_MODEL)
├── 2. Libération des ports 11434, 11435, 3001
├── 3. llama-server (chat) sur :11434
│      --ctx-size 4096 --n-gpu-layers 35
├── 4. llama-server (embeddings) sur :11435
│      --embeddings --pooling mean --n-gpu-layers 999 --ctx-size 512
├── 5. Vérification santé des deux serveurs llama
└── 6. npm run dev (tsx watch)
```

Les trois processus sont démarrés en arrière-plan. Un `trap` sur `SIGINT`/`SIGTERM`/`EXIT` arrête tout proprement.

Les logs LLM sont redirigés vers `/tmp/llama-chat.log` et `/tmp/llama-embed.log`.

### 11.2 Modes de démarrage

| Commande | Usage |
|---|---|
| `./start.sh` | Démarrage complet (LLM + app, hot-reload) |
| `npm run dev` | App seule (LLM déjà lancé séparément) |
| `npm run build && npm start` | Production compilée |
| `./stop.sh` | Arrêt de tous les processus |

### 11.3 Variables `llama-server` importantes

| Option | Valeur | Explication |
|---|---|---|
| `--n-gpu-layers 35` | Serveur chat | ~35 couches sur GPU (à ajuster selon la VRAM) |
| `--n-gpu-layers 999` | Serveur embeddings | Toutes les couches sur GPU (modèle petit) |
| `--ctx-size 4096` | Chat | Fenêtre de contexte en tokens |
| `--ctx-size 512` | Embeddings | Suffisant pour la vectorisation de phrases |
| `--pooling mean` | Embeddings | Agrégation des tokens pour l'embedding de la phrase |

### 11.4 Déploiement en production

Pour un usage continu (serveur domotique, NAS…) :

```bash
# Avec systemd
sudo nano /etc/systemd/system/lizzi.service

[Unit]
Description=Lizzi Assistant
After=network.target

[Service]
Type=simple
User=<votre-user>
WorkingDirectory=/chemin/vers/assistant-personnel
ExecStart=/chemin/vers/assistant-personnel/start.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target

sudo systemctl enable lizzi
sudo systemctl start lizzi
```

---

## 12. Tests

### 12.1 Outillage

Les tests utilisent **Vitest** (compatible ESM, syntaxe Jest). Configuration dans `vitest.config.ts`.

```bash
npm test            # Exécute tous les tests une fois
npm run test:watch  # Mode watch (si configuré)
```

### 12.2 Tests existants (20 tests)

**`tests/memory-detector.test.ts`** (10 tests)

Couvre la détection d'intentions :
- Messages vides, mots-clés `mémorise`/`retiens`/`note`, patterns d'identité (`je m'appelle`, `mon nom est`).
- Exclusions : messages contenant des dates ou des références à l'agenda.

**`tests/tools.test.ts`** (10 tests)

Couvre les outils sans dépendance réseau :
- `calculate` : additions, racines carrées, puissances, expressions invalides.
- `date_operations` : opération `now`, différences de dates.
- `convert_units` : conversions km↔miles, celsius↔fahrenheit.

### 12.3 Ajouter un test

```typescript
// tests/mon-module.test.ts
import { describe, it, expect } from 'vitest';
import { MonModule } from '../src/core/mon-module.js';

describe('MonModule', () => {
  it('fait ce qu\'on attend', () => {
    const m = new MonModule();
    expect(m.methode('entrée')).toBe('résultat attendu');
  });
});
```

---

## 13. Étendre le projet

### 13.1 Ajouter un outil

Dans `src/core/tools.ts`, à l'intérieur de `registerTools()` :

```typescript
this.tools.set('mon_outil', {
  name: 'mon_outil',
  description: 'Description courte pour que le LLM sache quand l\'utiliser.',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Description du paramètre' }
    },
    required: ['param1']
  },
  execute: async (params) => {
    try {
      // Logique de l'outil
      return { success: true, result: '...', formatted: 'Réponse lisible' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
});
```

Le LLM sera automatiquement informé de ce nouvel outil via `getToolDescriptions()`.

### 13.2 Modifier la personnalité

Éditer `src/core/personality.ts`. Points clés à personnaliser :

- **Nom** : remplacer `Lizzi` par le nom souhaité.
- **Ton** : ajuster les règles de style (vouvoiement, longueur des réponses…).
- **Contraintes** : modifier les règles de mémorisation ou d'utilisation des outils.

### 13.3 Changer de modèle LLM

1. Télécharger un fichier GGUF dans `$MODELS_DIR`.
2. Mettre à jour `MODEL_NAME` dans `.env`.
3. Ajuster `--n-gpu-layers` dans `start.sh` selon la taille du modèle et la VRAM disponible.
4. Si le nouveau modèle utilise une fenêtre de contexte différente, adapter `CTX_SIZE`.

### 13.4 Changer de modèle d'embedding

1. Télécharger un modèle d'embedding GGUF (formats courants : Jina, nomic-embed, BGE).
2. Mettre à jour `EMBEDDING_MODEL` dans `.env`.
3. **Attention** : si la dimension des embeddings change (ex. 512 → 768), le `vectorCache` existant deviendra incohérent. Supprimer `data/memories.json` et relancer pour revectoriser.

### 13.5 Ajouter une route API

Dans `src/server.ts`, après les routes existantes :

```typescript
app.get('/api/ma-route', async (req, res) => {
  try {
    // logique
    res.json({ success: true, data: '...' });
  } catch (error) {
    console.error('Erreur ma-route:', error);
    res.status(500).json({ error: 'Message d\'erreur' });
  }
});
```

---

## 14. Glossaire

| Terme | Définition |
|---|---|
| **GGUF** | Format de fichier pour les modèles LLM quantifiés (successeur de GGML). Utilisé par `llama.cpp`. |
| **llama.cpp** | Moteur d'inférence LLM en C++. Permet de faire tourner des LLMs localement, avec support GPU via CUDA/Metal/Vulkan. |
| **llama-server** | Serveur HTTP intégré à `llama.cpp`, exposant une API compatible OpenAI (`/v1/chat/completions`, `/v1/embeddings`). |
| **Embedding** | Représentation vectorielle d'un texte dans un espace de haute dimension. Deux textes sémantiquement proches ont des vecteurs proches (similarité cosinus élevée). |
| **SPO** | Sujet-Prédicat-Objet. Format de triplet pour encoder un fait : `(Patrick, aime, le chocolat)`. |
| **Cosine similarity** | Mesure de similarité entre deux vecteurs, indépendante de leur norme. Valeur entre -1 et 1 ; 1 = identiques, 0 = orthogonaux. |
| **Context window** | Nombre maximum de tokens qu'un LLM peut traiter en une seule inférence (prompt + réponse). Au-delà, les tokens les plus anciens sont ignorés. |
| **Quantization (Q4_K_M…)** | Réduction de la précision des poids du modèle (float32 → int4) pour diminuer l'empreinte mémoire au prix d'une légère perte de qualité. Q4_K_M est un bon compromis qualité/taille. |
| **Piper** | Moteur TTS (Text-to-Speech) léger et rapide, développé par Rhasspy. Utilise des modèles ONNX. |
| **Whisper** | Modèle de reconnaissance vocale d'OpenAI. `whisper.cpp` en est le portage en C++, optimisé pour les CPU et GPU locaux. |
| **SearXNG** | Méta-moteur de recherche open source auto-hébergeable. Agrège les résultats de plusieurs moteurs sans traçage. |
| **Push-to-Talk** | Mode d'activation du micro par maintien de touche (`ESPACE`), à la manière d'un talkie-walkie. Évite la détection de silence. |
| **TTL (Time-To-Live)** | Durée de vie d'un objet en cache ou d'une session. Passé ce délai, l'objet est considéré périmé et supprimé. |
| **Debounce** | Technique consistant à retarder l'exécution d'une fonction jusqu'à ce qu'un certain délai s'écoule sans nouvel appel. Ici utilisé pour grouper les écritures disque. |
| **SPO multi-valeurs** | Extension du modèle SPO où `objects` est un tableau. Permet de mémoriser plusieurs valeurs pour un même prédicat (`aime : ["pizza", "sushi"]`). |

---

*Documentation générée le 27 février 2026 — Lizzi v1.0.0*
