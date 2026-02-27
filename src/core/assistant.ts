// src/core/assistant.ts - VERSION CORRIGÉE COMPLÈTE
import 'dotenv/config';
import { LlamaCppClient } from './llm-client.js';
import { SYSTEM_PROMPT } from './personality.js';
import { ConversationMemory } from './memory.js';
import { LongTermMemory, Fact } from './long-term-memory.js';
import { MemoryDetector } from './memory-detector.js';
import { SemanticExtractor } from './semantic-extractor.js';
import { ToolSystem } from './tools.js';
import { LocalCalendarClient, LocalEvent } from './local-calendar.js';

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
  private pendingDeletion: { event: LocalEvent } | null = null;

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
    this.localCalendar = new LocalCalendarClient();
  }

  async initialize() {
    await this.longTermMemory.initialize(this.embeddingClient, this.embeddingModel);
    this.toolSystem.setMemoryContext({
      longTermMemory: this.longTermMemory,
      embeddingClient: this.embeddingClient,
      embeddingModel: this.embeddingModel
    });
    await this.localCalendar.initialize();
    this.toolSystem.setCalendarContext(this.localCalendar);
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

  private detectToolCall(text: string): { tool: string; params: any } | null {
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (!jsonMatch) {
      const directMatch = text.match(/\{[\s\S]*"tool"[\s\S]*\}/);
      if (!directMatch) return null;
      try { return JSON.parse(directMatch[0]); } catch { return null; }
    }
    try { return JSON.parse(jsonMatch[1]); } catch { return null; }
  }

  /** Détecte si le message demande de créer un événement dans l'agenda */
  private isCalendarCreateIntent(text: string): boolean {
    const hasDate = /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(text) || /\bdemain\b/i.test(text);
    const hasTime = /\bà \d{1,2}h\d{0,2}\b/i.test(text) || /\b\d{2}:\d{2}\b/.test(text);
    const hasCalendarAction = /\bagenda\b|\bcalendrier\b/i.test(text) &&
      /\bnote|enregistre|ajoute|inscris|mets|crée|planifie\b/i.test(text);
    return hasCalendarAction && (hasDate || hasTime);
  }

  /** Détecte si le message demande d'afficher l'agenda */
  private isCalendarShowIntent(text: string): boolean {
    return /\b(montre|affiche|montre-moi|affiche-moi|voir|consulte?r?|présente)\b.{0,30}\b(agenda|calendrier)\b/i.test(text) ||
      /\b(agenda|calendrier)\b.{0,30}\b(f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre|janvier)\b/i.test(text) ||
      /\bqu'est-ce que j'ai (pr[eé]vu|planifi[eé])\b/i.test(text);
  }

  /** Extrait les détails d'un événement depuis le texte */
  private parseEventFromText(text: string): { summary: string; start: string; end: string } | null {
    const MONTHS: Record<string, number> = {
      janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5,
      juin: 6, juillet: 7, août: 8, aout: 8, septembre: 9,
      octobre: 10, novembre: 11, décembre: 12, decembre: 12
    };

    let year: number | null = null, month: number | null = null, day: number | null = null;
    let hours = 12, minutes = 0;

    // Date JJ/MM/AAAA ou JJ-MM-AAAA
    const dmy = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
    if (dmy) { day = parseInt(dmy[1]); month = parseInt(dmy[2]); year = parseInt(dmy[3]); }

    // "demain"
    if (!day && /\bdemain\b/i.test(text)) {
      const d = new Date(); d.setDate(d.getDate() + 1);
      day = d.getDate(); month = d.getMonth() + 1; year = d.getFullYear();
    }

    // Heure "à 12h00" ou "12:00"
    const hm = text.match(/\bà (\d{1,2})h(\d{0,2})\b/i) || text.match(/\b(\d{2}):(\d{2})\b/);
    if (hm) { hours = parseInt(hm[1]); minutes = parseInt(hm[2] || '0'); }

    if (!day || !month || !year) return null;

    const pad = (n: number) => String(n).padStart(2, '0');
    const start = `${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00`;

    // Fin = début + 1h
    const endDate = new Date(start);
    endDate.setHours(endDate.getHours() + 1);
    const end = endDate.toISOString().slice(0, 19);

    // Titre : texte après ":" ou après le pattern date/heure, sinon tout le message
    let summary = text;
    const afterColon = text.match(/:\s*(.+)$/);
    if (afterColon) {
      summary = afterColon[1].trim();
    } else {
      // Retire les mots-clés d'action et les éléments date/heure
      summary = text
        .replace(/^(note|enregistre|ajoute|inscris|mets|crée|planifie)\s+(dans\s+mon\s+agenda|dans\s+mon\s+calendrier)?\s*/i, '')
        .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b/, '')
        .replace(/\bdemain\b/i, '')
        .replace(/\bà \d{1,2}h\d{0,2}\b/i, '')
        .replace(/\b\d{2}:\d{2}\b/, '')
        .replace(/^\s*[:\-,]\s*/, '')
        .trim();
    }

    return summary.length > 0 ? { summary, start, end } : null;
  }

  /** Extrait le mois demandé dans une phrase "agenda de mars", "calendrier de février", etc. */
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

  /** Détecte si le message demande de supprimer un événement */
  private isCalendarDeleteIntent(text: string): boolean {
    return /\b(supprime|annule|efface|retire|enlève|enleve|supprimer|annuler|effacer)\b/i.test(text) &&
      /\bagenda\b|\bcalendrier\b|\bévenement\b|\bevenement\b|\brendez-vous\b|\brdv\b|\brepas\b|\bréunion\b|\breunion\b|\brappel\b|le \d|du \d|l'event|l'événement/i.test(text);
  }

  /** Extrait les mots-clés de recherche pour trouver l'événement à supprimer */
  private extractDeleteKeywords(text: string): string {
    return text
      .replace(/\b(supprime|annule|efface|retire|enlève|enleve|supprimer|annuler|effacer)\b/gi, '')
      .replace(/\b(dans mon agenda|de mon agenda|dans l'agenda|de l'agenda|dans le calendrier)\b/gi, '')
      .replace(/\b(l'événement|l'evenement|le rendez-vous|le rdv|le repas|la réunion|mon|mes|cet|cette)\b/gi, '')
      .replace(/\b(s'il te plait|stp|svp)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /** Cherche un événement dans le calendrier local et prépare la suppression avec confirmation */
  private async deleteCalendarEvent(userMessage: string): Promise<string> {
    const keywords = this.extractDeleteKeywords(userMessage);

    const searchResult = await this.localCalendar.searchEvents(keywords, 20);
    let candidates = searchResult.events as any[];

    // Affinage par jour si présent dans le message
    const dmy = userMessage.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
    const dayMatch = userMessage.match(/\ble (\d{1,2})\b/i);
    const dateDay = dmy ? parseInt(dmy[1]) : (dayMatch ? parseInt(dayMatch[1]) : null);
    if (dateDay && candidates.length > 1) {
      const byDate = candidates.filter(ev => {
        const d = new Date(ev.start.dateTime || ev.start.date || 0);
        return d.getDate() === dateDay;
      });
      if (byDate.length > 0) candidates = byDate;
    }

    if (candidates.length === 0) {
      // Dernière chance : match partiel mot par mot
      const allResult = await this.localCalendar.searchEvents('', 100);
      const kwLower = keywords.toLowerCase();
      candidates = (allResult.events as any[]).filter(ev =>
        kwLower.split(' ').some(w => w.length > 3 && ev.summary.toLowerCase().includes(w))
      );
    }

    if (candidates.length === 0) {
      return `Je n'ai trouvé aucun événement correspondant à "${keywords}" dans ton agenda. 🔍`;
    }

    if (candidates.length === 1) {
      const ev = candidates[0];
      const d = new Date(ev.start.dateTime ?? ev.start.date ?? 0);
      const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      const timeStr = ev.start.dateTime
        ? ` à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
        : '';
      this.pendingDeletion = { event: ev };
      return `Tu veux supprimer "${ev.summary}" du ${dateStr}${timeStr} ? (oui / non)`;
    }

    // Plusieurs candidats → lister
    const list = candidates.slice(0, 5).map((ev: any, i: number) => {
      const d = new Date(ev.start.dateTime ?? ev.start.date ?? 0);
      const dateStr = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
      return `${i + 1}. ${ev.summary} — ${dateStr}`;
    }).join('\n');
    return `J'ai trouvé ${candidates.length} événements correspondants, lequel veux-tu supprimer ?\n${list}`;
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

    // 2b. CONFIRMATION DE SUPPRESSION en attente
    if (this.pendingDeletion) {
      const ev = this.pendingDeletion.event;
      const lower = userMessage.toLowerCase().trim();
      const isYes = /^(oui|yes|ok|yep|ouais|confirme|vas-y|go|sup|supprime|c'est ça|exact)/.test(lower);
      const isNo  = /^(non|no|nope|annule|laisse|stop|ne supprime pas|garde)/.test(lower);

      this.pendingDeletion = null;

      if (isYes) {
        try {
          await this.localCalendar.deleteEvent(ev.id);
          const d = new Date(ev.start.dateTime ?? ev.start.date ?? 0);
          const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
          const msg = `✅ "${ev.summary}" du ${dateStr} supprimé.`;
          this.memory.addMessage('user', userMessage);
          this.memory.addMessage('assistant', msg);
          return { message: msg };
        } catch (e: any) {
          const msg = `❌ Erreur lors de la suppression : ${e.message}`;
          this.memory.addMessage('user', userMessage);
          this.memory.addMessage('assistant', msg);
          return { message: msg };
        }
      }

      if (isNo) {
        const msg = `D'accord, je ne supprime rien. 👍`;
        this.memory.addMessage('user', userMessage);
        this.memory.addMessage('assistant', msg);
        return { message: msg };
      }

      // Réponse ambiguë → on repose la question
      const d = new Date(ev.start.dateTime ?? ev.start.date ?? 0);
      const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      this.pendingDeletion = { event: ev }; // remet en attente
      const msg = `Je n'ai pas compris. Tu veux supprimer "${ev.summary}" du ${dateStr} ? (oui / non)`;
      this.memory.addMessage('user', userMessage);
      this.memory.addMessage('assistant', msg);
      return { message: msg };
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

        // Confirmation à l'utilisateur
        return { message: `C'est noté ! Je me souviendrai que ${triple.subject} ${triple.predicate} ${triple.object}.` };
      } else {
        console.log('⚠️ Impossible d\'extraire un triplet valide');
      }
    } else {
      console.log('⭕ Pas de mot-clé de mémorisation détecté');
    }

    // 4. AGENDA — Création d'événement détectée directement (sans passer par le LLM)
    if (this.isCalendarCreateIntent(userMessage)) {
      console.log('📅 Intention création agenda détectée');
      const event = this.parseEventFromText(userMessage);
      if (event) {
        try {
          const result = await this.toolSystem.executeTool('calendar', {
            operation: 'create_event',
            summary: event.summary,
            start: event.start,
            end: event.end
          });
          const startDate = new Date(event.start);
          const dateStr = startDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
          const timeStr = startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          const msg = `✅ Noté dans ton agenda ! "${event.summary}" le ${dateStr} à ${timeStr}.`;
          this.memory.addMessage('user', userMessage);
          this.memory.addMessage('assistant', msg);
          return { message: msg };
        } catch (e: any) {
          console.error('❌ Erreur création événement:', e.message);
        }
      }
    }

    // 5. AGENDA — Affichage détecté directement
    if (this.isCalendarShowIntent(userMessage)) {
      console.log('📅 Intention affichage agenda détectée');
      const { year, month } = this.parseMonthFromText(userMessage);
      try {
        const result = await this.toolSystem.executeTool('calendar', {
          operation: 'show_calendar', year, month
        });
        const monthName = new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const evCount = (result.count as number) || 0;
        const msg = evCount === 0
          ? `Ton agenda de ${monthName} est vide. 📅`
          : `Voici ton agenda de ${monthName} — ${evCount} événement(s). 📅\n${result.formatted}`;
        this.memory.addMessage('user', userMessage);
        this.memory.addMessage('assistant', msg);
        return { message: msg, calendarAction: { year, month } };
      } catch (e: any) {
        console.error('❌ Erreur affichage agenda:', e.message);
      }
    }

    // 6. AGENDA — Suppression d'événement détectée directement
    if (this.isCalendarDeleteIntent(userMessage)) {
      console.log('📅 Intention suppression agenda détectée');
      try {
        const msg = await this.deleteCalendarEvent(userMessage);
        this.memory.addMessage('user', userMessage);
        this.memory.addMessage('assistant', msg);
        return { message: msg };
      } catch (e: any) {
        console.error('❌ Erreur suppression événement:', e.message);
      }
    }

    // 7. CONTEXTE LLM + APPEL LLM (factorisé)
    const ctx = await this.buildLLMContext(userMessage, userName);
    if ('saturation' in ctx) return { message: ctx.saturation };

    const t3 = Date.now();
    const response = await this.llm.chat({
      model: this.model,
      messages: ctx.allMessages,
      options: {
        temperature: 0.3,
        max_tokens: ctx.effectiveMaxTokens,
        stop: ['###', 'User:', 'Assistant:', '###User', '###Assistant']
      }
    });
    console.log(`⏱️  Génération LLM en ${Date.now() - t3}ms`);

    let assistantMessage = this.cleanLLMResponse(response.message.content);

    // 8. Gestion des outils
    let calendarAction: { year: number; month: number } | undefined;
    const toolCall = this.detectToolCall(assistantMessage);
    if (toolCall && toolCall.tool) {
      const toolResult = await this.toolSystem.executeTool(toolCall.tool, toolCall.params);
      if (toolResult.showCalendar) {
        calendarAction = toolResult.showCalendar;
      }
      const followUp = await this.llm.chat({
        model: this.model,
        messages: [
          ...this.memory.getMessages(),
          { role: 'assistant', content: assistantMessage },
          {
            role: 'user',
            content: `Résultat de l'outil ${toolCall.tool} : ${JSON.stringify(toolResult, null, 2)}\n\nFormule une réponse naturelle TRÈS COURTE (2 phrases max) avec ce résultat.`
          }
        ],
        options: { temperature: 0.3 }
      });
      assistantMessage = this.cleanLLMResponse(followUp.message.content);
    }

    this.memory.addMessage('assistant', assistantMessage);

    // Statistiques tokens (retournées séparément, pas dans le texte vocal)
    const responseTokens = this.estimateTokens(assistantMessage);
    const tokenInfo = `~${ctx.promptTokens} tokens prompt · ~${responseTokens} tokens réponse · ${this.CTX_SIZE - ctx.promptTokens - responseTokens} restants`;

    console.log(`⏱️  TEMPS TOTAL: ${Date.now() - startTime}ms`);
    return { message: assistantMessage, tokenInfo, calendarAction };
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
    const systemContent = SYSTEM_PROMPT + dateContext + memoryContext + '\n\n' + this.toolSystem.getToolDescriptions();
    const allMessages = [{ role: 'system', content: systemContent }, ...this.memory.getMessages()];

    const promptTokens = allMessages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
    const available = this.CTX_SIZE - promptTokens;
    console.log(`📊 Tokens estimés — prompt: ~${promptTokens}, disponibles pour réponse: ~${available}`);

    if (available < 100) {
      const warning = `⚠️ Le contexte est saturé (~${promptTokens} tokens utilisés sur ${this.CTX_SIZE}). Je ne peux pas répondre correctement. Essaie de vider l'historique ou de poser une question plus courte.`;
      this.memory.addMessage('assistant', warning);
      return { saturation: warning };
    }
    if (available < 400) console.warn(`⚠️ Peu de tokens disponibles pour la réponse (~${available})`);

    const effectiveMaxTokens = Math.min(this.MAX_TOKENS, available - 50);
    return { allMessages, effectiveMaxTokens, promptTokens };
  }

  /** Nettoie la réponse brute du LLM (blocs think, marqueurs système). */
  private cleanLLMResponse(raw: string): string {
    return raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/\[THINK\][\s\S]*?\[\/THINK\]/gi, '')
      .replace(/\[THINKING\][\s\S]*?\[\/THINKING\]/gi, '')
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

    // Pour tous les cas spéciaux (gestion du nom, mémoire explicite, agenda direct),
    // on délègue à chat() car ces chemins sont rapides (<500ms) et peu fréquents.
    const isSpecialCase =
      !userName ||
      this.pendingDeletion !== null ||
      this.memoryDetector.detect(userMessage) ||
      this.isCalendarCreateIntent(userMessage) ||
      this.isCalendarShowIntent(userMessage) ||
      this.isCalendarDeleteIntent(userMessage);

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
      options: { temperature: 0.3, max_tokens: ctx.effectiveMaxTokens, stop: ['###', 'User:', 'Assistant:', '###User', '###Assistant'] }
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

    // Gestion outils (tool call détecté dans la réponse)
    let calendarAction: { year: number; month: number } | undefined;
    const toolCall = this.detectToolCall(assistantMessage);
    if (toolCall?.tool) {
      const toolResult = await this.toolSystem.executeTool(toolCall.tool, toolCall.params);
      if (toolResult.showCalendar) calendarAction = toolResult.showCalendar;
      const followUp = await this.llm.chat({
        model: this.model,
        messages: [
          ...this.memory.getMessages(),
          { role: 'assistant', content: assistantMessage },
          { role: 'user', content: `Résultat de l'outil ${toolCall.tool} : ${JSON.stringify(toolResult, null, 2)}\n\nFormule une réponse naturelle TRÈS COURTE (2 phrases max) avec ce résultat.` }
        ],
        options: { temperature: 0.3 }
      });
      assistantMessage = this.cleanLLMResponse(followUp.message.content);
    }

    this.memory.addMessage('assistant', assistantMessage);
    const responseTokens = this.estimateTokens(assistantMessage);
    const tokenInfo = `~${ctx.promptTokens} tokens prompt · ~${responseTokens} tokens réponse · ${this.CTX_SIZE - ctx.promptTokens - responseTokens} restants`;
    console.log(`⏱️  STREAM TOTAL: ${Date.now() - startTime}ms`);
    yield { type: 'done', message: assistantMessage, tokenInfo, calendarAction };
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
