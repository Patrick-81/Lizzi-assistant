// src/core/assistant.ts - VERSION CORRIGÉE COMPLÈTE
import 'dotenv/config';
import { LlamaCppClient } from './llm-client.js';
import { SYSTEM_PROMPT } from './personality.js';
import { ConversationMemory } from './memory.js';
import { LongTermMemory, Fact } from './long-term-memory.js';
import { MemoryDetector } from './memory-detector.js';
import { SemanticExtractor } from './semantic-extractor.js';
import { ToolSystem } from './tools.js';
import { LocalCalendarClient } from './local-calendar.js';

export type StreamEvent =
  | { type: 'thinking' }
  | { type: 'token'; text: string }
  | { type: 'done'; message: string; tokenInfo?: string; calendarAction?: { year: number; month: number } }
  | { type: 'error'; message: string };


export class Assistant {
  private llm: LlamaCppClient;
  private embeddingClient: LlamaCppClient;
  private memory: ConversationMemory;
  private static sharedLongTermMemory: LongTermMemory | null = null;
  private longTermMemory: LongTermMemory;
  private memoryDetector: MemoryDetector;
  private semanticExtractor: SemanticExtractor;
  private toolSystem: ToolSystem;
  private localCalendar: LocalCalendarClient;
  private model: string;
  private embeddingModel: string;
  private hasAskedName: boolean = false;
  private isFirstMessage: boolean = true;

  private readonly CTX_SIZE = parseInt(process.env.CTX_SIZE || '4096');
  private readonly MAX_TOKENS = 1500;
  // Estimation : ~2 chars/token pour du texte français avec markup et JSON
  // (les modèles récents tokenisent plus finement que l'estimation naïve à 4 chars/token)
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 2);
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
    this.localCalendar = new LocalCalendarClient();
  }

  /** Injecte un calendar client partagé (évite les instances multiples avec caches divergents) */
  setCalendarClient(client: LocalCalendarClient) {
    this.localCalendar = client;
  }

  async initialize() {
    await this.longTermMemory.initialize(this.embeddingClient, this.embeddingModel);
    this.toolSystem.setMemoryContext({
      longTermMemory: this.longTermMemory,
      embeddingClient: this.embeddingClient,
      embeddingModel: this.embeddingModel
    });

    // Fonction d'embedding partagée avec le calendrier
    const embeddingFn = async (text: string): Promise<number[]> => {
      try {
        const res = await this.embeddingClient.embeddings({ model: this.embeddingModel, prompt: text });
        return res.embedding;
      } catch { return []; }
    };

    // N'initialise le calendar que s'il n'a pas déjà été injecté/chargé
    if (!this.localCalendar.isReady()) await this.localCalendar.initialize();
    this.localCalendar.setEmbeddingFn(embeddingFn);
    this.toolSystem.setCalendarContext(this.localCalendar, embeddingFn);
  }

  getCalendarClient(): LocalCalendarClient {
    return this.localCalendar;
  }

  private async getUserName(): Promise<string | null> {
    const facts = await this.longTermMemory.getAll();
    // Cherche un fait "s'appelle" ou "nom" quel que soit le sujet
    const nameFact = facts.find(
      f => f.predicate === 's\'appelle' || f.predicate === 'nom'
    );
    return nameFact?.objects[0] || null;
  }

  private toolFollowUpInstruction(toolName: string, toolResult: any): string {
    const hasFormatted = typeof toolResult?.formatted === 'string' && toolResult.formatted.trim().length > 0;
    if (hasFormatted) {
      // Si la liste d'événements contient des IDs, les fournir comme référence interne (sans les afficher à l'utilisateur)
      let idMapping = '';
      if (Array.isArray(toolResult.events) && toolResult.events.length > 0 && toolResult.events[0]?.id) {
        const lines = toolResult.events.map((ev: any, i: number) =>
          `  ${i + 1}. id="${ev.id}" — ${ev.summary}`
        ).join('\n');
        idMapping = `\n\n[Référence interne — IDs à utiliser pour delete/update, NE PAS afficher à l'utilisateur]\n${lines}`;
      }
      return `Résultat de l'outil ${toolName} :\n${toolResult.formatted}${idMapping}\n\nSi tu dois appeler un autre outil, génère le JSON. Sinon, présente ce contenu à l'utilisateur en Markdown (liste, titres, etc.) sans le résumer ni le tronquer — affiche TOUT le contenu. N'affiche jamais les UUIDs.`;
    }
    return `Résultat de l'outil ${toolName} : ${JSON.stringify(toolResult, null, 2)}\n\nSi tu dois appeler un autre outil, génère le JSON. Sinon, formule une réponse naturelle TRÈS COURTE (2 phrases max).`;
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

  private isCalendarShowIntent(text: string): boolean {
    return /\b(montre|affiche|montre-moi|affiche-moi|voir|consulte?r?|présente)\b.{0,30}\b(agenda|calendrier)\b/i.test(text) ||
      /\b(agenda|calendrier)\b.{0,30}\b(f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre|janvier)\b/i.test(text) ||
      /\bqu'est-ce que j'ai (pr[eé]vu|planifi[eé])\b/i.test(text);
  }

  private parseMonthFromText(text: string): { year: number; month: number } {
    const MONTHS: Record<string, number> = {
      janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5,
      juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9,
      octobre: 10, novembre: 11, décembre: 12, decembre: 12
    };
    const lower = text.toLowerCase();
    for (const [name, num] of Object.entries(MONTHS)) {
      if (lower.includes(name)) {
        const yearMatch = text.match(/\b(20\d{2})\b/);
        const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
        return { year, month: num };
      }
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }



  /**
   * Élargit la requête pour améliorer la recherche vectorielle
   */
  private expandQuery(query: string): string {

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

  /** Retourne une salutation de bienvenue pour le début de session. */
  async greet(): Promise<string> {
    const userName = await this.getUserName();
    if (userName) {
      return `Bonjour ${userName} ! 😊 Comment puis-je t'aider ?`;
    }
    // Si le nom est inconnu, on marque qu'on a déjà posé la question
    this.hasAskedName = true;
    return "Bonjour ! 😊 Avant que nous fassions plus ample connaissance, comment t'appelles-tu ?";
  }

  async chat(userMessage: string): Promise<{ message: string; tokenInfo?: string; calendarAction?: { year: number; month: number } }> {
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

      await this.longTermMemory.add("s'appelle", extractedName, "Utilisateur");
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
            triple.subject
          );
        } else if (!duplicate) {
          console.log(`🆕 Nouveau souvenir: ${triple.subject} ${triple.predicate} ${triple.object}`);
          await this.longTermMemory.add(
            triple.predicate,
            triple.object,
            triple.subject
          );
        } else {
          console.log('⏭️ Fait déjà existant, pas de modification');
        }

        // Confirmation à l'utilisateur (on évite "Patrick s'appelle Patrick" en utilisant "tu")
        const subjectDisplay = triple.subject === userName || triple.subject === 'Utilisateur'
          ? 'tu'
          : triple.subject;
        return { message: `C'est noté ! Je me souviendrai que ${subjectDisplay} ${triple.predicate} ${triple.object}.` };
      } else {
        console.log('⚠️ Impossible d\'extraire un triplet valide');
      }
    } else {
      console.log('⭕ Pas de mot-clé de mémorisation détecté');
    }

    // 5. AGENDA — Affichage du widget calendrier (action UI pure)
    if (this.isCalendarShowIntent(userMessage)) {
      console.log('📅 Intention affichage agenda détectée');
      const { year, month } = this.parseMonthFromText(userMessage);
      try {
        const result = await this.toolSystem.executeTool('show_calendar', { year, month });
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const evCount = (result.count as number) || 0;
        const msg = evCount === 0
          ? `Ton agenda de ${monthName} est vide. 📅`
          : `Voici ton agenda de ${monthName} — ${evCount} événement(s). 📅\n${result.formatted}`;
        this.memory.addMessage('user', userMessage);
        this.memory.addMessage('assistant', msg);
        // On retourne une version concise pour l'affichage (le détail est en mémoire)
        const displayMsg = evCount === 0
          ? msg
          : `Voici ton agenda de ${monthName} — ${evCount} événement(s). 📅`;
        return { message: displayMsg, calendarAction: { year, month } };
      } catch (e: any) {
        console.error('❌ Erreur affichage agenda:', e.message);
      }
    }

    // 5. CONTEXTE LLM + APPEL LLM (toutes les opérations agenda gérées par le LLM via tools)
    const ctx = await this.buildLLMContext(userMessage, userName);
    if ('saturation' in ctx) return { message: ctx.saturation };

    const t3 = Date.now();
    const response = await this.llm.chat({
      model: this.model,
      messages: ctx.allMessages,
      options: {
        temperature: 0.3,
        max_tokens: ctx.effectiveMaxTokens,
        stop: ['###', 'User:', 'Assistant:', '###User', '###Assistant', '<|im_end|>', '<|im_start|>', '<|eot_id|>', '[INST]']
      }
    });
    console.log(`⏱️  Génération LLM en ${Date.now() - t3}ms`);

    let assistantMessage = this.cleanLLMResponse(response.message.content);
    console.log(`🤖 Réponse LLM brute: "${assistantMessage.slice(0, 200)}"`);

    // 6. Boucle d'outils (jusqu'à 8 tours : ex. agenda_list → agenda_delete multiple)
    let calendarAction: { year: number; month: number } | undefined;
    let toolMessages = [...ctx.allMessages];
    let loopCount = 0;

    while (loopCount < 8) {
      const toolCall = this.detectToolCall(assistantMessage);
      if (!toolCall?.tool) break;

      console.log(`🔧 Outil détecté: ${toolCall.tool}`, JSON.stringify(toolCall.params));
      const toolResult = await this.toolSystem.executeTool(toolCall.tool, toolCall.params);
      console.log(`✅ Résultat outil ${toolCall.tool}:`, JSON.stringify(toolResult).slice(0, 200));

      if (toolResult.showCalendar) calendarAction = toolResult.showCalendar;

      toolMessages = [
        ...toolMessages,
        { role: 'assistant', content: assistantMessage },
        { role: 'user', content: this.toolFollowUpInstruction(toolCall.tool, toolResult) }
      ];

      const followUp = await this.llm.chat({
        model: this.model,
        messages: toolMessages,
        options: { temperature: 0.3, stop: ['<|im_end|>', '<|im_start|>', '<|eot_id|>', '[INST]', '###User', '###Assistant'] }
      });
      assistantMessage = this.cleanLLMResponse(followUp.message.content);
      console.log(`🤖 Follow-up [${loopCount + 1}]: "${assistantMessage.slice(0, 200)}"`);

      loopCount++;
    }

    const displayMessage = assistantMessage;
    this.memory.addMessage('assistant', assistantMessage);

    // Statistiques tokens (retournées séparément, pas dans le texte vocal)
    const responseTokens = this.estimateTokens(assistantMessage);
    const tokenInfo = `~${ctx.promptTokens} tokens prompt · ~${responseTokens} tokens réponse · ${this.CTX_SIZE - ctx.promptTokens - responseTokens} restants`;

    console.log(`⏱️  TEMPS TOTAL: ${Date.now() - startTime}ms`);
    return { message: displayMessage, tokenInfo, calendarAction };
  }

  // --- MÉTHODES PRIVÉES : PRÉPARATION DU CONTEXTE LLM ---

  /** Construit les messages prêts à envoyer au LLM (embedding, mémoire, formatage). */
  private async buildLLMContext(userMessage: string, userName: string | null): Promise<
    { allMessages: Array<{ role: string; content: string }>; effectiveMaxTokens: number; promptTokens: number } |
    { saturation: string }
  > {
    const expandedQuery = this.expandQuery(userMessage);
    console.log('🔎 Requête élargie:', expandedQuery);

    const t1 = Date.now();
    const queryVector = await this.longTermMemory.generateEmbedding(expandedQuery);
    console.log(`⏱️  Embedding généré en ${Date.now() - t1}ms`);

    const t2 = Date.now();
    let relevantFacts = await this.longTermMemory.vectorSearch(queryVector, 0.35);
    console.log(`⏱️  Recherche vectorielle en ${Date.now() - t2}ms`);

    const cacheStatus = this.longTermMemory.getCacheStatus();
    console.log(`📊 Cache: ${cacheStatus.cachedVectors}/${cacheStatus.totalFacts} vecteurs (${cacheStatus.missingVectors} manquants)`);

    let allFactsCache: Fact[] | null = null;
    const getAllFacts = async () => { if (!allFactsCache) allFactsCache = await this.longTermMemory.getAll(); return allFactsCache; };

    if (relevantFacts.length === 0 && /comment.*appelle|quel.*nom|mon nom|mon prénom/i.test(userMessage))
      relevantFacts = (await getAllFacts()).filter(f => f.predicate === "s'appelle" || f.predicate === 'nom' || f.subject === 'Utilisateur');
    if (relevantFacts.length === 0 && /que sais.*moi|connais.*moi|sais de moi/i.test(userMessage))
      relevantFacts = (await getAllFacts()).filter(f => { const s = f.subject.toLowerCase(); return s === 'patrick' || s === 'utilisateur' || s === userName?.toLowerCase(); });
    if (relevantFacts.length === 0 && /animaux|animal|chat|chien|canari|souris|oiseau/i.test(userMessage))
      relevantFacts = (await getAllFacts()).filter(f => /chat|chien|canari|souris|oiseau|animal|possède|a un|nommé/i.test(f.predicate) || /chat|chien|canari|souris|oiseau|Belphégor|Pixel|CuiCui|Mimi/i.test(f.objects.join(' ')));
    if (relevantFacts.length === 0 && /aime|préfère|goûts|aliments|nourriture/i.test(userMessage))
      relevantFacts = (await getAllFacts()).filter(f => f.predicate === 'aime' || f.predicate === 'préfère' || f.predicate === 'adore');

    console.log(`📚 ${relevantFacts.length} faits pertinents trouvés`);

    let memoryContext = "\n\n═══════════════════════════════════════";
    memoryContext += "\n        MÉMOIRE LONG TERME";
    memoryContext += "\n═══════════════════════════════════════";
    if (userName) memoryContext += `\n\n👤 Utilisateur : ${userName}`;

    if (relevantFacts.length > 0) {
      memoryContext += "\n\n📋 FAITS CONNUS (UTILISE CES INFORMATIONS EXACTEMENT) :\n";
      const grouped = relevantFacts.reduce((acc, f) => {
        let category = f.predicate;
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
        const unique = [...new Set(items)];
        memoryContext += unique.length > 1
          ? `  • ${cat} : ${unique.join(', ')} [TOTAL: ${unique.length}]\n`
          : `  • ${cat} : ${unique[0]}\n`;
      });
      if (/combien.*animaux/i.test(userMessage)) {
        const animalCats = Object.keys(grouped).filter(k => ['chat', 'chien', 'canari', 'souris', 'oiseau', 'lapin', 'poisson'].includes(k.toLowerCase()));
        if (animalCats.length > 0) memoryContext += `\n⚠️  IMPORTANT : L'utilisateur a ${animalCats.length} animaux au total.\n`;
      }
    } else {
      memoryContext += "\n\n❌ AUCUN FAIT PERTINENT dans la mémoire pour cette question.";
      memoryContext += "\n   → Réponds clairement : \"Je n'ai pas cette information en mémoire.\"\n";
    }
    memoryContext += "\n═══════════════════════════════════════\n";

    this.memory.addMessage('user', userMessage);

    const now = new Date();
    const dateContext = `\n\n### DATE ET HEURE ACTUELLES\nAujourd'hui : ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} — ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.\nUtilise toujours cette date comme référence.`;

    // Injection du contexte agenda supprimée : le LLM appelle agenda_list/agenda_search lui-même via les outils

    const systemContent = SYSTEM_PROMPT + dateContext + memoryContext + '\n\n' + this.toolSystem.getToolDescriptions();
    const allMessages = [{ role: 'system', content: systemContent }, ...this.memory.getMessages()];

    const promptTokens = allMessages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
    const available = this.CTX_SIZE - promptTokens;
    console.log(`📊 Tokens estimés — prompt: ~${promptTokens}, disponibles pour réponse: ~${available}`);

    if (available < 400) {
      const warning = `⚠️ Le contexte est saturé (~${promptTokens} tokens utilisés sur ${this.CTX_SIZE}). Je ne peux pas répondre correctement. Essaie de vider l'historique ou de poser une question plus courte.`;
      this.memory.addMessage('assistant', warning);
      return { saturation: warning };
    }
    if (available < 800) console.warn(`⚠️ Peu de tokens disponibles pour la réponse (~${available})`);

    const effectiveMaxTokens = Math.min(this.MAX_TOKENS, available - 50);
    return { allMessages, effectiveMaxTokens, promptTokens };
  }

  /** Nettoie la réponse brute du LLM (blocs think, marqueurs système). */
  private cleanLLMResponse(raw: string): string {
    return raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/\[THINK\][\s\S]*?\[\/THINK\]/gi, '')
      .replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/gi, '')
      // Tokens de format de chat qui fuient dans la réponse (Mistral/Qwen/ChatML)
      .split(/<\|im_end\|>/i)[0]
      .split(/<\|im_start\|>/i)[0]
      .split(/<\|eot_id\|>/i)[0]
      .replace(/\[INST\][\s\S]*?\[\/INST\]/gi, '')
      .replace(/###\s*(Assistant|User|System|Utilisateur|LIZZI):?/gi, '')
      .replace(/^(Assistant|Lizzi|Réponse)[\s:]+/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .split(/\n(?:User|Assistant|Utilisateur):/i)[0]
      .trim();
  }

  // --- STREAMING ---

  async *chatStream(userMessage: string): AsyncGenerator<StreamEvent> {
    const startTime = Date.now();
    const userName = await this.getUserName();

    // Pour tous les cas spéciaux (gestion du nom, mémoire explicite, affichage agenda),
    // on délègue à chat() car ces chemins sont rapides (<500ms) et peu fréquents.
    const isSpecialCase =
      !userName ||
      this.memoryDetector.detect(userMessage) ||
      this.isCalendarShowIntent(userMessage);

    if (isSpecialCase) {
      try {
        const result = await this.chat(userMessage);
        yield { type: 'token', text: result.message };
        yield { type: 'done', message: result.message, tokenInfo: result.tokenInfo, calendarAction: result.calendarAction };
      } catch (e: any) {
        yield { type: 'error', message: e.message };
      }
      return;
    }

    // Chemin normal : streaming LLM réel
    yield { type: 'thinking' };

    const ctx = await this.buildLLMContext(userMessage, userName);
    if ('saturation' in ctx) {
      yield { type: 'token', text: ctx.saturation };
      yield { type: 'done', message: ctx.saturation };
      return;
    }

    // Stream avec filtrage des blocs [THINK]...[/THINK]
    const THINK_OPENS = ['[THINK]', '<think>', '[THINKING]'];
    const THINK_CLOSES = ['[/THINK]', '</think>', '[/THINKING]'];
    let buffer = '';
    let thinkDone = false;
    let fullResponse = '';

    for await (const chunk of this.llm.chatStream({
      model: this.model,
      messages: ctx.allMessages,
      options: { temperature: 0.3, max_tokens: ctx.effectiveMaxTokens, stop: ['###', 'User:', 'Assistant:', '###User', '###Assistant', '<|im_end|>', '<|im_start|>', '<|eot_id|>', '[INST]'] }
    })) {
      buffer += chunk;

      if (!thinkDone) {
        const closeTag = THINK_CLOSES.find(t => buffer.includes(t));
        if (closeTag) {
          // Fin du bloc think : on émet ce qui vient après
          const afterThink = buffer.slice(buffer.indexOf(closeTag) + closeTag.length).trimStart();
          thinkDone = true;
          buffer = '';
          if (afterThink) { yield { type: 'token', text: afterThink }; fullResponse += afterThink; }
        } else if (!THINK_OPENS.some(t => buffer.startsWith(t) || buffer.includes(t)) && buffer.length > 14) {
          // Pas de bloc think — on commence à streamer directement
          thinkDone = true;
          yield { type: 'token', text: buffer };
          fullResponse += buffer;
          buffer = '';
        }
        // sinon: on est dans le bloc think, on continue d'accumuler
      } else {
        yield { type: 'token', text: chunk };
        fullResponse += chunk;
        buffer = '';
      }
    }

    // Vider le buffer restant
    if (buffer.length > 0 && thinkDone) { yield { type: 'token', text: buffer }; fullResponse += buffer; }

    // Nettoyage post-stream
    let assistantMessage = this.cleanLLMResponse(fullResponse);
    console.log(`🤖 [STREAM] Réponse LLM brute: "${assistantMessage.slice(0, 200)}"`);

    // Boucle d'outils (jusqu'à 8 tours : ex. agenda_list → agenda_delete multiple)
    let calendarAction: { year: number; month: number } | undefined;
    let toolMessages = [...ctx.allMessages];
    let loopCount = 0;

    while (loopCount < 8) {
      const toolCall = this.detectToolCall(assistantMessage);
      if (!toolCall?.tool) break;

      console.log(`🔧 [STREAM] Outil détecté: ${toolCall.tool}`, JSON.stringify(toolCall.params));
      const toolResult = await this.toolSystem.executeTool(toolCall.tool, toolCall.params);
      console.log(`✅ [STREAM] Résultat ${toolCall.tool}:`, JSON.stringify(toolResult).slice(0, 200));

      if (toolResult.showCalendar) calendarAction = toolResult.showCalendar;

      toolMessages = [
        ...toolMessages,
        { role: 'assistant', content: assistantMessage },
        { role: 'user', content: this.toolFollowUpInstruction(toolCall.tool, toolResult) }
      ];

      const followUp = await this.llm.chat({
        model: this.model,
        messages: toolMessages,
        options: { temperature: 0.3, stop: ['<|im_end|>', '<|im_start|>', '<|eot_id|>', '[INST]', '###User', '###Assistant'] }
      });
      assistantMessage = this.cleanLLMResponse(followUp.message.content);
      console.log(`🤖 [STREAM] Follow-up [${loopCount + 1}]: "${assistantMessage.slice(0, 200)}"`);

      loopCount++;
    }

    const displayMessage = assistantMessage;
    this.memory.addMessage('assistant', assistantMessage);
    const responseTokens = this.estimateTokens(assistantMessage);
    const tokenInfo = `~${ctx.promptTokens} tokens prompt · ~${responseTokens} tokens réponse · ${this.CTX_SIZE - ctx.promptTokens - responseTokens} restants`;
    console.log(`⏱️  STREAM TOTAL: ${Date.now() - startTime}ms`);
    yield { type: 'done', message: displayMessage, tokenInfo, calendarAction };
  }

  // --- MÉTHODES API POUR SERVER.TS ---

  clearMemory(): void {
    this.memory.clear();
  }

  async getAllFacts(): Promise<Fact[]> {
    return await this.longTermMemory.getAll();
  }

  async searchFacts(query: string): Promise<Fact[]> {
    const queryVector = await this.longTermMemory.generateEmbedding(query);
    return await this.longTermMemory.vectorSearch(queryVector);
  }

  async saveFact(predicate: string, object: string, subject: string = 'Utilisateur'): Promise<Fact> {
    return await this.longTermMemory.add(predicate, object, subject);
  }

  async updateFact(id: string, predicate: string, objects: string[] | string, subject?: string): Promise<Fact | null> {
    const objectsArray = Array.isArray(objects) ? objects : [objects];
    return await this.longTermMemory.update(id, predicate, objectsArray, subject || 'Utilisateur');
  }

  async deleteFact(id: string): Promise<boolean> {
    return await this.longTermMemory.delete(id);
  }

  async clearLongTermMemory(): Promise<void> {
    await this.longTermMemory.clearAll();
  }
}
