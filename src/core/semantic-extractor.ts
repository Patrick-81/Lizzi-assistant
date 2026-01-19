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
   * Extrait un triplet sémantique épuré (Sujet, Prédicat, Objet)
   */
  async extractTriple(text: string, userName?: string): Promise<SemanticTriple | null> {
    const prompt = `Tu es un analyseur sémantique expert. Ton rôle est d'extraire des faits atomiques.

Phrase : "${text}"

RÈGLES STRICTES :
1. IGNORE les instructions ("mémorise", "note que", etc.).
2. SUJET :
   - Si l'utilisateur parle de lui ("je", "mon", "moi"), utilise "${userName || 'Utilisateur'}".
   - Sinon, identifie l'entité réelle (ex: "Le soleil", "La tour Eiffel", "Pixel").
3. PRÉDICAT : Utilise un verbe simple au présent (ex: "est", "aime", "possède", "habite", "travaille").
4. OBJET : L'état, la possession ou le complément direct.

EXEMPLES :
- "Note que le soleil est au maximum de son cycle" -> {"subject":"Le soleil","predicate":"est","object":"au maximum de son cycle"}
- "Mémorise que j'aime les spaghettis" -> {"subject":"${userName || 'Utilisateur'}","predicate":"aime","object":"les spaghettis"}
- "Retiens que mon chat s'appelle Belphégor" -> {"subject":"${userName || 'Utilisateur'}","predicate":"a un chat nommé","object":"Belphégor"}
- "Pixel est un chien très joueur" -> {"subject":"Pixel","predicate":"est","object":"un chien très joueur"}

RÉPONDRE UNIQUEMENT EN JSON :
{ "subject": "...", "predicate": "...", "object": "..." }
Si aucun fait n'est présent, réponds : null`;

    try {
      const response = await this.ollama.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.1 }
      });

      const content = response.message.content.trim();
      if (content.toLowerCase() === 'null') return null;

      const jsonMatch = content.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) return null;

      const triple: SemanticTriple = JSON.parse(jsonMatch[0]);

      // Nettoyage final pour s'assurer que le prédicat reste simple
      triple.predicate = this.normalizePredicate(triple.predicate);

      console.log('✅ Triplet extrait:', triple);
      return triple;
    } catch (error) {
      console.error('❌ Erreur extraction:', error);
      return null;
    }
  }

  /**
   * Normalise le verbe pour éviter les phrases complexes dans le prédicat
   */
  private normalizePredicate(predicate: string): string {
    return predicate
      .toLowerCase()
      .replace(/^(je|j'|tu|il|elle|on)\s+/, '') // Enlever les pronoms
      .trim();
  }

  /**
   * Extraction multiple pour les phrases complexes
   */
  async extractMultiple(text: string, userName?: string): Promise<SemanticTriple[]> {
    const prompt = `Extrait TOUS les faits du texte suivant sous forme de tableau JSON de triplets.
    Texte : "${text}"
    Format : [{"subject":"...","predicate":"...","object":"..."}]`;

    try {
      const response = await this.ollama.chat({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        options: { temperature: 0.1 }
      });

      const jsonMatch = response.message.content.match(/\[[\s\S]*?\]/);
      return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      return [];
    }
  }
}
