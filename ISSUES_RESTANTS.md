# 🐛 Issues Restants - Assistant Personnel Lizzi

Date : 15 janvier 2026

## ✅ Problèmes Résolus (Dernier Commit)

### 1. System Monitor (VRAM/RAM)
**Status** : ✅ CORRIGÉ

**Problème** : Le frontend appelait `/api/system/stats` mais la route n'existait pas.

**Solution** :
```typescript
// src/server.ts
import { SystemMonitor } from './core/system-monitor.js';
const systemMonitor = new SystemMonitor();

app.get('/api/system/stats', async (req, res) => {
  const stats = await systemMonitor.getStats();
  const modelInfo = await systemMonitor.getModelInfo();
  res.json({ success: true, stats, model: modelInfo });
});
```

### 2. Détection "Tesla comme véhicule"
**Status** : ✅ CORRIGÉ

**Problème** : Pattern "j'ai X comme Y" n'était pas détecté.

**Solution** :
```typescript
// src/core/memory-detector.ts
{
  regex: /(?:mémorise)\s+(?:que\s+)?j'ai\s+(?:un|une)\s+([A-ZÀ-ÿ\w-]+)\s+comme\s+(\w+)/i,
  handler: (m) => ({
    subject: 'Utilisateur',
    predicate: `possède comme ${m[2]}`,
    object: m[1].trim()
  })
}
```

---

## ⚠️ Problèmes Restants (Nécessitent Refonte Frontend)

### 3. Éditeur de Faits (Interface Web)
**Status** : 🔴 NON CORRIGÉ

**Problème** :
- L'éditeur utilise `fact.key` et `fact.value` (ancien format)
- Ne comprend pas `fact.predicate` et `fact.objects[]` (nouveau format)
- N'affiche pas correctement les faits multi-valeurs
- Modification des faits multi-valeurs impossible

**Code Actuel (Obsolète)** :
```javascript
// public/index.html ligne ~1020
factDiv.innerHTML = `
  <div class="fact-key">${fact.key}</div>
  <div class="fact-value">${fact.value}</div>
`;
```

**Ce qu'il devrait faire** :
```javascript
const predicate = fact.predicate || fact.key;
const objects = fact.objects || [fact.value];
const displayValue = objects.join(', ');

factDiv.innerHTML = `
  <div class="fact-key">
    <strong>${fact.subject}</strong> ${predicate}
    ${fact.isMultiValue ? `<span class="badge">${objects.length}</span>` : ''}
  </div>
  <div class="fact-value">${displayValue}</div>
`;
```

**Impact** :
- ✅ L'API `/api/facts` retourne le bon format
- ❌ L'interface ne l'affiche pas correctement
- ❌ Impossible de modifier les faits multi-valeurs
- ⚠️ Affiche `undefined` pour les faits migrés

---

## 🔧 Solutions Proposées

### Option A : Patch Rapide (10 min)
Modifier uniquement l'affichage dans `public/index.html` :

1. Remplacer la fonction `loadFacts()` (ligne ~996)
2. Ajouter support `fact.predicate` et `fact.objects[]`
3. Ajouter badge pour multi-valeurs
4. Bloquer l'édition des faits multi-valeurs

**Avantages** :
- Rapide à implémenter
- Affichage correct
- Pas de régression

**Inconvénients** :
- Édition limitée
- Pas d'ajout de valeurs aux faits existants

### Option B : Refonte Complète (2-3h)
Créer une nouvelle interface de gestion avancée :

1. **Vue groupée par sujet** (Patrick, Utilisateur, etc.)
2. **Gestion multi-valeurs** :
   - Ajouter une valeur à un fait existant
   - Supprimer une valeur spécifique
   - Réorganiser les valeurs
3. **Filtres et recherche** :
   - Par sujet
   - Par prédicat
   - Par date
4. **Import/Export** JSON

**Avantages** :
- Interface professionnelle
- Gestion complète
- UX optimale

**Inconvénients** :
- Temps de développement
- Risque de bugs
- Tests nécessaires

### Option C : API Seulement (5 min)
Ne pas toucher au frontend, utiliser l'API REST :

```bash
# Lister les faits
curl http://localhost:3001/api/facts

# Ajouter un fait
curl -X POST http://localhost:3001/api/facts \
  -H "Content-Type: application/json" \
  -d '{"key":"aime","value":"la pizza"}'

# Modifier un fait
curl -X PUT http://localhost:3001/api/facts/fact_123 \
  -H "Content-Type: application/json" \
  -d '{"key":"aime","value":"les pâtes"}'

# Supprimer un fait
curl -X DELETE http://localhost:3001/api/facts/fact_123
```

**Avantages** :
- Aucune modification du code
- Fonctionne immédiatement
- Pour utilisateurs techniques

**Inconvénients** :
- Pas user-friendly
- Nécessite terminal
- Manipulation manuelle

---

## 📊 Workaround Actuel

En attendant la correction du frontend :

### Voir les Faits
```bash
curl -s http://localhost:3001/api/facts | jq '.facts'
```

### Éditer memories.json Directement
```bash
# Sauvegarder
cp data/memories.json data/memories.backup.json

# Éditer avec un éditeur
nano data/memories.json
# ou
code data/memories.json

# Redémarrer le serveur
npm run dev
```

### Format Attendu
```json
{
  "id": "fact_123",
  "subject": "Patrick",
  "predicate": "aime",
  "objects": ["les spaghettis", "les frites", "la pizza"],
  "isMultiValue": true,
  "createdAt": "2026-01-15T10:00:00Z",
  "updatedAt": "2026-01-15T12:00:00Z"
}
```

---

## 🎯 Recommandation

**Court terme (Maintenant)** :
1. ✅ Utiliser l'API REST ou éditer `memories.json` directement
2. ✅ Les faits s'affichent dans le chat (contexte)
3. ✅ La mémorisation automatique fonctionne

**Moyen terme (Cette semaine)** :
- Implémenter **Option A** (patch rapide)
- Affichage correct dans l'interface
- Édition basique fonctionnelle

**Long terme (Prochaines semaines)** :
- Implémenter **Option B** (refonte complète)
- Interface professionnelle
- Toutes les fonctionnalités avancées

---

## 📝 Notes Techniques

### Compatibilité Rétroactive
Les champs `key`, `value`, `object` sont maintenus pour compatibilité :

```typescript
const fact: Fact = {
  id: 'fact_123',
  subject: 'Patrick',
  predicate: 'aime',        // NOUVEAU
  objects: ['pizza'],       // NOUVEAU
  isMultiValue: false,      // NOUVEAU
  key: 'aime',              // ANCIEN (compat)
  value: 'pizza',           // ANCIEN (compat)
  object: 'pizza',          // ANCIEN (compat)
  // ...
};
```

### Migration Automatique
Le système migre automatiquement à l'initialisation :

```typescript
// src/core/long-term-memory.ts ligne ~36
if (!fact.objects) {
  if (fact.object) {
    fact.objects = [fact.object];
  } else if (fact.value) {
    fact.objects = [fact.value];
  }
}
```

---

## ✅ Checklist Validation

- [x] System Monitor fonctionne (VRAM/RAM)
- [x] Pattern "Tesla comme véhicule" détecté
- [x] API `/api/facts` retourne bon format
- [x] Mémorisation automatique fonctionne
- [x] Migration des données OK
- [ ] Interface affiche multi-valeurs (PENDING)
- [ ] Édition multi-valeurs possible (PENDING)
- [ ] Badge nombre de valeurs (PENDING)

---

## 🚀 Pour Continuer

**Prochaine étape recommandée** : Implémenter Option A (patch rapide de l'interface)

**Fichier à modifier** : `public/index.html`
**Lignes à changer** : ~996-1100 (fonctions `loadFacts` et `editFact`)
**Temps estimé** : 10-15 minutes
