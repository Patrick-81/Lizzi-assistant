// src/core/memory-detector.ts
// Détecteur de mots-clés pour mémorisation et rappel
// L'extraction sémantique est maintenant gérée par SemanticExtractor (LLM)

export interface MemoryResult {
  subject: string;
  predicate: string;
  object: string;
}

export class MemoryDetector {
  private memoryKeywords = [
    'souviens-toi', 'souviens', 'mémorise', 'mémorises',
    'retiens', 'n\'oublie pas', 'n\'oublie', 'noublie',
    'garde en mémoire', 'rappelle-toi', 'rappelle toi', 'enregistre'
  ];

  private recallKeywords = [
    'tu te souviens', 'te rappelles', 'qu\'est-ce que tu sais',
    'de quoi tu te souviens', 'qu\'as-tu retenu',
    'qu\'as-tu mémorisé', 'liste tes souvenirs',
    'montre tes souvenirs', 'tes souvenirs', 'mes souvenirs',
    'quels sont tes souvenirs', 'que sais-tu de moi',
    'ce que tu sais sur moi', 'rappelle mes souvenirs',
    'rappelle-moi mes souvenirs'
  ];

  /**
   * Détecte si le message contient un mot-clé de mémorisation
   */
  shouldMemorize(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.memoryKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * Détecte si le message est une demande de rappel de souvenirs
   */
  shouldRecall(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.recallKeywords.some(keyword => lowerText.includes(keyword));
  }

  /**
   * @deprecated Utiliser SemanticExtractor.extractTriple() à la place
   * Conservé uniquement pour compatibilité/fallback
   */
  extractMemoryInstruction(text: string): MemoryResult | null {
    console.warn('⚠️ extractMemoryInstruction() est obsolète - utiliser SemanticExtractor');
    return null;
  }
}
