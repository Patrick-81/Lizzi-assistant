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
  }

  private detectToolCall(text: string): { tool: string; params: any } | null {
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (!jsonMatch) {
      const directMatch = text.match(/\{[\s\S]*?\}/);
      if (directMatch) {
        try {
          return JSON.parse(directMatch[0]);
        } catch (e) {
          return null;
        }
      }
      return null;
    }
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (e) {
      return null;
    }
  }

  async chat(userInput: string) {
    try {
      // 1. Détection et enregistrement de la mémoire à long terme
      if (this.memoryDetector.shouldMemorize(userInput)) {
        const result = this.memoryDetector.extractMemoryInstruction(userInput);
        if (result) {
          // On passe maintenant le subject (ex: "Patrick" ou "Utilisateur")
          await this.longTermMemory.add(result.key, result.value, result.subject, userInput);
          console.log(`🧠 Nouveau souvenir enregistré pour ${result.subject}: ${result.key} = ${result.value}`);
        }
      }

      // 2. Récupération du contexte mémorisé pour enrichir la réponse
      const longTermContext = await this.longTermMemory.getSummary();

      // 3. Préparation des messages pour Ollama
      this.memory.addMessage('user', userInput);
      const conversationHistory = this.memory.getMessages();

      const messages = [
        {
          role: 'system',
          content: `${SYSTEM_PROMPT}\n\nCONTEXTE MÉMOIRE :\n${longTermContext}\n\nUtilise ces informations si elles sont pertinentes pour répondre à l'utilisateur.`
        },
        ...conversationHistory
      ];

      // 4. Appel à Ollama
      const response = await this.ollama.chat({
        model: this.model,
        messages: messages,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9
        }
      });

      let assistantMessage = response.message.content;

      // 5. Gestion des appels d'outils (Tools)
      const toolCall = this.detectToolCall(assistantMessage);
      if (toolCall && toolCall.tool) {
        const toolResult = await this.toolSystem.execute(toolCall.tool, toolCall.params);

        const followUpMessages = [
          ...messages,
          { role: 'assistant', content: assistantMessage },
          {
            role: 'user',
            content: `Résultat de l'outil ${toolCall.tool} : ${JSON.stringify(toolResult, null, 2)}\n\nFormule maintenant une réponse naturelle et claire pour l'utilisateur avec ce résultat.`
          }
        ];

        const finalResponse = await this.ollama.chat({
          model: this.model,
          messages: followUpMessages,
          stream: false
        });

        assistantMessage = finalResponse.message.content;
      }

      this.memory.addMessage('assistant', assistantMessage);
      return assistantMessage;

    } catch (error) {
      throw new Error(`Erreur Assistant: ${error}`);
    }
  }

  // --- Méthodes de gestion de la mémoire ---

  clearMemory() {
    this.memory.clear();
  }

  async clearLongTermMemory() {
    const memories = await this.longTermMemory.getAll();
    for (const mem of memories) {
      await this.longTermMemory.delete(mem.id);
    }
  }

  async getAllFacts() {
    return await this.longTermMemory.getAll();
  }

  // Mise à jour pour supporter le nouveau format subject
  async saveFact(key: string, value: string, subject: string = 'Utilisateur', context?: string) {
    return await this.longTermMemory.add(key, value, subject, context);
  }
}
