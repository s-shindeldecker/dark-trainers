import { shutdown } from '@launchdarkly/ai-node';
import { createApp } from './app.js';

const PORT = parseInt(process.env.SERVER_PORT || '3001', 10);

// Local dev entry point. On Vercel the app runs via api/ instead (see api/).
createApp()
  .then((app) => {
    app.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  });

// Close the AI SDK's LD client (flushes its events) on Ctrl+C / tsx watch
// restarts. Local only: on Vercel the instance is never signalled this way.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    shutdown()
      .catch((error) => console.error('[Server] AI SDK shutdown failed:', error))
      .finally(() => process.exit(0));
  });
}
