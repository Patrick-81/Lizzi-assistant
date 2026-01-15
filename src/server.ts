// src/server.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Assistant } from './core/assistant.js';
import { VoiceService } from './core/voice.js';
import { SystemMonitor } from './core/system-monitor.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
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

// Instance unique du moniteur système
const systemMonitor = new SystemMonitor();

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
    const assistant = await getDefaultAssistant();
    const facts = await assistant.getAllFacts();
    res.json({ facts });
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

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📡 Connecté à Ollama sur ${process.env.OLLAMA_HOST}`);
  console.log(`🤖 Modèle: ${process.env.MODEL_NAME}`);
});
