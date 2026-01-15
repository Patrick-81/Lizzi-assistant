// src/core/long-term-memory.ts - VERSION CORRIGÉE
import { promises as fs } from 'fs';
import path from 'path';

export interface Fact {
  id: string;
  subject: string;       // "Patrick", "Utilisateur"
  predicate: string;     // "possède", "aime", "déteste", "habite"
  objects: string[];     // Liste d'objets (multi-valeur)
  isMultiValue: boolean; // Indique si ce prédicat supporte plusieurs valeurs
  // Compatibilité avec l'ancien format
  key?: string;
  value?: string;
  object?: string;
  context?: string;
  createdAt: string;
  updatedAt: string;
}

export class LongTermMemory {
  private memoryPath: string;
  private facts: Map<string, Fact>;
  private static factCounter = 0;
  
  // Prédicats qui supportent plusieurs valeurs
  private static MULTI_VALUE_PREDICATES = ['aime', 'déteste', 'possède', 'collectionne'];

  constructor() {
    this.memoryPath = path.join(process.cwd(), 'data', 'memories.json');
    this.facts = new Map();
  }

  async initialize() {
    const dataDir = path.dirname(this.memoryPath);
    console.log(`📂 Initialisation mémoire : ${dataDir}`);

    try {
      await fs.mkdir(dataDir, { recursive: true });

      try {
        const data = await fs.readFile(this.memoryPath, 'utf-8');
        const factsArray: Fact[] = JSON.parse(data);

        // Migration automatique de l'ancien format vers le nouveau
        factsArray.forEach(fact => {
          // Migration du format ancien vers nouveau
          if (!fact.predicate && fact.key) {
            fact.predicate = fact.key;
          }
          
          // Migration object (string) vers objects (array)
          if (!fact.objects) {
            if (fact.object) {
              fact.objects = [fact.object];
            } else if (fact.value) {
              fact.objects = [fact.value];
            } else {
              fact.objects = [];
            }
          }
          
          // Déterminer si multi-valeur
          if (fact.isMultiValue === undefined) {
            fact.isMultiValue = LongTermMemory.MULTI_VALUE_PREDICATES.includes(fact.predicate);
          }
          
          this.facts.set(fact.id, fact);
        });

        console.log(`💾 ${this.facts.size} souvenirs chargés.`);
      } catch (e) {
        console.log('💾 Création du fichier de mémoire...');
        await this.saveToFile();
      }
    } catch (error) {
      console.error(`❌ Erreur d'initialisation mémoire : ${error}`);
    }
  }

  private async saveToFile() {
    const factsArray = Array.from(this.facts.values());
    await fs.writeFile(this.memoryPath, JSON.stringify(factsArray, null, 2));
  }

  /**
   * Ajoute ou met à jour un fait avec support multi-valeurs
   * @param predicate - L'action/relation (ex: "possède", "aime")
   * @param object - L'objet (ex: "un chat nommé Belfégor")
   * @param subject - Le sujet (défaut: "Utilisateur")
   */
  async add(
    predicate: string,
    object: string,
    subject: string = 'Utilisateur',
    context?: string
  ): Promise<Fact> {
    const allFacts = Array.from(this.facts.values());

    // 1. Détection du nom réel de l'utilisateur
    let targetSubject = subject;
    const userNameFact = allFacts.find(
      f => f.subject === 'Utilisateur' &&
           (f.predicate === 's\'appelle' || f.key === 'nom')
    );

    if (userNameFact && targetSubject === 'Utilisateur') {
      targetSubject = userNameFact.objects[0] || userNameFact.value || 'Utilisateur';
    }

    // 2. Vérifier si c'est un prédicat multi-valeur
    const isMultiValue = LongTermMemory.MULTI_VALUE_PREDICATES.includes(predicate);

    // 3. Chercher un fait existant avec le même sujet + prédicat
    const existingFact = allFacts.find(f => {
      const fPredicate = f.predicate || f.key || '';
      return f.subject.toLowerCase() === targetSubject.toLowerCase() &&
             fPredicate.toLowerCase() === predicate.toLowerCase();
    });

    // 4. Si le fait existe et c'est multi-valeur, ajouter à la liste
    if (existingFact && isMultiValue) {
      const objectLower = object.toLowerCase();
      const alreadyExists = existingFact.objects.some(
        obj => obj.toLowerCase() === objectLower
      );

      if (!alreadyExists) {
        existingFact.objects.push(object);
        existingFact.updatedAt = new Date().toISOString();
        this.facts.set(existingFact.id, existingFact);
        await this.saveToFile();
        console.log('➕ Ajout à un fait existant:', object);
        return existingFact;
      } else {
        existingFact.updatedAt = new Date().toISOString();
        this.facts.set(existingFact.id, existingFact);
        await this.saveToFile();
        console.log('⏩ Valeur déjà existante, mise à jour de la date');
        return existingFact;
      }
    }

    // 5. Si le fait existe mais n'est pas multi-valeur, mettre à jour
    if (existingFact && !isMultiValue) {
      existingFact.objects = [object];
      existingFact.object = object;  // Compatibilité
      existingFact.value = object;   // Compatibilité
      existingFact.updatedAt = new Date().toISOString();
      this.facts.set(existingFact.id, existingFact);
      await this.saveToFile();
      console.log('🔄 Mise à jour d\'un fait existant');
      return existingFact;
    }

    // 6. Sinon, créer un nouveau fait
    const fact: Fact = {
      id: `fact_${Date.now()}_${++LongTermMemory.factCounter}`,
      subject: targetSubject,
      predicate,
      objects: [object],
      isMultiValue,
      key: predicate,      // Compatibilité
      value: object,       // Compatibilité
      object: object,      // Compatibilité
      context,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.facts.set(fact.id, fact);
    await this.saveToFile();
    console.log('✅ Nouveau fait créé:', fact);
    return fact;
  }

  /**
   * Met à jour un fait existant
   */
   async update(id: string, predicate: string, object: string, subject?: string): Promise<Fact | null> {
     const fact = this.facts.get(id);
     if (!fact) return null;

     fact.predicate = predicate;
     fact.objects = [object];
     fact.object = object;      // Compatibilité
     if (subject) fact.subject = subject;
     fact.key = predicate;      // Compatibilité
     fact.value = object;       // Compatibilité
     fact.updatedAt = new Date().toISOString();

     this.facts.set(id, fact);
     await this.saveToFile();
     return fact;
   }

  async getFactsForSubject(subjectName: string): Promise<Fact[]> {
    const all = Array.from(this.facts.values());
    return all.filter(f =>
      f.subject.toLowerCase() === subjectName.toLowerCase() ||
      f.subject === 'Utilisateur'
    );
  }

  async search(query: string): Promise<Fact[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.facts.values()).filter(fact => {
      const predicate = fact.predicate || fact.key || '';
      const objectsStr = fact.objects.join(' ');

      return fact.subject.toLowerCase().includes(lowerQuery) ||
             predicate.toLowerCase().includes(lowerQuery) ||
             objectsStr.toLowerCase().includes(lowerQuery);
    });
  }

  async getAll(): Promise<Fact[]> {
    return Array.from(this.facts.values()).sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.facts.delete(id);
    if (existed) {
      await this.saveToFile();
      console.log('🗑️ Fait supprimé:', id);
    }
    return existed;
  }

  /**
   * Génère un résumé textuel au format SPO avec groupement intelligent
   */
  async getSummary(): Promise<string> {
    const facts = await this.getAll();
    if (facts.length === 0) return "Aucun souvenir enregistré.";

    const grouped = facts.reduce((acc, fact) => {
      if (!acc[fact.subject]) acc[fact.subject] = {};

      const predicate = fact.predicate || fact.key || '?';
      
      if (!acc[fact.subject][predicate]) {
        acc[fact.subject][predicate] = [];
      }
      
      acc[fact.subject][predicate].push(...fact.objects);
      return acc;
    }, {} as Record<string, Record<string, string[]>>);

    return Object.entries(grouped)
      .map(([subject, predicates]) => {
        const subjectLabel = subject === 'Utilisateur' ? 'L\'utilisateur' : subject;
        const lines = Object.entries(predicates).map(([pred, objs]) => {
          if (objs.length > 1) {
            return `  - ${pred} : ${objs.join(', ')}`;
          }
          return `  - ${pred} ${objs[0]}`;
        });
        return `${subjectLabel} :\n${lines.join('\n')}`;
      })
      .join('\n\n');
  }
}
