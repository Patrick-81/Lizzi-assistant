// // src/server.ts
// import 'dotenv/config';
// import express from 'express';
// import cors from 'cors';
// import { Assistant } from './core/assistant.js';
// import { VoiceService } from './core/voice.js';
// import { SpeechRecognition } from './core/speech.js';
// import { SystemMonitor } from './core/system-monitor.js';
// import path from 'path';
// import { fileURLToPath } from 'url';
//
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
//
// const app = express();
// const PORT = process.env.PORT || 3000;
//
// // Middleware
// app.use(cors());
// app.use(express.json());
// app.use(express.static(path.join(__dirname, '../public')));
//
// // Instance unique de l'assistant (pour garder la mémoire)
// const assistants = new Map<string, Assistant>();
//
// // Fonction helper pour obtenir l'assistant par défaut initialisé
// async function getDefaultAssistant(): Promise<Assistant> {
//   if (!assistants.has('default')) {
//     const assistant = new Assistant();
//     await assistant.initialize();
//     assistants.set('default', assistant);
//   }
//   return assistants.get('default')!;
// }
//
// // Instance unique du service vocal
// const voiceService = new VoiceService();
// voiceService.initialize();
//
// const speechRecognition = new SpeechRecognition();
// await speechRecognition.initialize();
//
// // Instance unique du moniteur système
// const systemMonitor = new SystemMonitor();
//
// // Route principale - sert le frontend
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, '../public/index.html'));
// });
//
// // API - Chat avec l'assistant
// app.post('/api/chat', async (req, res) => {
//   try {
//     const { message, sessionId = 'default' } = req.body;
//
//     if (!message) {
//       return res.status(400).json({ error: 'Message requis' });
//     }
//
//     // Récupère ou crée l'assistant pour cette session
//     if (!assistants.has(sessionId)) {
//       const newAssistant = new Assistant();
//       await newAssistant.initialize();
//       assistants.set(sessionId, newAssistant);
//     }
//
//     const assistant = assistants.get(sessionId)!;
//     const response = await assistant.chat(message);
//
//     res.json({
//       response,
//       sessionId
//     });
//
//   } catch (error) {
//     console.error('Erreur:', error);
//     res.status(500).json({
//       error: 'Erreur lors du traitement de votre message'
//     });
//   }
// });
//
// // API - Effacer la mémoire
// app.post('/api/clear', async (req, res) => {
//   try {
//     const { sessionId = 'default' } = req.body;
//
//     if (assistants.has(sessionId)) {
//       assistants.get(sessionId)!.clearMemory();
//     }
//
//     res.json({ success: true });
//   } catch (error) {
//     console.error('Erreur:', error);
//     res.status(500).json({ error: 'Erreur lors de la réinitialisation' });
//   }
// });
//
// // API - Health check
// app.get('/api/health', (req, res) => {
//   res.json({
//     status: 'ok',
//     ollama: process.env.OLLAMA_HOST,
//     model: process.env.MODEL_NAME
//   });
// });
//
// // API - Gestion des faits (mémoire long terme)
// // app.get('/api/facts', async (req, res) => {
// //   try {
// //     const assistant = await getDefaultAssistant();
// //     const facts = await assistant.getAllFacts();
// //     res.json({ facts });
// //   } catch (error) {
// //     console.error('Erreur:', error);
// //     res.status(500).json({ error: 'Erreur lors de la récupération des faits' });
// //   }
// // });
// app.get('/api/facts', async (req, res) => {
//   try {
//     const assistant = assistants.get('default') || new Assistant();
//     if (!assistants.has('default')) {
//       await assistant.initialize();
//       assistants.set('default', assistant);
//     }
//
//     const facts = await assistant.getAllFacts();
//
//     // Normalise pour le frontend : ajoute "relation" basé sur "predicate"
//     const normalizedFacts = facts.map(f => ({
//       ...f,
//       relation: f.predicate,  // Le frontend attend "relation"
//     }));
//
//     res.json({ facts: normalizedFacts });
//   } catch (error) {
//     console.error('Erreur:', error);
//     res.status(500).json({ error: 'Erreur lors de la récupération des faits' });
//   }
// });
// app.post('/api/facts', async (req, res) => {
//   try {
//     const { key, value } = req.body;
//
//     if (!key || !value) {
//       return res.status(400).json({ error: 'Clé et valeur requises' });
//     }
//
//     const assistant = await getDefaultAssistant();
//     const fact = await assistant.saveFact(key, value);
//     res.json({ fact });
//   } catch (error) {
//     console.error('Erreur:', error);
//     res.status(500).json({ error: 'Erreur lors de la sauvegarde du fait' });
//   }
// });
//
// app.put('/api/facts/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { key, value, predicate, objects, subject } = req.body;
//
//     // Compatibilité avec ancien format (key/value) et nouveau (predicate/objects)
//     const finalPredicate = predicate || key;
//     const finalObjects = objects || (value ? [value] : []);
//
//     if (!finalPredicate || finalObjects.length === 0) {
//       return res.status(400).json({ error: 'Prédicat et au moins une valeur requis' });
//     }
//
//     const assistant = await getDefaultAssistant();
//     const fact = await assistant.updateFact(id, finalPredicate, finalObjects, subject);
//
//     if (!fact) {
//       return res.status(404).json({ error: 'Fait non trouvé' });
//     }
//
//     res.json({ fact });
//   } catch (error) {
//     console.error('Erreur:', error);
//     res.status(500).json({ error: 'Erreur lors de la mise à jour du fait' });
//   }
// });
//
// app.delete('/api/facts/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const assistant = await getDefaultAssistant();
//     const deleted = await assistant.deleteFact(id);
//
//     if (!deleted) {
//       return res.status(404).json({ error: 'Fait non trouvé' });
//     }
//
//     res.json({ success: true });
//   } catch (error) {
//     console.error('Erreur:', error);
//     res.status(500).json({ error: 'Erreur lors de la suppression du fait' });
//   }
// });
//
// // API - Recherche de faits
// app.get('/api/facts/search', async (req, res) => {
//   try {
//     const query = req.query.q as string;
//     if (!query) {
//       return res.status(400).json({ error: 'Paramètre q requis' });
//     }
//
//     const assistant = await getDefaultAssistant();
//     const facts = await assistant.searchFacts(query);
//     res.json(facts);
//   } catch (error) {
//     console.error('Erreur recherche:', error);
//     res.status(500).json({ error: 'Erreur lors de la recherche' });
//   }
// });
//
// // API - Synthèse vocale
// app.post('/api/speak', async (req, res) => {
//   try {
//     const { text } = req.body;
//
//     if (!text) {
//       return res.status(400).json({ error: 'Texte requis' });
//     }
//
//     console.log('🗣️  Génération audio pour:', text.substring(0, 100) + '...');
//
//     const audioFile = await voiceService.textToSpeech(text);
//     const audioUrl = `/audio/${path.basename(audioFile)}`;
//
//     res.json({
//       success: true,
//       audioUrl
//     });
//
//   } catch (error) {
//     console.error('Erreur TTS:', error);
//     res.status(500).json({
//       error: 'Erreur lors de la génération vocale'
//     });
//   }
// });
//
// // API - Statistiques système (VRAM, RAM, etc.)
// app.get('/api/system/stats', async (req, res) => {
//   try {
//     const stats = await systemMonitor.getStats();
//     const modelInfo = await systemMonitor.getModelInfo();
//
//     res.json({
//       success: true,
//       stats,
//       model: modelInfo
//     });
//   } catch (error) {
//     console.error('Erreur système:', error);
//     res.status(500).json({
//       error: 'Erreur lors de la récupération des stats'
//     });
//   }
// });
//
// app.listen(PORT, () => {
//   console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
//   console.log(`📡 Connecté à Ollama sur ${process.env.OLLAMA_HOST}`);
//   console.log(`🤖 Modèle: ${process.env.MODEL_NAME}`);
// });
//
// app.post('/api/transcribe', async (req, res) => {
//   try {
//     const { audio } = req.body;
//     if (!audio) {
//       return res.status(400).json({ error: 'Audio requis' });
//     }
//
//     const audioBuffer = Buffer.from(audio, 'base64');
//     const audioPath = await speechRecognition.saveAudioBuffer(audioBuffer);
//     const text = await speechRecognition.transcribe(audioPath);
//
//     if (Math.random() < 0.1) {
//       speechRecognition.cleanup().catch(console.error);
//     }
//
//     res.json({ text });
//   } catch (error) {
//     console.error('Erreur transcription:', error);
//     res.status(500).json({ error: 'Erreur lors de la transcription' });
//   }
// });
// src/server.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import https from 'https';
import fs from 'fs';
import { Assistant } from './core/assistant.js';
import { VoiceService } from './core/voice.js';
import { SpeechRecognition } from './core/speech.js';
import { SystemMonitor } from './core/system-monitor.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const USE_HTTPS = process.env.USE_HTTPS === 'true';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Augmenté pour gérer les fichiers audio
app.use(express.static(path.join(__dirname, '../public')));

// Instance unique de l'assistant (pour garder la mémoire)
const assistants = new Map<string, Assistant>();

// Fonction helper pour obtenir l'assistant par défaut initialisé
async function getDefaultAssistant(): Promise<Assistant> {
  if (!assistants.has('default')) {
    const assistant = new Assistant();
    await assistant.initialize();
    assistants.set('default', assistant);
  }
  return assistants.get('default')!;
}

// Instance unique du service vocal
const voiceService = new VoiceService();
voiceService.initialize();

const speechRecognition = new SpeechRecognition();
await speechRecognition.initialize();

// Instance unique du moniteur système
const systemMonitor = new SystemMonitor();

// Fonction pour pré-charger le modèle Ollama
async function warmupModel() {
  try {
    console.log('🔥 Pré-chargement du modèle LLM...');
    const assistant = new Assistant();
    await assistant.initialize();
    
    // Envoie une requête simple pour charger le modèle en mémoire
    await assistant.chat('Bonjour');
    
    console.log('✅ Modèle LLM chargé en mémoire');
    assistants.set('default', assistant);
  } catch (error) {
    console.error('⚠️  Erreur pré-chargement modèle:', error);
  }
}

// Route principale - sert le frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API - Chat avec l'assistant
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message requis' });
    }

    // Récupère ou crée l'assistant pour cette session
    if (!assistants.has(sessionId)) {
      const newAssistant = new Assistant();
      await newAssistant.initialize();
      assistants.set(sessionId, newAssistant);
    }

    const assistant = assistants.get(sessionId)!;
    const response = await assistant.chat(message);

    res.json({
      response,
      sessionId
    });

  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({
      error: 'Erreur lors du traitement de votre message'
    });
  }
});

// API - Effacer la mémoire
app.post('/api/clear', async (req, res) => {
  try {
    const { sessionId = 'default' } = req.body;

    if (assistants.has(sessionId)) {
      assistants.get(sessionId)!.clearMemory();
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur lors de la réinitialisation' });
  }
});

// API - Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    ollama: process.env.OLLAMA_HOST,
    model: process.env.MODEL_NAME
  });
});

// API - Gestion des faits (mémoire long terme)
app.get('/api/facts', async (req, res) => {
  try {
    const assistant = assistants.get('default') || new Assistant();
    if (!assistants.has('default')) {
      await assistant.initialize();
      assistants.set('default', assistant);
    }

    const facts = await assistant.getAllFacts();

    // Normalise pour le frontend : ajoute "relation" basé sur "predicate"
    const normalizedFacts = facts.map(f => ({
      ...f,
      relation: f.predicate,  // Le frontend attend "relation"
    }));

    res.json({ facts: normalizedFacts });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des faits' });
  }
});

app.post('/api/facts', async (req, res) => {
  try {
    const { key, value } = req.body;

    if (!key || !value) {
      return res.status(400).json({ error: 'Clé et valeur requises' });
    }

    const assistant = await getDefaultAssistant();
    const fact = await assistant.saveFact(key, value);
    res.json({ fact });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur lors de la sauvegarde du fait' });
  }
});

app.put('/api/facts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { key, value, predicate, objects, subject } = req.body;

    // Compatibilité avec ancien format (key/value) et nouveau (predicate/objects)
    const finalPredicate = predicate || key;
    const finalObjects = objects || (value ? [value] : []);

    if (!finalPredicate || finalObjects.length === 0) {
      return res.status(400).json({ error: 'Prédicat et au moins une valeur requis' });
    }

    const assistant = await getDefaultAssistant();
    const fact = await assistant.updateFact(id, finalPredicate, finalObjects, subject);

    if (!fact) {
      return res.status(404).json({ error: 'Fait non trouvé' });
    }

    res.json({ fact });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du fait' });
  }
});

app.delete('/api/facts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const assistant = await getDefaultAssistant();
    const deleted = await assistant.deleteFact(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Fait non trouvé' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du fait' });
  }
});

// API - Recherche de faits
app.get('/api/facts/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: 'Paramètre q requis' });
    }

    const assistant = await getDefaultAssistant();
    const facts = await assistant.searchFacts(query);
    res.json(facts);
  } catch (error) {
    console.error('Erreur recherche:', error);
    res.status(500).json({ error: 'Erreur lors de la recherche' });
  }
});

// API - Synthèse vocale
app.post('/api/speak', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Texte requis' });
    }

    console.log('🗣️  Génération audio pour:', text.substring(0, 100) + '...');

    const audioFile = await voiceService.textToSpeech(text);
    const audioUrl = `/audio/${path.basename(audioFile)}`;

    res.json({
      success: true,
      audioUrl
    });

  } catch (error) {
    console.error('Erreur TTS:', error);
    res.status(500).json({
      error: 'Erreur lors de la génération vocale'
    });
  }
});

// API - Statistiques système (VRAM, RAM, etc.)
app.get('/api/system/stats', async (req, res) => {
  try {
    const stats = await systemMonitor.getStats();
    const modelInfo = await systemMonitor.getModelInfo();

    res.json({
      success: true,
      stats,
      model: modelInfo
    });
  } catch (error) {
    console.error('Erreur système:', error);
    res.status(500).json({
      error: 'Erreur lors de la récupération des stats'
    });
  }
});

app.post('/api/transcribe', async (req, res) => {
  try {
    const { audio } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'Audio requis' });
    }

    console.log('🎙️ Réception audio, taille base64:', audio.length, 'caractères');
    
    const audioBuffer = Buffer.from(audio, 'base64');
    console.log('📦 Buffer audio:', audioBuffer.length, 'bytes');
    
    // Le navigateur envoie du WebM, on le convertira en WAV
    const audioPath = await speechRecognition.saveAudioBuffer(audioBuffer, 'webm');
    console.log('💾 Fichier audio sauvegardé:', audioPath);
    
    const text = await speechRecognition.transcribe(audioPath);
    console.log('📝 Texte transcrit:', text || '(vide)');

    if (Math.random() < 0.1) {
      speechRecognition.cleanup().catch(console.error);
    }

    res.json({ text });
  } catch (error) {
    console.error('❌ Erreur transcription:', error);
    res.status(500).json({ error: 'Erreur lors de la transcription' });
  }
});

// Démarrage du serveur (HTTP ou HTTPS selon config)
if (USE_HTTPS) {
  const certPath = path.join(__dirname, '../certs');

  if (!fs.existsSync(path.join(certPath, 'key.pem')) ||
      !fs.existsSync(path.join(certPath, 'cert.pem'))) {
    console.error('❌ Certificats SSL manquants dans le dossier /certs');
    console.error('📝 Suivez les instructions pour générer les certificats avec mkcert');
    process.exit(1);
  }

  const httpsOptions = {
    key: fs.readFileSync(path.join(certPath, 'key.pem')),
    cert: fs.readFileSync(path.join(certPath, 'cert.pem'))
  };

  https.createServer(httpsOptions, app).listen(PORT, async () => {
    console.log(`🔒 Serveur HTTPS démarré sur https://localhost:${PORT}`);
    console.log(`📡 Connecté à Ollama sur ${process.env.OLLAMA_HOST}`);
    console.log(`🤖 Modèle: ${process.env.MODEL_NAME}`);
    
    // Pré-charge le modèle en arrière-plan
    warmupModel().catch(console.error);
  });
} else {
  app.listen(PORT, async () => {
    console.log(`🚀 Serveur HTTP démarré sur http://localhost:${PORT}`);
    console.log(`📡 Connecté à Ollama sur ${process.env.OLLAMA_HOST}`);
    console.log(`🤖 Modèle: ${process.env.MODEL_NAME}`);
    console.log(`⚠️  Le microphone ne fonctionnera pas sans HTTPS`);
    
    // Pré-charge le modèle en arrière-plan
    warmupModel().catch(console.error);
  });
}
