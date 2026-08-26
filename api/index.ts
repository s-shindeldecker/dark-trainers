import { createApp } from '../server/app.js';
import { LDObserve } from '@launchdarkly/observability-node';

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

    // Run the request and wait for the response to finish. On serverless the
    // isolate can freeze the moment the handler resolves, so we can't fire the
    // response and return — we must keep the instance alive until the response
    // is done and (below) telemetry is flushed.
    await new Promise<void>((resolve) => {
      res.once('finish', resolve);
      res.once('close', resolve);
      app(req, res);
    });
  } catch (err) {
    console.error('[api] app initialization failed:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Server initialization failed' }));
    }
  } finally {
    // Flush buffered spans/logs/errors before the isolate can freeze. This runs
    // after the response is already sent, so it adds no client-visible latency.
    try {
      await LDObserve.flush();
    } catch (flushErr) {
      console.error('[api] observability flush failed:', flushErr);
    }
  }
}
