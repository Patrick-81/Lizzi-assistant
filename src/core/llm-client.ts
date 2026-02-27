// src/core/llm-client.ts - Client OpenAI-compatible pour llama.cpp
interface Message {
  role: string;
  content: string;
}

interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

interface ChatResponse {
  message: {
    role: string;
    content: string;
  };
}

interface EmbeddingResponse {
  embedding: number[];
}

export class LlamaCppClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    // Assure que l'URL se termine sans /
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async chat(params: {
    model?: string;
    messages: Message[];
    options?: ChatOptions;
    stream?: boolean;
  }): Promise<ChatResponse> {
    const { messages, options = {} } = params;

    const requestBody = {
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? -1, // -1 = illimité
      stop: options.stop,
      stream: false
    };

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      
      // Format compatible avec Ollama
      return {
        message: {
          role: data.choices[0].message.role,
          content: data.choices[0].message.content
        }
      };
    } catch (error) {
      console.error('❌ Erreur requête llama.cpp:', error);
      throw error;
    }
  }

  async embeddings(params: {
    model?: string;
    prompt: string;
  }): Promise<EmbeddingResponse> {
    const { prompt, model } = params;

    try {
      const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: prompt,
          model: model || undefined
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      
      return {
        embedding: data.data[0].embedding
      };
    } catch (error) {
      console.error('❌ Erreur embeddings llama.cpp:', error);
      // Retourne un vecteur vide en cas d'erreur (dimension: 512 pour jina-v2-small, 768 pour nomic-embed)
      return {
        embedding: new Array(512).fill(0)
      };
    }
  }
}
