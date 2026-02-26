// src/core/assistant.ts - VERSION CORRIGÉE COMPLÈTE
import 'dotenv/config';
import { LlamaCppClient } from './llm-client.js';
import { SYSTEM_PROMPT } from './personality.js';
import { ConversationMemory } from './memory.js';
import { LongTermMemory, Fact } from './long-term-memory.js';
import { MemoryDetector } from './memory-detector.js';
import { SemanticExtractor } from './semantic-extractor.js';
import { ToolSystem } from './tools.js';


export class Assistant {
  private llm: LlamaCppClient;
  private embeddingClient: LlamaCppClient;
  private memory: ConversationMemory;
  private static sharedLongTermMemory: LongTermMemory | null = null;
  private longTermMemory: LongTermMemory;
  private memoryDetector: MemoryDetector;
  private semanticExtractor: SemanticExtractor;
  private toolSystem: ToolSystem;
  private model: string;
  private embeddingModel: string;
  private hasAskedName: boolean = false;

  private readonly CTX_SIZE = parseInt(process.env.CTX_SIZE || '4096');
  private readonly MAX_TOKENS = 1500;
  // Estimation : ~4 caractères par token (approximation)
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  constructor() {
    const llmHost = process.env.LLM_HOST || 'http://localhost:11434';
    const embeddingHost = process.env.EMBEDDING_HOST || llmHost;
    
    this.llm = new LlamaCppClient(llmHost);
    this.embeddingClient = new LlamaCppClient(embeddingHost);
    
    this.model = process.env.MODEL_NAME || 'mistral-7b-instruct';
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'nomic-embed-text-v1.5';
    this.memory = new ConversationMemory();

    if (!Assistant.sharedLongTermMemory) {
      Assistant.sharedLongTermMemory = new LongTermMemory();
    }
    this.longTermMemory = Assistant.sharedLongTermMemory;

    this.memoryDetector = new MemoryDetector();
    this.semanticExtractor = new SemanticExtractor(this.llm, this.model);
    this.toolSystem = new ToolSystem();
  }

  async initialize() {
    await this.longTermMemory.initialize(this.embeddingClient, this.embeddingModel);
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

  async chat(userMessage: string): Promise<{ message: string; tokenInfo?: string }> {
    const startTime = Date.now();
    const userName = await this.getUserName();

    // 1. BLOCAGE : Si on ne connaît pas le nom, on le demande
    if (!userName && !this.hasAskedName) {
      this.hasAskedName = true;
      const greeting = "Bonjour ! 😊 Avant que nous fassions plus ample connaissance, comment t'appelles-tu ?";
      this.memory.addMessage('assistant', greeting);
      return { message: greeting };
    }

    // 2. Si l'utilisateur vient de donner son nom
    if (!userName && this.hasAskedName) {
      const triple = await this.semanticExtractor.extractTriple(userMessage);
      const extractedName = triple?.object || userMessage.trim();

      await this.longTermMemory.add("s'appelle", extractedName, "Utilisateur", this.llm);
      this.hasAskedName = false;
      return { message: `Enchanté ${extractedName} ! Je prends note. Comment puis-je t'aider ?` };
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
          this.embeddingClient,
          this.embeddingModel,
          `${triple.subject} ${triple.predicate}`
        );
        const existingFacts = await this.longTermMemory.vectorSearch(queryForExisting, 0.7);
        const duplicate = existingFacts.find(f =>
          f.subject.toLowerCase() === triple.subject.toLowerCase() &&
          f.predicate.toLowerCase() === triple.predicate.toLowerCase()
        );

        if (duplicate && !duplicate.objects.includes(triple.object)) {
          console.log(`🔄 Mise à jour: ${duplicate.predicate}`);
          // Prédicats à valeur unique (on remplace), les autres sont multi-valeurs (on fusionne)
          const singleValuePredicates = /^(s'appelle|nom|habite|vit à|travaille|est né|âge|est|mesure|pèse)/i;
          const mergedObjects = singleValuePredicates.test(triple.predicate)
            ? [triple.object]
            : [...duplicate.objects, triple.object];
          await this.longTermMemory.update(
            duplicate.id,
            triple.predicate,
            mergedObjects,
            triple.subject,
            this.llm
          );
        } else if (!duplicate) {
          console.log(`🆕 Nouveau souvenir: ${triple.subject} ${triple.predicate} ${triple.object}`);
          await this.longTermMemory.add(
            triple.predicate,
            triple.object,
            triple.subject,
            this.embeddingClient,
            this.embeddingModel
          );
        } else {
          console.log('⏭️ Fait déjà existant, pas de modification');
        }

        // Confirmation à l'utilisateur
        return { message: `C'est noté ! Je me souviendrai que ${triple.subject} ${triple.predicate} ${triple.object}.` };
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

    const queryVector = await this.longTermMemory.generateEmbedding(this.embeddingClient, this.embeddingModel, expandedQuery);
    console.log(`⏱️  Embedding généré en ${Date.now() - t1}ms`);
    
    const t2 = Date.now();
    let relevantFacts = await this.longTermMemory.vectorSearch(queryVector, 0.35);
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

    // 6. Préparation des messages pour LLM
    this.memory.addMessage('user', userMessage);

    const toolDescriptions = this.toolSystem.getToolDescriptions();
    const systemContent = SYSTEM_PROMPT + memoryContext + '\n\n' + toolDescriptions;
    const allMessages = [
      { role: 'system', content: systemContent },
      ...this.memory.getMessages()
    ];

    // Estimation tokens du prompt
    const promptTokens = allMessages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
    const available = this.CTX_SIZE - promptTokens;
    console.log(`📊 Tokens estimés — prompt: ~${promptTokens}, disponibles pour réponse: ~${available}`);

    if (available < 100) {
      const warning = `⚠️ Le contexte est saturé (~${promptTokens} tokens utilisés sur ${this.CTX_SIZE}). Je ne peux pas répondre correctement. Essaie de vider l'historique ou de poser une question plus courte.`;
      this.memory.addMessage('assistant', warning);
      return { message: warning };
    }

    if (available < 400) {
      console.warn(`⚠️ Peu de tokens disponibles pour la réponse (~${available})`);
    }

    const effectiveMaxTokens = Math.min(this.MAX_TOKENS, available - 50);

    const t3 = Date.now();
    const response = await this.llm.chat({
      model: this.model,
      messages: allMessages,
      options: {
        temperature: 0.3,
        max_tokens: effectiveMaxTokens,
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
      const followUp = await this.llm.chat({
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

    // Statistiques tokens (retournées séparément, pas dans le texte vocal)
    const responseTokens = this.estimateTokens(assistantMessage);
    const tokenInfo = `~${promptTokens} tokens prompt · ~${responseTokens} tokens réponse · ${this.CTX_SIZE - promptTokens - responseTokens} restants`;

    console.log(`⏱️  TEMPS TOTAL: ${Date.now() - startTime}ms`);
    return { message: assistantMessage, tokenInfo };
  }

  // --- MÉTHODES API POUR SERVER.TS ---

  clearMemory(): void {
    this.memory.clear();
  }

  async getAllFacts(): Promise<Fact[]> {
    return await this.longTermMemory.getAll();
  }

  async searchFacts(query: string): Promise<Fact[]> {
    const queryVector = await this.longTermMemory.generateEmbedding(this.embeddingClient, this.embeddingModel, query);
    return await this.longTermMemory.vectorSearch(queryVector);
  }

  async saveFact(predicate: string, object: string, subject: string = 'Utilisateur'): Promise<Fact> {
    return await this.longTermMemory.add(predicate, object, subject, this.embeddingClient, this.embeddingModel);
  }

  async updateFact(id: string, predicate: string, objects: string[] | string, subject?: string): Promise<Fact | null> {
    const objectsArray = Array.isArray(objects) ? objects : [objects];
    return await this.longTermMemory.update(id, predicate, objectsArray, subject || 'Utilisateur', this.embeddingClient, this.embeddingModel);
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
