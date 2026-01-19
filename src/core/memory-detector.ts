// src/core/memory-detector.ts

// src/core/memory-detector.ts

export class MemoryDetector {
  /**
   * Liste des verbes d'action indiquant une volonté de stockage
   */
  private static readonly ACTION_KEYWORDS = [
    'mémorise', 'enregistre', 'note', 'retiens', 'souviens-toi',
    'apprends', 'stocke', 'garde en mémoire', 'inscris'
  ];

  /**
   * Liste des tournures de phrases impératives ou déclaratives
   */
  private static readonly PHRASE_PATTERNS = [
    /^c'est important/i,
    /^je voudrais que tu te souviennes/i,
    /^peux-tu noter que/i,
    /^il faut que tu saches/i,
    /^retient bien/i
  ];

  /**
   * Détecte si l'utilisateur exprime une intention explicite de mémorisation.
   * @param text Le message de l'utilisateur
   * @returns boolean
   */
  public detect(text: string): boolean {
    if (!text) return false;

    const normalizedText = text.toLowerCase().trim();

    // 1. Vérification des mots-clés d'action (ex: "Note que...")
    const hasActionWord = MemoryDetector.ACTION_KEYWORDS.some(keyword =>
      normalizedText.includes(keyword)
    );

    if (hasActionWord) return true;

    // 2. Vérification des motifs de phrases (ex: "C'est important, je...")
    const hasPattern = MemoryDetector.PHRASE_PATTERNS.some(pattern =>
      pattern.test(normalizedText)
    );

    if (hasPattern) return true;

    // 3. Cas particulier : Détection de l'identité (toujours mémoriser)
    // On veut que Lizzi enregistre toujours quand quelqu'un décline son identité
    const identityPatterns = [
      /^je m'appelle/i,
      /^mon nom est/i,
      /^je suis (.*) et je/i
    ];

    if (identityPatterns.some(pattern => pattern.test(normalizedText))) {
      return true;
    }

    return false;
  }

  /**
   * Optionnel : Nettoie le message des mots-clés pour faciliter l'extraction
   * Exemple : "Mémorise que mon chat s'appelle Pixel" -> "mon chat s'appelle Pixel"
   */
  public cleanMessage(text: string): string {
    let cleaned = text;
    const verbsToStrip = [...MemoryDetector.ACTION_KEYWORDS, 'que', 'de', 'le fait'];

    verbsToStrip.forEach(word => {
      const regex = new RegExp(`^${word}\\s+`, 'i');
      cleaned = cleaned.replace(regex, '');
    });

    return cleaned.trim();
  }
}
