// src/core/memory-detector.ts - VERSION ROBUSTE

export interface MemoryResult {
  subject: string;
  predicate: string;  // Action/relation
  object: string;     // Valeur/objet
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
    'montre tes souvenirs', 'tes souvenirs'
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
    // 1. Identification de l'utilisateur (priorité absolue)
    const identityMatch = text.match(/(?:je m'appelle|mon nom est|je suis)\s+([A-ZÀ-ÿ\w-]+)/i);
    if (identityMatch) {
      return {
        subject: 'Utilisateur',
        predicate: 's\'appelle',
        object: identityMatch[1].trim()
      };
    }

    // 2. Détection du nom dans "moi [NOM]"
    let detectedName: string | null = null;
    const nameInPhrase = text.match(/\bmoi\s+([A-ZÀ-ÿ][a-zà-ÿ]+)/i);
    if (nameInPhrase) {
      detectedName = nameInPhrase[1].trim();
    }

    const escapedKeywords = this.memoryKeywords
      .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');

    // 3. Patterns structurés avec prédicats explicites
    const patterns = [
      // "Mémorise que moi Patrick j'ai un chat nommé Belphégor"
      {
        regex: new RegExp(`(?:${escapedKeywords})\\s+(?:que\\s+)?(?:moi\\s+[A-ZÀ-ÿ\\w-]+\\s+)?j'ai\\s+(?:un|une|des)\\s+(\\w+)\\s+(?:nommé|nommée|appelé|appelée|qui s'appelle)\\s+([A-ZÀ-ÿ\\w-]+)`, 'i'),
        handler: (m: RegExpMatchArray) => ({
          subject: detectedName || 'Utilisateur',
          predicate: `possède un ${m[1]}`,
          object: m[2].trim()
        })
      },

      // "j'ai un chien nommé Pixel" (sans "moi NOM")
      {
        regex: new RegExp(`(?:${escapedKeywords}\\s+)?(?:que\\s+)?j'ai\\s+(?:un|une|des)\\s+(\\w+)\\s+(?:nommé|nommée|appelé|appelée|qui s'appelle)\\s+([A-ZÀ-ÿ\\w-]+)`, 'i'),
        handler: (m: RegExpMatchArray) => ({
          subject: detectedName || 'Utilisateur',
          predicate: `possède un ${m[1]}`,
          object: m[2].trim()
        })
      },

      // "mon chat s'appelle Belfégor"
      {
        regex: /(?:mon|ma|mes)\s+(\w+)\s+s'appelle\s+([A-ZÀ-ÿ\w-]+)/i,
        handler: (m: RegExpMatchArray) => ({
          subject: detectedName || 'Utilisateur',
          predicate: `possède un ${m[1]}`,
          object: m[2].trim()
        })
      },

      // "mon chat est noir" ou "ma voiture est rouge"
      {
        regex: /(?:mon|ma|mes)\s+(\w+)\s+(?:est|sont)\s+(.+?)(?:\.|$)/i,
        handler: (m: RegExpMatchArray) => ({
          subject: detectedName || 'Utilisateur',
          predicate: `a un ${m[1]} qui est`,
          object: m[2].trim()
        })
      },

      // "j'aime le chocolat"
      {
        regex: new RegExp(`(?:${escapedKeywords}\\s+)?(?:que\\s+)?j'aime\\s+(.+?)(?:\\.|$)`, 'i'),
        handler: (m: RegExpMatchArray) => ({
          subject: detectedName || 'Utilisateur',
          predicate: 'aime',
          object: m[1].trim()
        })
      },

      // "j'ai une Tesla comme véhicule" ou "j'ai un MacBook comme ordinateur"
      {
        regex: new RegExp(`(?:${escapedKeywords}\\s+)?(?:que\\s+)?j'ai\\s+(?:un|une)\\s+([A-ZÀ-ÿ\\w-]+)\\s+comme\\s+(\\w+)`, 'i'),
        handler: (m: RegExpMatchArray) => ({
          subject: detectedName || 'Utilisateur',
          predicate: `possède comme ${m[2]}`,
          object: m[1].trim()
        })
      },

      // "j'ai une voiture Tesla" ou "j'ai un ordinateur MacBook" (TYPE MARQUE)
      {
        regex: new RegExp(`(?:${escapedKeywords}\\s+)?(?:que\\s+)?j'ai\\s+(?:un|une)\\s+(\\w+)\\s+([A-ZÀ-ÿ\\w-]+)`, 'i'),
        handler: (m: RegExpMatchArray) => ({
          subject: detectedName || 'Utilisateur',
          predicate: `possède un ${m[1]}`,
          object: m[2].trim()
        })
      },

      // "je déteste les épinards"
      {
        regex: /je déteste\s+(.+?)(?:\.|$)/i,
        handler: (m: RegExpMatchArray) => ({
          subject: detectedName || 'Utilisateur',
          predicate: 'déteste',
          object: m[1].trim()
        })
      },

      // "j'habite à Paris"
      {
        regex: /j'habite\s+(?:à|au|en|dans)\s+(.+?)(?:\.|$)/i,
        handler: (m: RegExpMatchArray) => ({
          subject: detectedName || 'Utilisateur',
          predicate: 'habite à',
          object: m[1].trim()
        })
      },

      // "je travaille chez Google"
      {
        regex: /je travaille\s+(?:chez|à|pour)\s+(.+?)(?:\.|$)/i,
        handler: (m: RegExpMatchArray) => ({
          subject: detectedName || 'Utilisateur',
          predicate: 'travaille chez',
          object: m[1].trim()
        })
      },

      // "ma couleur préférée est le bleu"
      {
        regex: /(?:mon|ma|mes)\s+(.+?)\s+(?:préféré|préférée|préférés|préférées)\s+(?:est|sont)\s+(.+?)(?:\.|$)/i,
        handler: (m: RegExpMatchArray) => ({
          subject: detectedName || 'Utilisateur',
          predicate: m[1].trim(),
          object: m[2].trim()
        })
      }
    ];

    // Tester chaque pattern
    for (const pattern of patterns) {
      const match = text.match(pattern.regex);
      if (match) {
        const result = pattern.handler(match);

        // Log pour debug
        console.log('🎯 Pattern matched:', {
          regex: pattern.regex.source.substring(0, 50) + '...',
          match: match[0],
          result
        });

        return result;
      }
    }

    console.log('⚠️ Aucun pattern ne correspond à:', text);
    return null;
  }
}
