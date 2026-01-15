#!/usr/bin/env tsx
// Script de migration des souvenirs vers le nouveau format multi-valeurs

import { promises as fs } from 'fs';
import path from 'path';

interface OldFact {
  id: string;
  subject: string;
  predicate: string;
  object?: string;
  objects?: string[];
  isMultiValue?: boolean;
  key?: string;
  value?: string;
  context?: string;
  createdAt: string;
  updatedAt: string;
}

interface NewFact {
  id: string;
  subject: string;
  predicate: string;
  objects: string[];
  isMultiValue: boolean;
  key?: string;
  value?: string;
  object?: string;
  context?: string;
  createdAt: string;
  updatedAt: string;
}

const MULTI_VALUE_PREDICATES = ['aime', 'déteste', 'possède', 'collectionne'];

async function migrateMemories() {
  const memoryPath = path.join(process.cwd(), 'data', 'memories.json');
  const backupPath = path.join(process.cwd(), 'data', `memories.backup.${Date.now()}.json`);

  console.log('🔄 Migration des souvenirs...\n');

  try {
    const data = await fs.readFile(memoryPath, 'utf-8');
    const oldFacts: OldFact[] = JSON.parse(data);

    console.log(`📂 ${oldFacts.length} faits trouvés`);

    await fs.writeFile(backupPath, data);
    console.log(`💾 Sauvegarde créée : ${backupPath}\n`);

    const grouped = new Map<string, NewFact>();

    oldFacts.forEach(fact => {
      const predicate = fact.predicate || fact.key || '';
      const isMultiValue = MULTI_VALUE_PREDICATES.includes(predicate);
      const key = `${fact.subject}::${predicate}`;

      let objectValue = '';
      if (fact.objects && fact.objects.length > 0) {
        objectValue = fact.objects[0];
      } else if (fact.object) {
        objectValue = fact.object;
      } else if (fact.value) {
        objectValue = fact.value;
      }

      if (!objectValue) return;

      if (isMultiValue && grouped.has(key)) {
        const existing = grouped.get(key)!;
        if (!existing.objects.includes(objectValue)) {
          existing.objects.push(objectValue);
          console.log(`  ➕ Fusion : "${fact.subject}" ${predicate} "${objectValue}"`);
        }
      } else {
        const newFact: NewFact = {
          id: fact.id,
          subject: fact.subject,
          predicate,
          objects: fact.objects || [objectValue],
          isMultiValue,
          key: predicate,
          value: objectValue,
          object: objectValue,
          context: fact.context,
          createdAt: fact.createdAt,
          updatedAt: new Date().toISOString()
        };
        grouped.set(key, newFact);
      }
    });

    const newFacts = Array.from(grouped.values());

    console.log(`\n✨ Résultat : ${oldFacts.length} faits → ${newFacts.length} faits (${oldFacts.length - newFacts.length} fusionnés)\n`);

    console.log('📊 Aperçu des faits après migration :\n');
    newFacts.forEach(fact => {
      if (fact.objects.length > 1) {
        console.log(`  ${fact.subject} ${fact.predicate}:`);
        fact.objects.forEach(obj => console.log(`    - ${obj}`));
      } else {
        console.log(`  ${fact.subject} ${fact.predicate} ${fact.objects[0]}`);
      }
    });

    await fs.writeFile(memoryPath, JSON.stringify(newFacts, null, 2));
    console.log(`\n✅ Migration terminée ! Fichier mis à jour : ${memoryPath}`);
    console.log(`\n💡 En cas de problème, restaurer avec :`);
    console.log(`   cp "${backupPath}" "${memoryPath}"\n`);

  } catch (error) {
    console.error('❌ Erreur lors de la migration :', error);
    process.exit(1);
  }
}

migrateMemories();
