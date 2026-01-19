// src/core/long-term-memory.ts - VERSION CORRIGÉE COMPLÈTE
import { promises as fs } from 'fs';
import path from 'path';

export interface Fact {
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

export class LongTermMemory {
  private memoryPath: string;
  private facts: Map<string, Fact> = new Map();
  private vectorCache: Map<string, number[]> = new Map();
  private ollama: any = null;  // Stockage de l'instance Ollama

  constructor() {
    this.memoryPath = path.join(process.cwd(), 'data', 'memories.json');
  }

  async initialize(ollama: any) {
    this.ollama = ollama;  // Sauvegarde l'instance Ollama pour usage ultérieur

    try {
      const data = await fs.readFile(this.memoryPath, 'utf-8');
      const factsArray: Fact[] = JSON.parse(data);

      this.facts.clear();
      this.vectorCache.clear();

      console.log(`⏳ Vectorisation de ${factsArray.length} faits en cours...`);
      for (const fact of factsArray) {
        this.facts.set(fact.id, fact);
        const vector = await this.generateEmbedding(ollama, fact);
        this.vectorCache.set(fact.id, vector);
      }
      console.log(`✅ Mémoire prête : ${this.facts.size} faits, ${this.vectorCache.size} vecteurs.`);
    } catch (e) {
      console.log('💾 Création du fichier de mémoire...');
      await fs.mkdir(path.dirname(this.memoryPath), { recursive: true });
      await this.saveToFile();
    }
  }

  async generateEmbedding(ollama: any, input: Fact | string): Promise<number[]> {
    const text = typeof input === 'string'
      ? input
      : `${input.subject} ${input.predicate} ${input.objects.join(', ')}`;

    try {
      const response = await ollama.embeddings({
        model: 'all-minilm',
        prompt: text
      });
      return response.embedding;
    } catch (error) {
      console.error('❌ Erreur génération embedding:', error);
      // Retourne un vecteur vide en cas d'erreur pour ne pas bloquer
      return new Array(384).fill(0); // all-minilm produit des vecteurs de 384 dimensions
    }
  }

  async vectorSearch(queryVector: number[], threshold = 0.5): Promise<Fact[]> {
    const allFacts = Array.from(this.facts.values());

    // Vérification préalable : tous les faits ont-ils un vecteur ?
    const missingVectors: string[] = [];
    for (const fact of allFacts) {
      if (!this.vectorCache.has(fact.id)) {
        missingVectors.push(fact.id);
      }
    }

    // Si des vecteurs manquent, les régénérer AVANT la recherche
    if (missingVectors.length > 0 && this.ollama) {
      console.log(`⚠️  ${missingVectors.length} vecteur(s) manquant(s), régénération...`);
      for (const factId of missingVectors) {
        const fact = this.facts.get(factId);
        if (fact) {
          const vector = await this.generateEmbedding(this.ollama, fact);
          this.vectorCache.set(factId, vector);
          console.log(`✅ Vecteur régénéré pour ${factId}`);
        }
      }
    }

    const scoredFacts = allFacts.map(fact => {
      let score = 0;
      const factVector = this.vectorCache.get(fact.id);

      if (factVector && Array.isArray(factVector)) {
        try {
          score = cosineSimilarity(queryVector, factVector);
        } catch (err) {
          console.error(`Erreur calcul similarité pour ${fact.id}:`, err);
          score = 0;
        }
      }

      return { fact, score };
    });

    const results = scoredFacts
      .filter(item => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .map(item => item.fact);

    console.log(`🔍 Recherche vectorielle: ${results.length}/${allFacts.length} faits trouvés (seuil: ${threshold})`);

    return results;
  }

  // --- SAUVEGARDE ET MODIFICATION ---

  private async saveToFile() {
    const factsArray = Array.from(this.facts.values());
    await fs.writeFile(this.memoryPath, JSON.stringify(factsArray, null, 2));
  }

  async add(predicate: string, object: string, subject: string, ollama: any): Promise<Fact> {
    const id = `fact_${Date.now()}`;
    const newFact: Fact = {
      id,
      subject,
      predicate,
      objects: [object],
      isMultiValue: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Mise à jour de la Map des faits
    this.facts.set(id, newFact);

    // IMPORTANT: Générer ET sauvegarder le vecteur immédiatement
    const vector = await this.generateEmbedding(ollama, newFact);
    this.vectorCache.set(id, vector);

    console.log(`✅ Fait ajouté: ${subject} ${predicate} ${object} (vecteur: ${vector.length}D)`);

    await this.saveToFile();
    return newFact;
  }

  async update(id: string, predicate: string, objects: string[], subject: string, ollama: any): Promise<Fact | null> {
    const fact = this.facts.get(id);
    if (!fact) {
      console.log(`❌ Fait ${id} introuvable pour mise à jour`);
      return null;
    }

    fact.predicate = predicate;
    fact.objects = objects;
    fact.subject = subject;
    fact.updatedAt = new Date().toISOString();

    // IMPORTANT: Recalculer le vecteur car le contenu a changé
    const vector = await this.generateEmbedding(ollama, fact);
    this.vectorCache.set(id, vector);

    console.log(`✅ Fait mis à jour: ${subject} ${predicate} ${objects.join(', ')}`);

    await this.saveToFile();
    return fact;
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.facts.delete(id);
    this.vectorCache.delete(id); // Nettoyage du cache

    if (existed) {
      await this.saveToFile();
      console.log('🗑️ Fait supprimé:', id);
    }

    return existed;
  }

  async getAll(): Promise<Fact[]> {
    return Array.from(this.facts.values()).sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  // Méthode utilitaire pour vérifier l'état du cache
  getCacheStatus(): { totalFacts: number; cachedVectors: number; missingVectors: number } {
    const totalFacts = this.facts.size;
    const cachedVectors = this.vectorCache.size;
    const missingVectors = totalFacts - cachedVectors;

    return { totalFacts, cachedVectors, missingVectors };
  }
}

// Fonction utilitaire pour la similarité cosinus
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    console.warn(`⚠️  Dimensions différentes: ${vecA.length} vs ${vecB.length}`);
    return 0;
  }

  let dotProduct = 0;
  let mA = 0;
  let mB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(mA) * Math.sqrt(mB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
