// src/core/assistant.ts - VERSION CORRIGÉE COMPLÈTE
import 'dotenv/config';
import { Ollama } from 'ollama';
import { SYSTEM_PROMPT } from './personality.js';
import { ConversationMemory } from './memory.js';
import { LongTermMemory, Fact } from './long-term-memory.js';
import { MemoryDetector } from './memory-detector.js';
import { SemanticExtractor } from './semantic-extractor.js';
import { ToolSystem } from './tools.js';


export class Assistant {
  private ollama: Ollama;
  private memory: ConversationMemory;
  private static sharedLongTermMemory: LongTermMemory | null = null;
  private longTermMemory: LongTermMemory;
  private memoryDetector: MemoryDetector;
  private semanticExtractor: SemanticExtractor;
  private toolSystem: ToolSystem;
  private model: string;
  private hasAskedName: boolean = false;

  constructor() {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.ollama = new Ollama({ host: ollamaHost });
    this.model = process.env.MODEL_NAME || 'mistral';
    this.memory = new ConversationMemory();

    if (!Assistant.sharedLongTermMemory) {
      Assistant.sharedLongTermMemory = new LongTermMemory();
    }
    this.longTermMemory = Assistant.sharedLongTermMemory;

    this.memoryDetector = new MemoryDetector();
    this.semanticExtractor = new SemanticExtractor(this.ollama, this.model);
    this.toolSystem = new ToolSystem();
  }

  async initialize() {
    await this.longTermMemory.initialize(this.ollama);
  }

  private async getUserName(): Promise<string | null> {
    const facts = await this.longTermMemory.getAll();
    const nameFact = facts.find(
      f => (f.subject.toLowerCase() === 'utilisateur') &&
           (f.predicate === 's\'appelle' || f.predicate === 'nom')
    );
    return nameFact?.objects[0] || null;
  }

  private detectToolCall(text: string): { tool: string; params: any } | null {
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (!jsonMatch) {
      const directMatch = text.match(/\{[\s\S]*"tool"[\s\S]*\}/);
      if (!directMatch) return null;
      try { return JSON.parse(directMatch[0]); } catch { return null; }
    }
    try { return JSON.parse(jsonMatch[1]); } catch { return null; }
  }

  /**
   * Élargit la requête pour améliorer la recherche vectorielle
   */
  private expandQuery(query: string): string {
    const lowerQuery = query.toLowerCase();

    // Questions sur le nombre d'animaux
    if (/combien|nombre|quantité/i.test(query) && /animaux|animal/i.test(query)) {
      return `${query} chat chien canari souris oiseau poisson lapin possède a nommé`;
    }

    // Questions sur les noms d'animaux
    if (/comment.*appelle|nom de|quel.*nom/i.test(query)) {
      const animalMatch = query.match(/(chat|chien|canari|souris|oiseau|lapin|poisson)/i);
      if (animalMatch) {
        return `${query} a un ${animalMatch[0]} nommé possède ${animalMatch[0]}`;
      }
    }

    // Questions sur ce que l'utilisateur aime
    if (/qu'est-ce que.*aime|ce que.*aime|mes.*préférés/i.test(query)) {
      return `${query} aime préfère adore apprécie`;
    }

    return query;
  }

  async chat(userMessage: string): Promise<string> {
    const startTime = Date.now();
    const userName = await this.getUserName();

    // 1. BLOCAGE : Si on ne connaît pas le nom, on le demande
    if (!userName && !this.hasAskedName) {
      this.hasAskedName = true;
      const greeting = "Bonjour ! 😊 Avant que nous fassions plus ample connaissance, comment t'appelles-tu ?";
      this.memory.addMessage('assistant', greeting);
      return greeting;
    }

    // 2. Si l'utilisateur vient de donner son nom
    if (!userName && this.hasAskedName) {
      const triple = await this.semanticExtractor.extractTriple(userMessage);
      const extractedName = triple?.object || userMessage.trim();

      await this.longTermMemory.add("s'appelle", extractedName, "Utilisateur", this.ollama);
      this.hasAskedName = false;
      return `Enchanté ${extractedName} ! Je prends note. Comment puis-je t'aider ?`;
    }

    // 3. MÉMORISATION : Vérifie si l'utilisateur demande d'enregistrer quelque chose
    console.log('🔍 Vérification mémorisation pour:', userMessage);

    if (this.memoryDetector.detect(userMessage)) {
      console.log('✅ Détection mémorisation activée');

      const cleanedMessage = this.memoryDetector.cleanMessage(userMessage);
      console.log('🧹 Message nettoyé:', cleanedMessage);

      const triple = await this.semanticExtractor.extractTriple(cleanedMessage, userName || undefined);
      console.log('📝 Triplet extrait:', triple);

      if (triple && triple.predicate !== 'inconnu') {
        // Recherche si un fait similaire existe déjà
        const queryForExisting = await this.longTermMemory.generateEmbedding(
          this.ollama,
          `${triple.subject} ${triple.predicate}`
        );
        const existingFacts = await this.longTermMemory.vectorSearch(queryForExisting, 0.7);
        const duplicate = existingFacts.find(f =>
          f.subject.toLowerCase() === triple.subject.toLowerCase() &&
          f.predicate.toLowerCase() === triple.predicate.toLowerCase()
        );

        if (duplicate && !duplicate.objects.includes(triple.object)) {
          console.log(`🔄 Mise à jour: ${duplicate.predicate}`);
          await this.longTermMemory.update(
            duplicate.id,
            triple.predicate,
            [triple.object],
            triple.subject,
            this.ollama
          );
        } else if (!duplicate) {
          console.log(`🆕 Nouveau souvenir: ${triple.subject} ${triple.predicate} ${triple.object}`);
          await this.longTermMemory.add(
            triple.predicate,
            triple.object,
            triple.subject,
            this.ollama
          );
        } else {
          console.log('⏭️ Fait déjà existant, pas de modification');
        }

        // Confirmation à l'utilisateur
        return `C'est noté ! Je me souviendrai que ${triple.subject} ${triple.predicate} ${triple.object}.`;
      } else {
        console.log('⚠️ Impossible d\'extraire un triplet valide');
      }
    } else {
      console.log('⭕ Pas de mot-clé de mémorisation détecté');
    }

    // 4. RECHERCHE SÉMANTIQUE avec requête élargie
    const t1 = Date.now();
    const expandedQuery = this.expandQuery(userMessage);
    console.log('🔎 Requête élargie:', expandedQuery);

    const queryVector = await this.longTermMemory.generateEmbedding(this.ollama, expandedQuery);
    console.log(`⏱️  Embedding généré en ${Date.now() - t1}ms`);
    
    const t2 = Date.now();
    let relevantFacts = await this.longTermMemory.vectorSearch(queryVector, 0.35); // Seuil baissé à 0.35 pour meilleure couverture
    console.log(`⏱️  Recherche vectorielle en ${Date.now() - t2}ms`);
    
    const cacheStatus = this.longTermMemory.getCacheStatus();
    console.log(`📊 Cache: ${cacheStatus.cachedVectors}/${cacheStatus.totalFacts} vecteurs (${cacheStatus.missingVectors} manquants)`);

    // Fallback 1: Questions sur l'identité (nom, prénom)
    if (relevantFacts.length === 0 && /comment.*appelle|quel.*nom|mon nom|mon prénom/i.test(userMessage)) {
      console.log('🔄 Fallback: recherche faits identité');
      const allFacts = await this.longTermMemory.getAll();
      relevantFacts = allFacts.filter(f =>
        f.predicate === "s'appelle" || f.predicate === "nom" || f.subject === "Utilisateur"
      );
    }

    // Fallback 2: Questions générales "que sais-tu de moi"
    if (relevantFacts.length === 0 && /que sais.*moi|connais.*moi|sais de moi/i.test(userMessage)) {
      console.log('🔄 Fallback: récupère TOUS les faits utilisateur');
      const allFacts = await this.longTermMemory.getAll();
      relevantFacts = allFacts.filter(f => {
        const sub = f.subject.toLowerCase();
        return sub === 'patrick' || sub === 'utilisateur' || sub === userName?.toLowerCase();
      });
    }

    // Fallback 3: Si question sur animaux et pas de résultats, cherche TOUS les faits d'animaux
    if (relevantFacts.length === 0 && /animaux|animal|chat|chien|canari|souris|oiseau/i.test(userMessage)) {
      console.log('🔄 Fallback: recherche tous les animaux');
      const allFacts = await this.longTermMemory.getAll();
      relevantFacts = allFacts.filter(f =>
        /chat|chien|canari|souris|oiseau|animal|possède|a un|nommé/i.test(f.predicate) ||
        /chat|chien|canari|souris|oiseau|Belphégor|Pixel|CuiCui|Mimi/i.test(f.objects.join(' '))
      );
    }

    // Fallback 4: Questions sur les goûts (aime, préfère)
    if (relevantFacts.length === 0 && /aime|préfère|goûts|aliments|nourriture/i.test(userMessage)) {
      console.log('🔄 Fallback: recherche tous les goûts');
      const allFacts = await this.longTermMemory.getAll();
      relevantFacts = allFacts.filter(f =>
        f.predicate === 'aime' || f.predicate === 'préfère' || f.predicate === 'adore'
      );
    }

    console.log(`📚 ${relevantFacts.length} faits pertinents trouvés`);

    // 5. Construction du contexte mémoire EXPLICITE
    let memoryContext = "\n\n═══════════════════════════════════════";
    memoryContext += "\n        MÉMOIRE LONG TERME";
    memoryContext += "\n═══════════════════════════════════════";

    if (userName) {
      memoryContext += `\n\n👤 Utilisateur : ${userName}`;
    }

    if (relevantFacts.length > 0) {
      memoryContext += "\n\n📋 FAITS CONNUS (UTILISE CES INFORMATIONS EXACTEMENT) :\n";

      // Groupe par catégorie pour faciliter le comptage
      const grouped = relevantFacts.reduce((acc, f) => {
        let category = f.predicate;

        // Simplifie les catégories
        if (/chat.*nommé|a un chat/i.test(category)) category = 'chat';
        else if (/chien.*nommé|a un chien/i.test(category)) category = 'chien';
        else if (/canari.*nommé|a un canari/i.test(category)) category = 'canari';
        else if (/souris.*nommé|a une souris/i.test(category)) category = 'souris';
        else if (/aime/i.test(category)) category = 'aime';

        if (!acc[category]) acc[category] = [];
        acc[category].push(...f.objects);
        return acc;
      }, {} as Record<string, string[]>);

      Object.entries(grouped).forEach(([cat, items]) => {
        const uniqueItems = [...new Set(items)];
        if (uniqueItems.length > 1) {
          memoryContext += `  • ${cat} : ${uniqueItems.join(', ')} [TOTAL: ${uniqueItems.length}]\n`;
        } else {
          memoryContext += `  • ${cat} : ${uniqueItems[0]}\n`;
        }
      });

      // Si question sur nombre d'animaux, compte explicitement
      if (/combien.*animaux/i.test(userMessage)) {
        const animalCategories = Object.keys(grouped).filter(k =>
          ['chat', 'chien', 'canari', 'souris', 'oiseau', 'lapin', 'poisson'].includes(k.toLowerCase())
        );
        if (animalCategories.length > 0) {
          memoryContext += `\n⚠️  IMPORTANT : L'utilisateur a ${animalCategories.length} animaux au total.\n`;
        }
      }
    } else {
      memoryContext += "\n\n❌ AUCUN FAIT PERTINENT dans la mémoire pour cette question.";
      memoryContext += "\n   → Réponds clairement : \"Je n'ai pas cette information en mémoire.\"\n";
    }

    memoryContext += "\n═══════════════════════════════════════\n";

    // 6. Préparation des messages pour Ollama
    this.memory.addMessage('user', userMessage);

    const t3 = Date.now();
    const response = await this.ollama.chat({
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + memoryContext },
        ...this.memory.getMessages()
      ],
      options: {
        temperature: 0.3,
        num_predict: 150,  // Limite la réponse à 150 tokens max pour plus de rapidité
        stop: ['###', 'User:', 'Assistant:', '###User', '###Assistant']
      }
    });
    console.log(`⏱️  Génération LLM en ${Date.now() - t3}ms`);

    let assistantMessage = response.message.content;

    // 7. Nettoyage des marqueurs système
    assistantMessage = assistantMessage
      .replace(/###\s*(Assistant|User|System|Utilisateur|LIZZI):?/gi, '')
      .replace(/^(Assistant|Lizzi|Réponse)[\s:]+/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Garde seulement la première réponse si plusieurs tours
    const firstResponse = assistantMessage.split(/\n(?:User|Assistant|Utilisateur):/i)[0];
    if (firstResponse.length > 0) {
      assistantMessage = firstResponse.trim();
    }

    // 8. Gestion des outils
    const toolCall = this.detectToolCall(assistantMessage);
    if (toolCall && toolCall.tool) {
      const toolResult = await this.toolSystem.executeTool(toolCall.tool, toolCall.params);
      const followUp = await this.ollama.chat({
        model: this.model,
        messages: [
          ...this.memory.getMessages(),
          { role: 'assistant', content: assistantMessage },
          {
            role: 'user',
            content: `Résultat de l'outil ${toolCall.tool} : ${JSON.stringify(toolResult, null, 2)}\n\nFormule une réponse naturelle avec ce résultat.`
          }
        ],
        options: { temperature: 0.3 }
      });
      assistantMessage = followUp.message.content
        .replace(/###\s*(Assistant|User|System):?/gi, '')
        .trim();
    }

    this.memory.addMessage('assistant', assistantMessage);
    console.log(`⏱️  TEMPS TOTAL: ${Date.now() - startTime}ms`);
    return assistantMessage;
  }

  // --- MÉTHODES API POUR SERVER.TS ---

  clearMemory(): void {
    this.memory.clear();
  }

  async getAllFacts(): Promise<Fact[]> {
    return await this.longTermMemory.getAll();
  }

  async searchFacts(query: string): Promise<Fact[]> {
    const queryVector = await this.longTermMemory.generateEmbedding(this.ollama, query);
    return await this.longTermMemory.vectorSearch(queryVector);
  }

  async saveFact(predicate: string, object: string, subject: string = 'Utilisateur'): Promise<Fact> {
    return await this.longTermMemory.add(predicate, object, subject, this.ollama);
  }

  async updateFact(id: string, predicate: string, objects: string[] | string, subject?: string): Promise<Fact | null> {
    const objectsArray = Array.isArray(objects) ? objects : [objects];
    return await this.longTermMemory.update(id, predicate, objectsArray, subject || 'Utilisateur', this.ollama);
  }

  async deleteFact(id: string): Promise<boolean> {
    return await this.longTermMemory.delete(id);
  }

  async clearLongTermMemory(): Promise<void> {
    const facts = await this.longTermMemory.getAll();
    for (const fact of facts) {
      await this.longTermMemory.delete(fact.id);
    }
  }
}
