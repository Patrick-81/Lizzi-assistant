// src/core/speech.ts
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SpeechRecognition {
  private whisperPath: string;
  private modelPath: string;
  private tempDir: string;
  private contextPromptCache: { value: string; expiresAt: number } | null = null;
  private static readonly CONTEXT_PROMPT_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor() {
    const projectRoot = path.join(__dirname, '../..');
    this.whisperPath = path.join(projectRoot, 'whisper-cpp/build/bin/whisper-cli');
    // Pour vitesse : tiny (75MB) ~1s, base (142MB) ~2-3s, small (466MB) ~4-5s
    // Le modèle tiny est le plus rapide mais moins précis
    this.modelPath = path.join(projectRoot, 'whisper-cpp/models/ggml-base.bin');
    // Utilise /dev/shm (RAM disk) au lieu du disque dur pour plus de rapidité
    this.tempDir = '/dev/shm/assistant-audio';
  }

  async checkModelPath() {
    const projectRoot = path.join(__dirname, '../..');
    
    // Pour la rapidité : base (142MB) est le meilleur compromis
    // Small (466MB) est trop lent (~14s), tiny pas assez précis
    const baseModel = path.join(projectRoot, 'whisper-cpp/models/ggml-base.bin');
    const smallModel = path.join(projectRoot, 'whisper-cpp/models/ggml-small.bin');
    
    // Force l'utilisation de base pour la rapidité
    try {
      await fs.access(baseModel);
      this.modelPath = baseModel;
      console.log('🎯 Modèle: ggml-base.bin (rapide, ~2-3s)');
      return;
    } catch {
      // Fallback sur small si base manquant (peu probable)
      try {
        await fs.access(smallModel);
        this.modelPath = smallModel;
        console.log('🎯 Modèle: ggml-small.bin (précis mais lent ~14s)');
      } catch {
        console.log('⚠️  Aucun modèle Whisper trouvé');
      }
    }
  }

  async initialize() {
    // Vérifie quel modèle est disponible
    await this.checkModelPath();
    
    // Crée le dossier temp s'il n'existe pas
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log('🎤 Reconnaissance vocale initialisée');
    } catch (error) {
      console.error('Erreur création dossier temp:', error);
    }
  }

  /**
   * Génère un prompt contexte pour améliorer la reconnaissance
   */
  private async generateContextPrompt(): Promise<string> {
    const now = Date.now();
    if (this.contextPromptCache && now < this.contextPromptCache.expiresAt) {
      return this.contextPromptCache.value;
    }

    let prompt = 'Bonjour, je parle en français. ';
    
    // Ajoute les noms importants depuis la mémoire (si disponible)
    try {
      const memoryPath = path.join(process.cwd(), 'data', 'memories.json');
      const data = await fs.readFile(memoryPath, 'utf-8');
      const facts = JSON.parse(data);
      
      // Extrait les noms propres (animaux, personnes)
      const names: string[] = [];
      facts.forEach((fact: any) => {
        if (fact.objects && Array.isArray(fact.objects)) {
          fact.objects.forEach((obj: string) => {
            // Garde seulement les mots commençant par une majuscule (noms propres)
            if (obj.match(/^[A-Z][a-zéèêà]+$/)) {
              names.push(obj);
            }
          });
        }
      });
      
      // Ajoute les noms propres au prompt
      if (names.length > 0) {
        const uniqueNames = [...new Set(names)];
        prompt += `Noms : ${uniqueNames.join(', ')}. `;
      }
    } catch (e) {
      // Ignore si pas de mémoire disponible
    }
    
    // Ajoute des mots-clés courants pour l'assistant
    prompt += 'Lizzi assistant animaux.';

    this.contextPromptCache = { value: prompt, expiresAt: Date.now() + SpeechRecognition.CONTEXT_PROMPT_TTL_MS };
    return prompt;
  }

  /**
   * Transcrit un fichier audio en texte
   * @param audioFilePath Chemin vers le fichier audio (WAV, MP3, etc.)
   * @returns Texte transcrit
   */
  async transcribe(audioFilePath: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const t0 = Date.now();
      
      // Génère un prompt contextuel enrichi
      const contextPrompt = await this.generateContextPrompt();
      
      // Whisper options optimisées pour vitesse ET précision
      const whisper = spawn(this.whisperPath, [
        '-m', this.modelPath,
        '-f', audioFilePath,
        '-l', 'fr',
        '-t', '8',         // Utilise 8 threads pour accélération
        '-nt',             // No timestamps
        '-np',             // No prints (only result)
        '--prompt', contextPrompt
      ]);

      const timeout = setTimeout(() => {
        whisper.kill('SIGKILL');
        reject(new Error('Whisper timeout (60s dépassé)'));
      }, 60_000);

      let output = '';
      let errorOutput = '';

      whisper.stdout.on('data', (data) => {
        output += data.toString();
      });

      whisper.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      whisper.on('close', (code) => {
        clearTimeout(timeout);
        console.log(`⏱️  Whisper transcription: ${Date.now() - t0}ms`);
        
        if (code === 0) {
          const transcription = this.extractTranscription(output);
          resolve(transcription);
        } else {
          reject(new Error(`Whisper error (code ${code}): ${errorOutput}`));
        }
      });

      whisper.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Extrait la transcription depuis la sortie de Whisper
   */
  private extractTranscription(output: string): string {
    console.log('📄 Sortie Whisper brute:', output);
    
    // Nettoie et retourne toute la sortie qui n'est pas un log technique
    const lines = output.split('\n');
    const transcriptionLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Ignore les lignes vides
      if (!trimmed) continue;
      
      // Ignore les lignes techniques de Whisper
      if (trimmed.includes('whisper_') || 
          trimmed.includes('processing') ||
          trimmed.includes('system_info') ||
          trimmed.includes('load time') ||
          trimmed.includes('fallbacks')) {
        continue;
      }
      
      // Ignore les lignes avec timestamps [00:00:00.000 --> 00:00:04.000]
      if (trimmed.match(/^\[[\d:.]+\s*-->\s*[\d:.]+\]/)) {
        continue;
      }
      
      // Tout le reste est considéré comme transcription
      transcriptionLines.push(trimmed);
    }

    const result = transcriptionLines.join(' ').trim();
    console.log('📝 Texte extrait:', result || '(vide)');
    return result;
  }

  /**
   * Sauvegarde un buffer audio en fichier temporaire et convertit en WAV si nécessaire
   * Utilise /dev/shm (RAM disk) pour éviter les I/O disque lents
   */
  async saveAudioBuffer(buffer: Buffer, format: string = 'webm'): Promise<string> {
    const t0 = Date.now();
    const timestamp = Date.now();
    const inputFilename = `audio_${timestamp}.${format}`;
    const inputFilepath = path.join(this.tempDir, inputFilename);
    const wavFilepath = path.join(this.tempDir, `audio_${timestamp}.wav`);

    // Sauvegarde le fichier d'origine en RAM
    await fs.writeFile(inputFilepath, buffer);
    console.log(`📦 Audio sauvegardé en RAM: ${inputFilename} (${buffer.length} bytes) - ${Date.now() - t0}ms`);

    // Si ce n'est pas déjà du WAV, convertir avec ffmpeg
    if (format !== 'wav') {
      await this.convertToWav(inputFilepath, wavFilepath);
      // Supprimer le fichier d'origine après conversion
      await fs.unlink(inputFilepath).catch(() => {});
      return wavFilepath;
    }

    return inputFilepath;
  }

  /**
   * Convertit un fichier audio en WAV 16kHz mono (format optimal pour Whisper)
   */
  private async convertToWav(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      console.log(`🔄 Conversion en WAV: ${path.basename(inputPath)} → ${path.basename(outputPath)}`);
      
      const ffmpeg = spawn('ffmpeg', [
        '-i', inputPath,
        '-ar', '16000',  // 16kHz (optimal pour Whisper)
        '-ac', '1',      // Mono
        '-c:a', 'pcm_s16le',  // PCM 16-bit
        '-y',            // Overwrite
        outputPath
      ]);

      const timeout = setTimeout(() => {
        ffmpeg.kill('SIGKILL');
        reject(new Error('ffmpeg timeout (30s dépassé)'));
      }, 30_000);

      let errorOutput = '';

      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffmpeg.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          console.log(`✅ Conversion réussie: ${path.basename(outputPath)} (${Date.now() - t0}ms)`);
          resolve();
        } else {
          console.error(`❌ Erreur ffmpeg (code ${code}):`, errorOutput);
          reject(new Error(`Erreur conversion ffmpeg: ${errorOutput}`));
        }
      });

      ffmpeg.on('error', (error) => {
        clearTimeout(timeout);
        console.error(`❌ Erreur spawn ffmpeg:`, error);
        reject(error);
      });
    });
  }

  /**
   * Nettoie les fichiers audio temporaires (garde les 10 derniers)
   */
  async cleanup() {
    try {
      const files = await fs.readdir(this.tempDir);
      const audioFiles = files
        .filter(f => f.startsWith('audio_') && f.endsWith('.wav'))
        .map(f => ({
          name: f,
          path: path.join(this.tempDir, f),
          time: parseInt(f.split('_')[1]) || 0
        }))
        .sort((a, b) => b.time - a.time);

      // Supprime les fichiers au-delà des 10 derniers
      if (audioFiles.length > 10) {
        for (const file of audioFiles.slice(10)) {
          await fs.unlink(file.path);
        }
      }
    } catch (error) {
      console.error('Erreur nettoyage audio:', error);
    }
  }
}
