# 📝 CHANGELOG - Lizzi Assistant Personnel

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

## [1.0.0] - 2026-01-19

### 🎉 Version Majeure - Reconnaissance Vocale & Améliorations

Cette version marque l'aboutissement d'un assistant personnel entièrement fonctionnel avec capacités vocales bidirectionnelles.

### ✨ Nouvelles Fonctionnalités

#### 🎤 Reconnaissance Vocale (Speech-to-Text)
- **Intégration Whisper.cpp** pour transcription audio locale
- **Mode Push-to-Talk** avec la barre d'espace (mode par défaut)
  - Maintenir ESPACE pour enregistrer
  - Relâcher pour transcrire automatiquement
  - Fonctionne immédiatement au chargement de la page
- **Bouton micro** 🎤 avec animation d'enregistrement
- **Support français** natif avec le modèle `ggml-base.bin`
- **Transcription rapide** (2-5 secondes selon la longueur)
- **100% local** - aucune donnée envoyée à des serveurs externes

#### ✏️ Éditeur de Faits Avancé
- **Interface CRUD complète** pour gérer les souvenirs
- **Format SPO** (Sujet-Prédicat-Objet) avec édition visuelle
- **Extraction sémantique améliorée** pour détecter automatiquement les triplets
- **Recherche intelligente** avec normalisation des sujets
- **Détection correcte du sujet réel** dans les phrases complexes

#### 📋 Amélioration de l'Interface
- **Bouton copier** sur tous les blocs de code (icône 📋)
- **TTS intelligent** - ne lit plus le code à voix haute
- **Focus désactivé par défaut** pour privilégier le mode vocal
- **Affichage optimisé** des réponses markdown

### 🔧 Corrections de Bugs

#### TypeScript & Build
- ✅ Correction des erreurs `Property 'save' does not exist`
- ✅ Remplacement de `save()` par `add()` avec les bons paramètres
- ✅ Utilisation correcte de `predicate/object/subject`
- ✅ Le build TypeScript passe sans erreur

#### Mémoire & Extraction
- ✅ Amélioration de la détection d'intentions de mémorisation
- ✅ Extraction sémantique plus robuste (sujet réel vs "Utilisateur")
- ✅ Recherche avec apostrophes fonctionnelle
- ✅ Normalisation des sujets pour éviter les doublons
- ✅ Logs verbeux pour le debugging

#### Interface Utilisateur
- ✅ Frontend HTML complet restauré (1420 lignes)
- ✅ Bouton micro réintégré après restauration
- ✅ Animation pulse pendant l'enregistrement
- ✅ Permissions micro gérées correctement

### 🎨 Améliorations UX

- **Conversation fluide** - mode vocal par défaut pour un usage naturel
- **Indicateurs visuels** clairs (micro rouge en enregistrement)
- **Gestion des erreurs** améliorée avec messages explicites
- **Performance** - transcription optimisée (CPU uniquement)

### 🛠️ Modifications Techniques

#### Backend
```
src/core/speech.ts         # Nouveau : Classe SpeechRecognition
src/core/assistant.ts       # Corrections TypeScript
src/core/long-term-memory.ts # Amélioration gestion des faits
src/core/memory-detector.ts  # Détection intentions améliorée
src/core/semantic-extractor.ts # Extraction SPO robuste
src/server.ts              # Route /api/transcribe ajoutée
```

#### Frontend
```
public/index.html
  - Ligne 871: Bouton micro 🎤
  - Ligne 405: CSS animation recording
  - Ligne 1179: Fonctions toggleMicrophone() et transcribeAudio()
  - Ligne 1628: Focus désactivé par défaut (push-to-talk)
  - Boutons copier sur blocs de code
```

#### Infrastructure
```
whisper-cpp/               # Binaire Whisper compilé
whisper-cpp/models/        # Modèle ggml-base.bin (142 MB)
start.sh                   # Script de démarrage simplifié
```

### 📦 Dépendances

Aucune nouvelle dépendance npm ajoutée - tout est local :
- Whisper.cpp (binaire compilé)
- Piper TTS (binaire existant)
- Ollama (API externe mais locale)

### 🔐 Sécurité & Confidentialité

- **Reconnaissance vocale locale** - aucun appel à Google/Azure/AWS
- **Données privées** - tout reste sur votre machine
- **HTTPS** pour l'accès au micro (certificat auto-signé)

### 📊 Performance

**Testée avec** :
- CPU : AMD Ryzen / Intel i7
- GPU : RTX 3060 12GB (pour LLM uniquement)
- RAM : 16GB
- OS : Ubuntu 22.04 / Windows 11

**Temps de réponse** :
- Transcription Whisper : 2-5 secondes
- Génération LLM : 1-3 secondes (selon le modèle)
- Synthèse vocale Piper : instantané

### 🐛 Problèmes Connus

#### Mineurs
- Doublons en mémoire pour prédicats similaires (amélioration prévue)
- Prénom utilisateur non détecté automatiquement au premier usage
- Mémoire contextuelle limitée à 20 messages (configurable)

#### Workarounds Disponibles
- Édition manuelle des faits via l'interface
- Dire explicitement "Je m'appelle X" pour créer le fait identité
- Augmenter `maxMessages` dans `src/core/memory.ts`

### 📚 Documentation Ajoutée

- `CORRECTIONS_WHISPER.md` - Guide complet reconnaissance vocale
- `MODE_PUSH_TO_TALK_PAR_DEFAUT.md` - Documentation du mode vocal
- `RESUME_FINAL.md` - Résumé des corrections appliquées
- `FLUX_VOCAL_COMPLET.md` - Flux technique complet
- `DIAGNOSTIC.md` - Analyse des problèmes rencontrés

### 🚀 Mise à Niveau

Pour passer à cette version depuis une installation précédente :

```bash
# 1. Récupérer les changements
git pull origin main

# 2. Vérifier que Whisper est compilé
ls -lh whisper-cpp/build/bin/whisper-cli

# 3. Télécharger le modèle si nécessaire
# (fait automatiquement au premier usage)

# 4. Rebuild et redémarrer
npm run build
npm start
```

Pas besoin de réinstaller les dépendances npm.

### 🎯 Prochaines Étapes

**Phase 2 - Améliorations** (prévue)
- [ ] Système multi-valeurs pour les prédicats
- [ ] Fusion automatique des faits similaires
- [ ] Recherche sémantique avec scoring
- [ ] Tests unitaires

**Phase 3 - Évolutions** (prévue)
- [ ] Outil `manage_memory` avancé
- [ ] Support multi-utilisateurs
- [ ] Chiffrement des données sensibles
- [ ] Base de données SQLite

**Phase 4 - Fonctionnalités Avancées** (prévue)
- [ ] Recherche vectorielle avec embeddings
- [ ] Intégration calendrier
- [ ] Rappels et notifications
- [ ] Plugins système

---

## [0.9.0] - 2026-01-15

### Commits Précédents
- `62bdb89` - feat: éditeur triplets Sujet-Relation-Objet
- `81d802a` - fix: recherche améliorée et normalisation sujet
- `c96626c` - chore: cleanup unused files and simplify memory-detector
- `05f99b6` - fix: amélioration extraction sémantique et éditeur de faits
- `7ffa576` - fix: amélioration recherche et règles mémoire strictes
- `1998a3c` - fix: extraction sémantique - détection correcte du sujet réel
- `f691528` - fix: recherche avec apostrophes et logs verbeux
- `a7dde7c` - fix: TTS ne lit plus le code à voix haute
- `af9e4cb` - feat: bouton copier sur les blocs de code

---

## Légende

- ✨ Nouvelle fonctionnalité
- 🔧 Correction de bug
- 🎨 Amélioration UI/UX
- 🛠️ Modification technique
- 📚 Documentation
- 🔐 Sécurité
- 📦 Dépendances
- 🚀 Performance

---

**Mainteneur** : Patrick  
**Licence** : MIT  
**Statut** : Stable ✅
