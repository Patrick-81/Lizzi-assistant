# ✅ PRÉ-CHARGEMENT DU MODÈLE LLM

## 🐛 Problème

**Symptôme** : La reconnaissance vocale fonctionne, mais Lizzi ne répond pas aux messages.

**Cause** : Le modèle LLM n'était pas chargé en mémoire VRAM au démarrage du serveur. Ollama charge les modèles "à la demande" (lazy loading), ce qui créait un délai ou timeout lors de la première requête.

## 🔧 Solution Appliquée

### Fonction de Warm-up

Ajout d'une fonction `warmupModel()` qui :
1. Crée une instance de l'assistant
2. Envoie une requête simple "Bonjour"
3. Force le chargement du modèle en VRAM
4. Met en cache l'instance pour les requêtes suivantes

### Code Ajouté (src/server.ts)

```typescript
async function warmupModel() {
  try {
    console.log('🔥 Pré-chargement du modèle LLM...');
    const assistant = new Assistant();
    await assistant.initialize();
    
    // Envoie une requête simple pour charger le modèle en mémoire
    await assistant.chat('Bonjour');
    
    console.log('✅ Modèle LLM chargé en mémoire');
    assistants.set('default', assistant);
  } catch (error) {
    console.error('⚠️  Erreur pré-chargement modèle:', error);
  }
}
```

### Appel au Démarrage

La fonction est appelée automatiquement au démarrage du serveur :

```typescript
https.createServer(httpsOptions, app).listen(PORT, async () => {
  console.log(`🔒 Serveur HTTPS démarré sur https://localhost:${PORT}`);
  console.log(`📡 Connecté à Ollama sur ${process.env.OLLAMA_HOST}`);
  console.log(`🤖 Modèle: ${process.env.MODEL_NAME}`);
  
  // Pré-charge le modèle en arrière-plan
  warmupModel().catch(console.error);
});
```

## 📊 Résultat

### Avant
```bash
curl http://orion:11434/api/ps
{
  "models": []  # Aucun modèle chargé
}
```

### Après
```bash
curl http://orion:11434/api/ps
{
  "models": [
    {
      "name": "ministral-3b-Q4:latest",
      "size_vram": 5955967104,  # ~5.5 GB chargé en VRAM
      "expires_at": "..."
    }
  ]
}
```

## 🚀 Logs au Démarrage

```
🎤 Reconnaissance vocale initialisée
🔒 Serveur HTTPS démarré sur https://localhost:3001
📡 Connecté à Ollama sur http://orion:11434
🤖 Modèle: ministral-3b-Q4:latest
🔥 Pré-chargement du modèle LLM...
⏳ Vectorisation de 10 faits en cours...
✅ Mémoire prête : 10 faits, 10 vecteurs.
🔍 Vérification mémorisation pour: Bonjour
⭕ Pas de mot-clé de mémorisation détecté
🔎 Requête élargie: Bonjour
🔍 Recherche vectorielle: 0/10 faits trouvés (seuil: 0.5)
📊 Cache: 10/10 vecteurs (0 manquants)
📚 0 faits pertinents trouvés
✅ Modèle LLM chargé en mémoire
```

## 💡 Avantages

### 1. Réponse Instantanée
- Pas d'attente au premier message
- Modèle déjà prêt en VRAM
- Expérience utilisateur fluide

### 2. Instance Réutilisée
- L'assistant warmup est mis en cache
- Réutilisé pour les messages suivants
- Pas de rechargement entre les requêtes

### 3. Gestion des Erreurs
- Si le warmup échoue, le serveur continue
- Log d'erreur pour diagnostiquer
- L'utilisateur peut quand même envoyer des messages

## 🎯 Comportement

### Séquence de Démarrage

1. **Serveur démarre** (1-2 secondes)
2. **Warmup lancé en arrière-plan** (5-10 secondes)
   - Initialise l'assistant
   - Charge la mémoire long terme
   - Vectorise les faits
   - Envoie requête "Bonjour" à Ollama
   - Ollama charge le modèle en VRAM
3. **Modèle prêt** ✅

**Pendant le warmup** : Le serveur est déjà accessible, mais la première vraie requête pourrait être un peu lente si le warmup n'est pas terminé.

**Après le warmup** : Toutes les requêtes sont rapides car le modèle est déjà chargé.

## 🔍 Vérification

### Commande de Test

```bash
# Vérifier si le modèle est chargé
curl -s http://orion:11434/api/ps | jq '.models[].name'

# Devrait afficher:
# "ministral-3b-Q4:latest"
# "all-minilm:latest"
```

### Dans les Logs

Chercher cette ligne :
```
✅ Modèle LLM chargé en mémoire
```

Si elle apparaît → Le modèle est prêt !

## 📝 Notes Techniques

### VRAM Utilisée
- **Modèle principal** : ~5.5 GB (ministral-3b-Q4)
- **Modèle embeddings** : ~76 MB (all-minilm)
- **Total** : ~5.6 GB

### Expiration
Le modèle reste en mémoire **5 minutes** après la dernière utilisation. Si aucune requête n'est envoyée pendant ce délai, Ollama le décharge automatiquement.

### Rechargement Automatique
Si le modèle est déchargé, la prochaine requête le rechargera (avec un léger délai). Le warmup garantit juste qu'il est prêt au démarrage.

## 🚀 Test Final

```bash
# 1. Le serveur est déjà démarré avec le warmup

# 2. Ouvre l'interface
https://localhost:3001

# 3. Teste la reconnaissance vocale + réponse
- Maintiens la barre d'espace
- Dis "Bonjour Lizzi"
- Relâche
- → Lizzi devrait répondre instantanément !
```

---

**Statut** : ✅ Modèle LLM pré-chargé au démarrage

**Bénéfice** : Réponses instantanées dès le premier message
