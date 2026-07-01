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
