// Must be imported before Express so the Observability plugin's OpenTelemetry
// auto-instrumentation can patch Express/http as they load. Also loads env.
// See server/launchdarkly.ts for the full rationale.
import { ldClient } from './launchdarkly.js';
import express from 'express';
import cors from 'cors';
import { initAi } from '@launchdarkly/server-sdk-ai';
import { createChatRouter } from './routes/chat.js';
import { createCardCreatorRouter } from './routes/card-creator.js';
import { createSignupAgentRouter } from './routes/signup-agent.js';
import { createSimulateRouter } from './routes/simulate.js';

/**
 * Builds and returns the configured Express app. Shared by the local dev
 * server (server/index.ts) and the Vercel serverless function (api/).
 *
 * Serverless-safe: it never calls process.exit() or app.listen(), and it
 * tolerates a slow/failed LaunchDarkly init (routes fall back gracefully).
 */
export async function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // The LD client (with the Observability plugin) is created at import time in
  // ./launchdarkly.js; here we just wait for it to be ready.
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
