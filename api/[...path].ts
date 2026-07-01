import { createApp } from '../server/app.js';

// Cache the built app across warm invocations so LaunchDarkly only
// initializes on cold start, not per request.
let appPromise: ReturnType<typeof createApp> | undefined;

// Vercel serverless entry: hand every /api/* request to the Express app.
// The catch-all filename preserves the full request path (e.g.
// /api/card-creator), which is what the app's routes are mounted on.
export default async function handler(req: any, res: any) {
  appPromise ??= createApp();
  const app = await appPromise;
  app(req, res);
}
