import { createApp } from '../server/app.js';

// Cache the built app across warm invocations so LaunchDarkly only
// initializes on cold start, not per request.
let appPromise: ReturnType<typeof createApp> | undefined;

// Single Vercel entry for the whole API. vercel.json rewrites every
// /api/* request here; req.url keeps the original path (e.g.
// /api/card-creator/art), which is what the Express routes are mounted on.
export default async function handler(req: any, res: any) {
  console.log('[api] incoming', req.method, req.url);
  appPromise ??= createApp();
  const app = await appPromise;
  app(req, res);
}
