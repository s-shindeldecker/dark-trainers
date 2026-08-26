// Load environment variables before anything reads process.env. This module is
// imported first (before Express) everywhere the server is built, so this is
// the earliest point env is needed.
import 'dotenv/config';
import { init } from '@launchdarkly/node-server-sdk';
import { Observability } from '@launchdarkly/observability-node';

/**
 * Initializes the LaunchDarkly Node SDK with the server-side Observability
 * plugin, in its own module so it can be imported *before* Express.
 *
 * Why a dedicated module: the Observability plugin sets up OpenTelemetry
 * auto-instrumentation during init(), and OTel can only patch modules
 * (`express`, `http`) that are loaded *after* that instrumentation is
 * registered. If Express is imported before the SDK initializes, route and
 * middleware traces are never captured. LaunchDarkly documents this exact
 * pattern for Express users:
 * https://launchdarkly.com/docs/sdk/observability/node-js
 *
 * Consumers must import this module before importing Express (see server/app.ts).
 */
const LD_SDK_KEY = process.env.LAUNCHDARKLY_SDK_KEY;
if (!LD_SDK_KEY) {
  throw new Error('LAUNCHDARKLY_SDK_KEY is required. Set it in your environment.');
}

export const ldClient = init(LD_SDK_KEY, {
  plugins: [
    new Observability({
      serviceName: 'dark-trainers-api',
      // Recommended: the latest deployed git SHA. Vercel provides this at build
      // and runtime; falls back to a local-dev marker off-platform.
      serviceVersion: process.env.VERCEL_GIT_COMMIT_SHA || 'local-dev',
    }),
  ],
});
