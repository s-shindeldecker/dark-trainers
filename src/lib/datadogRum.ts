import { datadogRum } from '@datadog/browser-rum';

/**
 * Defensive Datadog RUM wrapper (stretch goal: "Branch A" feature-flag tagging).
 *
 * Everything here is a NO-OP unless BOTH `VITE_DATADOG_APPLICATION_ID` and
 * `VITE_DATADOG_CLIENT_TOKEN` are set at build time. Without a Datadog account
 * the SDK is never initialized, `tagFeatureFlag` does nothing, and the rest of
 * the app is completely unaffected — so this can ship dark and be switched on
 * later just by adding the two env vars (a 14-day self-serve trial is enough).
 *
 * When configured, the flow mirrors LaunchDarkly's documented pattern: init RUM
 * with the `feature_flags` experimental feature, then call
 * `datadogRum.addFeatureFlagEvaluation(flagKey, value)` at the same site where
 * the flag is read. Verify in the browser console with
 * `__ddRumInitConfig()` (exposed below) or `datadogRum.getInitConfiguration()`.
 */

const applicationId = import.meta.env.VITE_DATADOG_APPLICATION_ID as string | undefined;
const clientToken = import.meta.env.VITE_DATADOG_CLIENT_TOKEN as string | undefined;
const site = (import.meta.env.VITE_DATADOG_SITE as string | undefined) || 'datadoghq.com';
const service = (import.meta.env.VITE_DATADOG_SERVICE as string | undefined) || 'darktrainers-web';
const ddEnv = (import.meta.env.VITE_DATADOG_ENV as string | undefined) || 'demo';
const version = import.meta.env.VITE_DATADOG_VERSION as string | undefined; // optional; tags RUM data with an app version

let initialized = false;

/** True only when the trial credentials are present. */
export function isDatadogConfigured(): boolean {
  return Boolean(applicationId && clientToken);
}

/**
 * Initialize RUM once, and only if configured. Safe to call on every mount —
 * subsequent calls short-circuit. Any failure is swallowed so it can never take
 * the page down.
 */
export function initDatadogRum(): void {
  if (initialized || !isDatadogConfigured()) return;
  try {
    datadogRum.init({
      applicationId: applicationId!,
      clientToken: clientToken!,
      site,
      service,
      env: ddEnv,
      ...(version ? { version } : {}),
      sessionSampleRate: 100,
      // Kept at 0 on purpose: LaunchDarkly's Session Replay plugin already records
      // sessions (see LDContext.tsx). Running Datadog's replayer too would double
      // the recording overhead. Raise this only if you also disable LD's replay.
      sessionReplaySampleRate: 0,
      trackUserInteractions: true,
      trackResources: true,
      trackLongTasks: true,
      defaultPrivacyLevel: 'mask-user-input',
      // Branch A: enables flag evaluations to ride along on RUM events.
      enableExperimentalFeatures: ['feature_flags'],
    });
    initialized = true;
    // Console-verifiable, per the spec's getInitConfiguration() check.
    (window as unknown as Record<string, unknown>).__ddRumInitConfig = () =>
      datadogRum.getInitConfiguration();
  } catch (err) {
    console.warn('[datadog] RUM init skipped:', err);
  }
}

/**
 * Tag a feature-flag evaluation on the current RUM view. No-op until RUM is
 * initialized (i.e. until the trial credentials are provided).
 */
export function tagFeatureFlag(flagKey: string, value: unknown): void {
  if (!initialized) return;
  try {
    datadogRum.addFeatureFlagEvaluation(flagKey, value as never);
  } catch {
    /* never let telemetry break the feature */
  }
}
