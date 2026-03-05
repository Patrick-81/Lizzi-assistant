// src/core/memory.ts
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class ConversationMemory {
  private messages: Message[];
  private maxMessages: number;

  constructor(maxMessages: number = 20) {
    this.messages = [];
    this.maxMessages = maxMessages;
  }

  addMessage(role: 'user' | 'assistant', content: string) {
    const last = this.messages[this.messages.length - 1];
    if (last && last.role === role) {
      // Merge consecutive same-role messages to preserve alternation
      last.content += '\n' + content;
    } else {
      this.messages.push({ role, content });
    }

    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  getMessages(): Message[] {
    return this.messages;
  }

  clear() {
    this.messages = [];
  }
}
