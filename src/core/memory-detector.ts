// src/core/memory-detector.ts

export interface MemoryResult {
  subject: string;
  key: string;
  value: string;
}

export class MemoryDetector {
  private memoryKeywords = [
    'souviens-toi',
    'souviens',
    'mémorise',
    'mémorises',
    'retiens',
    'n\'oublie pas',
    'n\'oublie',
    'noublie',
    'garde en mémoire',
    'rappelle-toi',
    'rappelle toi',
    'enregistre'
  ];

  private recallKeywords = [
    'tu te souviens',
    'te rappelles',
    'qu\'est-ce que tu sais',
    'de quoi tu te souviens',
    'qu\'as-tu retenu',
    'qu\'as-tu mémorisé',
    'liste tes souvenirs',
    'montre tes souvenirs',
    'tes souvenirs'
  ];

  shouldMemorize(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.memoryKeywords.some(keyword => lowerText.includes(keyword));
  }

  shouldRecall(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.recallKeywords.some(keyword => lowerText.includes(keyword));
  }

  extractMemoryInstruction(text: string): MemoryResult | null {
    const lowerText = text.toLowerCase();

    // 1. Cas prioritaire : Identification de l'utilisateur
    const identityMatch = text.match(/(?:je m'appelle|mon nom est|je suis)\s+([A-ZÀ-ÿ\w-]+)/i);
    if (identityMatch) {
      return { subject: 'Utilisateur', key: 'nom', value: identityMatch[1].trim() };
    }

    // 2. Préparation de la Regex dynamique pour les mots-clés
    // On échappe les caractères spéciaux et on joint avec des pipes |
    const escapedKeywords = this.memoryKeywords
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');

    const patterns = [
      // Pattern pour : "Souviens-toi que mon chat s'appelle Belfégor"
      new RegExp(`(?:${escapedKeywords})\\s+(?:que\\s+)?(?:mon|ma|mes)\\s+(\\w+)\\s+(?:est|sont|s'appelle)\\s+(.+)`, 'i'),

      // Pattern pour : "Mon chat s'appelle Belfégor" (sans mot clé au début)
      /(?:mon|ma|mes)\s+(\w+)\s+(?:est|sont|s'appelle)\s+(.+)/i,

      // Pattern générique : "Mémorise que la capitale est Paris"
      new RegExp(`(?:${escapedKeywords})\\s+(?:que\\s+)?(.+)`, 'i')
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Si on a capturé deux groupes (ex: chat et Belfégor)
        if (match[2]) {
          return {
            subject: 'Utilisateur',
            key: match[1].trim(),
            value: match[2].trim()
          };
        }

        // Si on a capturé un bloc de texte brut (ex: "le code est 1234")
        const content = match[1];
        const parts = content.split(/\s+(?:est|sont|s'appelle|se nomme|:)\s+/i);

        if (parts.length >= 2) {
          return {
            subject: 'Utilisateur',
            key: parts[0].trim(),
            value: parts.slice(1).join(' ').trim()
          };
        }
      }
    }

    return null;
  }
}
