/// <reference types="vite/client" />

interface Window {
  /** Google Tag Manager dataLayer (GTM integration). */
  dataLayer?: Record<string, unknown>[];
  /** App-initialized LaunchDarkly client, exposed for GTM Custom HTML tags. */
  ldClient?: import('launchdarkly-react-client-sdk').LDClient;
}
