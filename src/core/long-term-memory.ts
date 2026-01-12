// src/core/long-term-memory.ts
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Fact {
  id: string;
  subject: string; // "Patrick", "Utilisateur", or "Belfégor"
  key: string;     // "nom", "chat", "couleur préférée"
  value: string;
  context?: string;
  createdAt: string;
  updatedAt: string;
}

export class LongTermMemory {
  private memoryPath: string;
  private facts: Map<string, Fact>;

  // constructor() {
  //   const projectRoot = path.join(__dirname, '../..');
  //   this.memoryPath = path.join(projectRoot, 'data', 'memories.json');
  //   this.facts = new Map();
  // }
  constructor() {
      // process.cwd() pointe vers la racine du projet (là où se trouve package.json)
      this.memoryPath = path.join(process.cwd(), 'data', 'memories.json');
      this.facts = new Map();
    }

    async initialize() {
        const dataDir = path.dirname(this.memoryPath);
        console.log(`📂 Tentative de création du dossier : ${dataDir}`);

        try {
            await fs.mkdir(dataDir, { recursive: true });

            // On essaie de lire, sinon on crée un fichier vide immédiatement
            try {
                const data = await fs.readFile(this.memoryPath, 'utf-8');
                const factsArray: Fact[] = JSON.parse(data);
                factsArray.forEach(fact => this.facts.set(fact.id, fact));
                console.log(`💾 ${this.facts.size} souvenirs chargés.`);
            } catch (e) {
                console.log('💾 Fichier inexistant, création du fichier initial...');
                await this.saveToFile(); // Force la création de memories.json vide : []
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
   * Ajoute ou met à jour un souvenir en gérant la corrélation de sujet
   */
  async add(key: string, value: string, subject: string = 'Utilisateur', context?: string): Promise<Fact> {
    const allFacts = Array.from(this.facts.values());

    // 1. Détection du nom réel de l'utilisateur
    // Si on enregistre pour "Utilisateur", on vérifie si on connaît son nom (ex: Patrick)
    let targetSubject = subject;
    const userNameFact = allFacts.find(f => f.subject === 'Utilisateur' && f.key === 'nom');

    if (userNameFact && targetSubject === 'Utilisateur') {
      targetSubject = userNameFact.value;
    }

    // 2. Vérification si ce fait précis existe déjà pour ce sujet (pour mise à jour)
    const existingFact = allFacts.find(f =>
      f.subject.toLowerCase() === targetSubject.toLowerCase() &&
      f.key.toLowerCase() === key.toLowerCase()
    );

    const fact: Fact = {
      id: existingFact ? existingFact.id : `souvenir_${Date.now()}`,
      subject: targetSubject,
      key,
      value,
      context,
      createdAt: existingFact ? existingFact.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.facts.set(fact.id, fact);
    await this.saveToFile();
    return fact;
  }

  /**
   * Récupère tous les faits liés à un sujet spécifique (ex: "Patrick")
   */
  async getFactsForSubject(subjectName: string): Promise<Fact[]> {
    const all = Array.from(this.facts.values());
    // On récupère les faits du nom spécifique + les faits "Utilisateur" par sécurité
    return all.filter(f =>
      f.subject.toLowerCase() === subjectName.toLowerCase() ||
      f.subject === 'Utilisateur'
    );
  }

  async search(query: string): Promise<Fact[]> {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.facts.values()).filter(fact =>
      fact.subject.toLowerCase().includes(lowerQuery) ||
      fact.key.toLowerCase().includes(lowerQuery) ||
      fact.value.toLowerCase().includes(lowerQuery)
    );
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
    }
    return existed;
  }

  /**
   * Génère un résumé textuel structuré pour le contexte du LLM
   */
  async getSummary(): Promise<string> {
    const facts = await this.getAll();
    if (facts.length === 0) return "Aucun souvenir enregistré.";

    // On groupe par sujet pour que le LLM comprenne les relations
    const grouped = facts.reduce((acc, fact) => {
      if (!acc[fact.subject]) acc[fact.subject] = [];
      acc[fact.subject].push(`${fact.key}: ${fact.value}`);
      return acc;
    }, {} as Record<string, string[]>);

    return Object.entries(grouped)
      .map(([subject, info]) => `À propos de ${subject === 'Utilisateur' ? 'l\'utilisateur' : subject} : ${info.join(', ')}.`)
      .join('\n');
  }
}
