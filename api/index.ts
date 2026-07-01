import { createApp } from '../server/app.js';

// Cache the built app across warm invocations so LaunchDarkly only
// initializes on cold start, not per request.
let appPromise: ReturnType<typeof createApp> | undefined;

// Single Vercel entry for the whole API. vercel.json rewrites every
// /api/* request here; req.url keeps the original path (e.g.
// /api/card-creator/art), which is what the Express routes are mounted on.
export default async function handler(req: any, res: any) {
  try {
    if (!appPromise) {
      // If init rejects, clear the cache so the next request retries instead
      // of reusing a permanently-failed promise on this warm instance.
      appPromise = createApp().catch((err) => {
        appPromise = undefined;
        throw err;
      });
    }
    const app = await appPromise;
    app(req, res);
  } catch (err) {
    console.error('[api] app initialization failed:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Server initialization failed' }));
    }
  }
}
