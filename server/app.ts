import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { init } from '@launchdarkly/node-server-sdk';
import { initAi } from '@launchdarkly/server-sdk-ai';
import { createChatRouter } from './routes/chat.js';
import { createCardCreatorRouter } from './routes/card-creator.js';
import { createSignupAgentRouter } from './routes/signup-agent.js';
import { createSimulateRouter } from './routes/simulate.js';

dotenv.config();

/**
 * Builds and returns the configured Express app. Shared by the local dev
 * server (server/index.ts) and the Vercel serverless function (api/).
 *
 * Serverless-safe: it never calls process.exit() or app.listen(), and it
 * tolerates a slow/failed LaunchDarkly init (routes fall back gracefully).
 */
export async function createApp() {
  const LD_SDK_KEY = process.env.LAUNCHDARKLY_SDK_KEY;
  if (!LD_SDK_KEY) {
    throw new Error('LAUNCHDARKLY_SDK_KEY is required. Set it in your environment.');
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  const ldClient = init(LD_SDK_KEY);

  try {
    await ldClient.waitForInitialization({ timeout: 10 });
    console.log('[Server] LaunchDarkly SDK initialized.');
  } catch (error) {
    // Don't crash the function — routes use fallback behavior when LD is down.
    console.error('[Server] Failed to initialize LaunchDarkly SDK:', error);
  }

  const aiClient = initAi(ldClient);

  app.use('/api/chat', createChatRouter(ldClient, aiClient));
  app.use('/api/card-creator', createCardCreatorRouter(ldClient, aiClient));
  app.use('/api/signup-agent', createSignupAgentRouter(ldClient, aiClient));
  app.use('/api/simulate', createSimulateRouter(ldClient));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Fallback: any /api request that matched no route returns JSON echoing the
  // path Express saw. Distinguishes an Express route miss from a platform
  // routing miss (which would return Vercel's own HTML 404 instead).
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not found',
      method: req.method,
      url: req.url,
      originalUrl: req.originalUrl,
    });
  });

  return app;
}
