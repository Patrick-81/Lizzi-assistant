import { describe, it, expect } from 'vitest';
import { MemoryDetector } from '../src/core/memory-detector.js';

const detector = new MemoryDetector();

describe('MemoryDetector.detect()', () => {
  it('retourne false pour un message vide', () => {
    expect(detector.detect('')).toBe(false);
  });

  it('détecte "mémorise que"', () => {
    expect(detector.detect('mémorise que j\'ai un chat')).toBe(true);
  });

  it('détecte "retiens que"', () => {
    expect(detector.detect('Retiens que j\'habite à Paris')).toBe(true);
  });

  it('détecte "note que"', () => {
    expect(detector.detect('note que mon film préféré est Inception')).toBe(true);
  });

  it('détecte "je m\'appelle"', () => {
    expect(detector.detect("je m'appelle Patrick")).toBe(true);
  });

  it('détecte "mon nom est"', () => {
    expect(detector.detect('mon nom est Patrick')).toBe(true);
  });

  it('ne détecte pas une question simple', () => {
    expect(detector.detect('Quel temps fait-il ?')).toBe(false);
  });

  it('ne détecte pas une phrase neutre', () => {
    expect(detector.detect('Je vais bien merci')).toBe(false);
  });
});

describe('MemoryDetector.cleanMessage()', () => {
  it('supprime "mémorise que" en début de phrase', () => {
    const result = detector.cleanMessage('mémorise que j\'ai un chat');
    expect(result).not.toMatch(/^mémorise/i);
  });

  it('conserve le reste du message intact', () => {
    const result = detector.cleanMessage('note que mon chat s\'appelle Pixel');
    expect(result).toContain('Pixel');
  });
});
