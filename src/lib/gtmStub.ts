/**
 * GTM Custom HTML Tag stub — paste this into a GTM Custom HTML tag
 * triggered on event name "ld_conversion"
 *
 * <script>
 * (function() {
 *   var eventKey = {{dlv - eventKey}};  // GTM Data Layer Variable
 *   if (window.ldClient) {
 *     window.ldClient.track(eventKey);
 *   }
 * })();
 * </script>
 */

import type { LDClient } from 'launchdarkly-react-client-sdk';

/** Push an event payload onto the GTM dataLayer, initializing it if needed. */
export function pushToDataLayer(payload: Record<string, unknown>) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

// Expose ldClient on window for GTM access (Option A: app-initialized SDK)
export function exposeLDClientForGTM(client: LDClient) {
  window.ldClient = client;
}
