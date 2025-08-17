/**
 * Ultra-simple Sogni backend for One Piece image generation
 * - Exposes POST /api/generate to start a render
 * - Exposes GET  /api/progress/:projectId for SSE progress + results
 * - Specialized for One Piece anime style generations
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { Readable } from 'node:stream';

const app = express();
app.use(express.json({ limit: '8mb' }));

const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: function (origin, cb) {
      if (!origin || origins.includes(origin)) return cb(null, true);
      return cb(new Error(`Blocked by CORS: ${origin}`));
    },
    credentials: false
  })
);

const PORT = process.env.PORT || 3001;

// Project tracking
const sseClients = new Map();
const activeProjects = new Map();
let sogniClient = null;

// One Piece specialized render defaults
const MODEL_ID = 'flux1-schnell-fp8'; // Same model but with One Piece style prompts
const RENDER_DEFAULTS = {
  steps: 6, // Slightly more steps for better anime quality
  guidance: 1.2, // Higher guidance for sharper anime style
  scheduler: 'Euler',
  timeStepSpacing: 'Simple',
  sizePreset: 'custom',
  width: 768,
  height: 768,
  tokenType: 'spark',
  negativePrompt: 'blurry, low quality, watermark, text, signature, bad anatomy, distorted, ugly, realistic, photorealistic, 3d render' // Strong anti-realistic bias
};

async function getSogniClient() {
  if (sogniClient) return sogniClient;
  const { SogniClient } = await import('@sogni-ai/sogni-client');

  const env = process.env.SOGNI_ENV || 'production';
  const hosts = {
    local: { socket: 'wss://socket-local.sogni.ai', api: 'https://api-local.sogni.ai' },
    staging: { socket: 'wss://socket-staging.sogni.ai', api: 'https://api-staging.sogni.ai' },
    production: { socket: 'wss://socket.sogni.ai', api: 'https://api.sogni.ai' }
  };
  const endpoints = hosts[env] || hosts.production;

  const client = await SogniClient.createInstance({
    appId: process.env.SOGNI_APP_ID || `one-piece-generator-${Date.now()}`,
    testnet: env !== 'production',
    network: 'fast',
    restEndpoint: endpoints.api,
    socketEndpoint: endpoints.socket,
    logLevel: 'info'
  });

  try {
    if (process.env.SOGNI_USERNAME && process.env.SOGNI_PASSWORD) {
      await client.account.login(process.env.SOGNI_USERNAME, process.env.SOGNI_PASSWORD);
      console.log('✅ Logged into Sogni successfully');
    } else {
      console.warn('⚠️ Running in demo mode - no Sogni credentials set');
    }
  } catch (err) {
    console.error('❌ Sogni login failed:', err.message);
  }

  sogniClient = client;
  return client;
}

function emitToProject(projectId, payload) {
  const clients = sseClients.get(projectId);
  if (!clients) return;
  const data = `data: ${JSON.stringify({ projectId, ...payload })}\n\n`;
  clients.forEach(res => {
    try { res.write(data); } catch {}
  });
}

/**
 * Generate 16 One Piece style variations with:
 * - Character focus (Luffy, Zoro, etc.)
 * - Signature One Piece art style
 * - Typical scenes (Grand Line, battles, etc.)
 */
function generateOnePieceVariations(basePrompt, character = '', sceneType = '') {
  const characters = character ? [character] : [
    'Monkey D. Luffy', 'Roronoa Zoro', 'Nami', 'Usopp', 'Sanji',
    'Tony Tony Chopper', 'Nico Robin', 'Franky', 'Brook', 'Jimbei',
    'Shanks', 'Portgas D. Ace', 'Trafalgar Law', 'Boa Hancock'
  ];

  const styles = [
    'Eiichiro Oda art style',
    'official One Piece manga style',
    'vibrant anime colors',
    'dynamic shonen action pose',
    'detailed line art',
    'bold inking style',
    'color spread style',
    'volume cover art style',
    'Wanted poster style',
    'anime key visual style'
  ];

  const scenes = sceneType ? [sceneType] : [
    'on the Thousand Sunny',
    'battle scene',
    'Devil Fruit power activation',
    'in the Grand Line',
    'at Marineford',
    'in Wano Country',
    'with the Straw Hat crew',
    'using Haki',
    'in a dramatic close-up',
    'laughing together'
  ];

  const variations = [];
  for (let i = 0; i < 16; i++) {
    const char = characters[i % characters.length];
    const style = styles[i % styles.length];
    const scene = scenes[i % scenes.length];
    
    let prompt = `${char}, ${basePrompt}, ${scene}, ${style}, official One Piece artwork`;
    prompt += ', detailed anime illustration, vibrant colors, dynamic composition';
    variations.push(prompt);
  }

  return variations;
}

// Routes
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, character = '', sceneType = '', seed } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    const client = await getSogniClient();
    const variations = generateOnePieceVariations(prompt, character, sceneType);

    const project = await client.projects.create({
      modelId: MODEL_ID,
      positivePrompt: variations[0],
      negativePrompt: RENDER_DEFAULTS.negativePrompt,
      numberOfImages: 16,
      ...(seed !== undefined && seed !== -1 ? { seed: Number(seed) } : {}),
      ...RENDER_DEFAULTS
    });

    const projectId = project.id;
    activeProjects.set(projectId, project);

    res.json({
      projectId,
      jobs: project.jobs.map((j, i) => ({ id: j.id, index: i }))
    });

    // Event handling (same as original)
    const jobIndexById = new Map(project.jobs.map((j, i) => [j.id, i]));

    const onProject = async (evt) => {
      if (evt.projectId !== projectId) return;
      if (evt.type === 'completed') {
        setTimeout(async () => {
          emitToProject(projectId, { type: 'completed' });
          detach();
        }, 2000);
      } else if (evt.type === 'error') {
        emitToProject(projectId, { type: 'failed', error: evt.error });
        detach();
      }
    };

    const onJob = async (evt) => {
      if (evt.projectId !== projectId) return;
      
      if (evt.type === 'progress') {
        emitToProject(projectId, {
          type: 'progress',
          jobId: evt.jobId,
          progress: Math.round(clamp01(evt.progress) * 100)
        });
      } else if (evt.type === 'completed') {
        const resultUrl = await ensureJobResultUrl(project, evt.jobId, evt.resultUrl);
        emitToProject(projectId, {
          type: 'jobCompleted',
          job: {
            id: evt.jobId,
            resultUrl,
            positivePrompt: evt.positivePrompt
          }
        });
      }
    };

    const debugProject = (evt) => {
      console.log('[OnePiece] Project event:', evt.type);
      onProject(evt);
    };

    const debugJob = (evt) => {
      console.log('[OnePiece] Job event:', evt.type);
      onJob(evt);
    };

    client.projects.on('project', debugProject);
    client.projects.on('job', debugJob);

    function detach() {
      client.projects.off('project', debugProject);
      client.projects.off('job', debugJob);
      setTimeout(() => activeProjects.delete(projectId), 600000);
    }

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err?.message || 'Generation failed' });
  }
});

// Keep all other routes the same as original (SSE, cancel, proxy, etc.)
app.get('/api/progress/:projectId', (req, res) => {
  // ... identical SSE implementation ...
});

app.get('/api/cancel/:projectId', async (req, res) => {
  // ... identical cancel implementation ...
});

app.get('/api/result/:projectId/:jobId', async (req, res) => {
  // ... identical proxy implementation ...
});

app.get('/api/health', (_, res) => {
  res.json({ ok: true, env: process.env.SOGNI_ENV || 'production' });
});

app.listen(PORT, () => {
  console.log(`🚀 One Piece generator API running on port ${PORT}`);
});