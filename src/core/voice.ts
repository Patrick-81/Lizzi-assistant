// src/core/voice.ts
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class VoiceService {
  private piperPath: string;
  private modelPath: string;
  private outputDir: string;

  constructor() {
    const projectRoot = path.join(__dirname, '../..');
    this.piperPath = path.join(projectRoot, 'piper/piper');
    this.modelPath = path.join(projectRoot, 'piper-voices/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx');
    this.outputDir = path.join(projectRoot, 'public/audio');
  }

  async initialize() {
    // Crée le dossier audio s'il n'existe pas
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error('Erreur création dossier audio:', error);
    }
  }

  private cleanTextForSpeech(text: string): string {
    let cleaned = text;

    // Retire les emojis
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F270}\u{238C}-\u{2454}\u{20D0}-\u{20FF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1FAD6}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F251}\u{00A9}\u{00AE}\u{203C}\u{2049}\u{2122}\u{2139}\u{2194}-\u{2199}\u{21A9}-\u{21AA}\u{231A}-\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2600}-\u{2604}\u{260E}\u{2611}\u{2614}-\u{2615}\u{2618}\u{261D}\u{2620}\u{2622}-\u{2623}\u{2626}\u{262A}\u{262E}-\u{262F}\u{2638}-\u{263A}\u{2640}\u{2642}\u{2648}-\u{2653}\u{265F}-\u{2660}\u{2663}\u{2665}-\u{2666}\u{2668}\u{267B}\u{267E}-\u{267F}\u{2692}-\u{2697}\u{2699}\u{269B}-\u{269C}\u{26A0}-\u{26A1}\u{26A7}\u{26AA}-\u{26AB}\u{26B0}-\u{26B1}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26C8}\u{26CE}-\u{26CF}\u{26D1}\u{26D3}-\u{26D4}\u{26E9}-\u{26EA}\u{26F0}-\u{26F5}\u{26F7}-\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}-\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]/gu;
    cleaned = cleaned.replace(emojiRegex, '');

    // Retire le formatage Markdown
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');  // Gras
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');      // Italique
    cleaned = cleaned.replace(/__(.+?)__/g, '$1');      // Gras alt
    cleaned = cleaned.replace(/_(.+?)_/g, '$1');        // Italique alt
    cleaned = cleaned.replace(/~~(.+?)~~/g, '$1');      // Barré
    cleaned = cleaned.replace(/`(.+?)`/g, '$1');        // Code inline
    cleaned = cleaned.replace(/```[\s\S]*?```/g, '');   // Blocs de code
    cleaned = cleaned.replace(/#{1,6}\s/g, '');         // Titres
    cleaned = cleaned.replace(/>\s/g, '');              // Citations
    cleaned = cleaned.replace(/\[(.+?)\]\(.+?\)/g, '$1'); // Liens
    cleaned = cleaned.replace(/^\s*[-*+]\s/gm, '');     // Listes
    cleaned = cleaned.replace(/^\s*\d+\.\s/gm, '');     // Listes numérotées

    // Retire les balises HTML si présentes
    cleaned = cleaned.replace(/<[^>]*>/g, '');

    // Retire ZWJ
    cleaned = cleaned.replace(/[\u200D\uFE0F]/gu, '');

    // Améliore la prononciation de la ponctuation
    cleaned = cleaned.replace(/\s*:\s*/g, ' : ');       // Espaces autour des :
    cleaned = cleaned.replace(/\s*;\s*/g, ' ; ');       // Espaces autour des ;
    cleaned = cleaned.replace(/\s+\./g, '.');           // Pas d'espace avant le point
    cleaned = cleaned.replace(/\s+,/g, ',');            // Pas d'espace avant la virgule

    // Nettoie les espaces multiples et trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  async textToSpeech(text: string): Promise<string> {
    const timestamp = Date.now();
    const filename = `lizzi_${timestamp}.wav`;
    const outputPath = path.join(this.outputDir, filename);

    // Nettoie le texte avant la synthèse
    const cleanedText = this.cleanTextForSpeech(text);

    return new Promise((resolve, reject) => {
      const piper = spawn(this.piperPath, [
        '--model', this.modelPath,
        '--output_file', outputPath
      ]);

      // Envoie le texte nettoyé à Piper via stdin
      piper.stdin.write(cleanedText);
      piper.stdin.end();

      let errorOutput = '';

      piper.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      piper.on('close', (code) => {
        if (code === 0) {
          // Retourne juste le nom du fichier (chemin relatif pour le frontend)
          resolve(`/audio/${filename}`);
        } else {
          reject(new Error(`Piper error: ${errorOutput}`));
        }
      });

      piper.on('error', (error) => {
        reject(error);
      });
    });
  }

  // Nettoie les vieux fichiers audio (garde seulement les 50 derniers)
  async cleanup() {
    try {
      const files = await fs.readdir(this.outputDir);
      const wavFiles = files
        .filter(f => f.endsWith('.wav'))
        .map(f => ({
          name: f,
          path: path.join(this.outputDir, f),
          time: parseInt(f.split('_')[1]) || 0
        }))
        .sort((a, b) => b.time - a.time);

      // Supprime les fichiers au-delà des 50 derniers
      if (wavFiles.length > 50) {
        for (const file of wavFiles.slice(50)) {
          await fs.unlink(file.path);
        }
      }
    } catch (error) {
      console.error('Erreur nettoyage audio:', error);
    }
  }
}
