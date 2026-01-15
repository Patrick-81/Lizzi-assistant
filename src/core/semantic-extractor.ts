// src/core/semantic-extractor.ts
import { Ollama } from 'ollama';

export interface SemanticTriple {
  subject: string;
  predicate: string;
  object: string;
}

export class SemanticExtractor {
  private ollama: Ollama;
  private model: string;

  constructor(ollama: Ollama, model: string) {
    this.ollama = ollama;
    this.model = model;
  }

  /**
   * Extrait un triplet sémantique (sujet, prédicat, objet) d'une phrase
   * en utilisant le LLM pour une analyse intelligente
   */
  async extractTriple(text: string, userName?: string): Promise<SemanticTriple | null> {
    const prompt = `Tu es un analyseur sémantique expert. Extrait les informations factuelles sous forme de triplet (sujet, relation, objet).

Phrase à analyser : "${text}"

RÈGLES D'EXTRACTION :
1. IGNORE les mots d'instruction comme "mémorise", "retiens", "souviens-toi", etc.
   - Ces mots indiquent qu'il faut mémoriser, mais ne font PAS partie du fait lui-même

2. Sujet : L'entité qui fait l'action
   - Si "je/j'" dans la phrase, le sujet est "${userName || 'Utilisateur'}"
   - Si "mon chat", le sujet est "${userName || 'Utilisateur'}" (PAS juste "chat")
   - Si "ma voiture", le sujet est "${userName || 'Utilisateur'}" (PAS juste "voiture")
   
3. Prédicat (relation) : Le verbe ou l'action À LA 3ÈME PERSONNE
   - "j'aime" → "aime" (PAS "j'aime")
   - "je possède" → "possède" (PAS "je possède")
   - "j'ai un chat" → "a un chat" (PAS "j'ai")
   - Utilise l'infinitif ou forme nominale
   - N'inclus JAMAIS "je/j'/mon/ma"
   
4. Objet : Ce qui est affecté par l'action
   - Garde les détails importants
   - Conserve les noms propres (Tesla, Paris, etc.)

EXEMPLES CORRECTS :
- "mémorise que je possède un véhicule Tesla" → {"subject":"${userName || 'Utilisateur'}","predicate":"possède","object":"véhicule Tesla"}
- "retiens que mon chat s'appelle Belphégor" → {"subject":"${userName || 'Utilisateur'}","predicate":"a un chat nommé","object":"Belphégor"}
- "souviens-toi que j'habite à Paris" → {"subject":"${userName || 'Utilisateur'}","predicate":"habite à","object":"Paris"}
- "n'oublie pas que je déteste les épinards" → {"subject":"${userName || 'Utilisateur'}","predicate":"déteste","object":"les épinards"}
- "j'aime les spaghettis" → {"subject":"${userName || 'Utilisateur'}","predicate":"aime","object":"les spaghettis"}
- "je travaille chez Google" → {"subject":"${userName || 'Utilisateur'}","predicate":"travaille chez","object":"Google"}
- "ma couleur préférée est le bleu" → {"subject":"${userName || 'Utilisateur'}","predicate":"a comme couleur préférée","object":"bleu"}

IMPORTANT :
- Réponds UNIQUEMENT avec le JSON (pas de texte avant/après)
- Si la phrase ne contient PAS de fait à mémoriser, réponds : null
- Ne réponds pas si c'est une question ou une instruction sans fait

Réponds maintenant :`;

    try {
      const response = await this.ollama.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.1, // Très bas pour extraction précise
          top_p: 0.9
        }
      });

      const content = response.message.content.trim();
      
      console.log('🧠 Extraction LLM:', content.substring(0, 150));

      // Essayer de parser directement
      if (content === 'null' || content.toLowerCase().includes('pas de fait')) {
        return null;
      }

      // Extraire le JSON s'il est entouré de texte
      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        console.log('⚠️ Pas de JSON trouvé dans la réponse');
        return null;
      }

      const triple = JSON.parse(jsonMatch[0]);
      
      // Validation
      if (!triple.subject || !triple.predicate || !triple.object) {
        console.log('⚠️ Triplet incomplet:', triple);
        return null;
      }

      console.log('✅ Triplet extrait:', triple);
      return triple;

    } catch (error) {
      console.error('❌ Erreur extraction sémantique:', error);
      return null;
    }
  }

  /**
   * Extrait plusieurs triplets d'un texte complexe
   */
  async extractMultiple(text: string, userName?: string): Promise<SemanticTriple[]> {
    const prompt = `Extrait TOUS les faits mémorisables de ce texte sous forme de triplets JSON.

Texte : "${text}"

Réponds avec un tableau JSON de triplets :
[
  {"subject":"...","predicate":"...","object":"..."},
  {"subject":"...","predicate":"...","object":"..."}
]

Ou un tableau vide [] s'il n'y a pas de faits.`;

    try {
      const response = await this.ollama.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.1
        }
      });

      const content = response.message.content.trim();
      const jsonMatch = content.match(/\[[\s\S]*?\]/);
      
      if (!jsonMatch) {
        return [];
      }

      const triples = JSON.parse(jsonMatch[0]);
      return Array.isArray(triples) ? triples : [];

    } catch (error) {
      console.error('❌ Erreur extraction multiple:', error);
      return [];
    }
  }
}
