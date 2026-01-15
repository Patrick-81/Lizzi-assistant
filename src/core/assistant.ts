// src/core/assistant.ts
import 'dotenv/config';
import { Ollama } from 'ollama';
import { SYSTEM_PROMPT } from './personality.js';
import { ConversationMemory } from './memory.js';
import { LongTermMemory } from './long-term-memory.js';
import { MemoryDetector } from './memory-detector.js';
import { ToolSystem } from './tools.js';

export class Assistant {
  private ollama: Ollama;
  private memory: ConversationMemory;
  private longTermMemory: LongTermMemory;
  private memoryDetector: MemoryDetector;
  private toolSystem: ToolSystem;
  private model: string;
  private hasAskedName: boolean = false;

  constructor() {
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.ollama = new Ollama({ host: ollamaHost });
    this.model = process.env.MODEL_NAME || 'mistral';
    this.memory = new ConversationMemory();
    this.longTermMemory = new LongTermMemory();
    this.memoryDetector = new MemoryDetector();
    this.toolSystem = new ToolSystem();
  }

  async initialize() {
    await this.longTermMemory.initialize();
    
    // Vérifier si on connaît le prénom de l'utilisateur
    const userName = await this.getUserName();
    if (!userName) {
      this.hasAskedName = false;
    }
  }

  private async getUserName(): Promise<string | null> {
    const facts = await this.longTermMemory.getAll();
    const nameFact = facts.find(
      f => (f.subject === 'Utilisateur' || f.subject.toLowerCase() === 'utilisateur') &&
           (f.predicate === 's\'appelle' || f.predicate === 'nom' || f.key === 'nom')
    );
    return nameFact?.objects[0] || null;
  }

  private detectToolCall(text: string): { tool: string; params: any } | null {
    // Cherche un bloc JSON dans la réponse
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (!jsonMatch) {
      // Essaie sans les backticks
      const directMatch = text.match(/\{[\s\S]*"tool"[\s\S]*\}/);
      if (!directMatch) return null;
      try {
        return JSON.parse(directMatch[0]);
      } catch {
        return null;
      }
    }

    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      return null;
    }
  }

  async chat(userMessage: string): Promise<string> {
    // Vérifier si on doit demander le prénom (uniquement au premier message)
    const userName = await this.getUserName();
    if (!userName && !this.hasAskedName && this.memory.getMessages().length === 0) {
      this.hasAskedName = true;
      const greeting = "Bonjour ! 😊 Avant de commencer, j'aimerais savoir comment tu t'appelles ?";
      this.memory.addMessage('assistant', greeting);
      return greeting;
    }

    // Vérifie si c'est une demande de rappel de souvenirs
    if (this.memoryDetector.shouldRecall(userMessage)) {
      const summary = await this.longTermMemory.getSummary();
      this.memory.addMessage('user', userMessage);
      this.memory.addMessage('assistant', summary);
      return summary;
    }

    // Vérifie si c'est une instruction de mémorisation
    if (this.memoryDetector.shouldMemorize(userMessage)) {
      const memoryInstruction = this.memoryDetector.extractMemoryInstruction(userMessage);

      if (memoryInstruction) {
        await this.longTermMemory.add(
          memoryInstruction.predicate,
          memoryInstruction.object,
          memoryInstruction.subject,
          userMessage
        );
      }
    }

    // Récupère les souvenirs pertinents
    const relevantMemories = await this.longTermMemory.search(userMessage);
    let memoryContext = '';

    if (relevantMemories.length > 0) {
      memoryContext = '\n\nSOUVENIRS PERTINENTS :\n';
      relevantMemories.slice(0, 5).forEach(mem => {
        const objects = mem.objects.join(', ');
        memoryContext += `- ${mem.subject} ${mem.predicate}: ${objects}\n`;
      });
    }

    // Ajoute la description des outils disponibles
    const toolsDescription = this.toolSystem.getToolDescriptions();

    this.memory.addMessage('user', userMessage);

    const messages = [
      {
        role: 'system',
        content: SYSTEM_PROMPT + memoryContext + '\n\n' + toolsDescription
      },
      ...this.memory.getMessages()
    ];

    try {
      const response = await this.ollama.chat({
        model: this.model,
        messages: messages,
        stream: false,
        options: {
          temperature: 0.8,
          top_p: 0.9
        }
      });

      let assistantMessage = response.message.content;

      // Détecte si Lizzi veut utiliser un outil
      const toolCall = this.detectToolCall(assistantMessage);

      if (toolCall && toolCall.tool && toolCall.params) {
        // Exécute l'outil
        const toolResult = await this.toolSystem.executeTool(toolCall.tool, toolCall.params);

        // Demande à Lizzi de formuler une réponse avec le résultat
        const followUpMessages = [
          ...messages,
          { role: 'assistant', content: assistantMessage },
          {
            role: 'user',
            content: `Résultat de l'outil ${toolCall.tool} : ${JSON.stringify(toolResult, null, 2)}\n\nFormule maintenant une réponse naturelle et claire pour l'utilisateur avec ce résultat. Ne mentionne pas le JSON ni l'outil, réponds simplement de façon conversationnelle.`
          }
        ];

        const finalResponse = await this.ollama.chat({
          model: this.model,
          messages: followUpMessages,
          stream: false,
          options: {
            temperature: 0.8,
            top_p: 0.9
          }
        });

        assistantMessage = finalResponse.message.content;
      }

      this.memory.addMessage('assistant', assistantMessage);
      return assistantMessage;

    } catch (error) {
      throw new Error(`Erreur Ollama: ${error}`);
    }
  }

  clearMemory() {
    this.memory.clear();
  }

  async clearLongTermMemory() {
    const memories = await this.longTermMemory.getAll();
    for (const mem of memories) {
      if (mem.id) {
        await this.longTermMemory.delete(mem.id);
      }
    }
  }

  // Méthodes pour l'API de gestion des faits
  async getAllFacts() {
    return await this.longTermMemory.getAll();
  }

  async saveFact(key: string, value: string, context?: string) {
    return await this.longTermMemory.add(key, value, 'Utilisateur', context);
  }

  async updateFact(id: string, subject: string, relation: string, object: string) {
    return await this.longTermMemory.update(id, relation, object, subject);
  }

  async deleteFact(id: string) {
    return await this.longTermMemory.delete(id);
  }
}
