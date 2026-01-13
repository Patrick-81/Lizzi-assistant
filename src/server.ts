// src/server.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Assistant } from './core/assistant.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { SystemMonitor } from './core/system-monitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const systemMonitor = new SystemMonitor();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Instance unique de l'assistant (pour garder la mémoire)
const assistants = new Map<string, Assistant>();

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

    const assistant = assistants.get('default') || new Assistant();
    if (!assistants.has('default')) {
      await assistant.initialize();
      assistants.set('default', assistant);
    }

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
    const { key, value } = req.body;

    if (!key || !value) {
      return res.status(400).json({ error: 'Clé et valeur requises' });
    }

    const assistant = assistants.get('default') || new Assistant();
    const fact = await assistant.updateFact(id, key, value);

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
    const assistant = assistants.get('default') || new Assistant();
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

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📡 Connecté à Ollama sur ${process.env.OLLAMA_HOST}`);
  console.log(`🤖 Modèle: ${process.env.MODEL_NAME}`);
});
app.get('/api/system/stats', async (req, res) => {
  try {
    const stats = await systemMonitor.getStats();
    const modelInfo = await systemMonitor.getModelInfo();

    res.json({
      stats,
      model: modelInfo
    });
  } catch (error) {
    console.error('Erreur stats système:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des stats' });
  }
});
