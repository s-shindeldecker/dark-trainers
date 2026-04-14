import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { init } from '@launchdarkly/node-server-sdk';
import { initAi } from '@launchdarkly/server-sdk-ai';
import { createChatRouter } from './routes/chat.js';
import { createSignupAgentRouter } from './routes/signup-agent.js';
import { createSimulateRouter } from './routes/simulate.js';
dotenv.config();

const PORT = parseInt(process.env.SERVER_PORT || '3001', 10);
const LD_SDK_KEY = process.env.LAUNCHDARKLY_SDK_KEY;

if (!LD_SDK_KEY) {
  console.error('LAUNCHDARKLY_SDK_KEY is required. Set it in your .env file.');
  process.exit(1);
}

async function start() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  console.log('[Server] Initializing LaunchDarkly server-side SDK...');
  const ldClient = init(LD_SDK_KEY!);

  try {
    await ldClient.waitForInitialization({ timeout: 10 });
    console.log('[Server] LaunchDarkly SDK initialized.');
  } catch (error) {
    console.error('[Server] Failed to initialize LaunchDarkly SDK:', error);
    process.exit(1);
  }

  const aiClient = initAi(ldClient);

  app.use('/api/chat', createChatRouter(ldClient, aiClient));
  app.use('/api/signup-agent', createSignupAgentRouter(ldClient, aiClient));
  app.use('/api/simulate', createSimulateRouter(ldClient));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

start();
