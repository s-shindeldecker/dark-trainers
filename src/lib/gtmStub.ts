/**
 * GTM Custom HTML Tag stub — paste this into a GTM Custom HTML tag
 * triggered on event name "ld_conversion".
 *
 * Requires two GTM Data Layer Variables: `dlv - eventKey` and `dlv - value`.
 * The value is forwarded as LD's numeric metric value, so numeric metrics work
 * in GTM mode consistently with the direct `ldClient.track()` path. It is only
 * passed when present, so value-less events (e.g. card_downloaded) don't send
 * NaN; binary metrics ignore the value.
 *
 * <script>
 * (function() {
 *   var eventKey = {{dlv - eventKey}};  // GTM Data Layer Variable
 *   var value = {{dlv - value}};        // GTM Data Layer Variable
 *   if (window.ldClient && eventKey) {
 *     if (value === undefined || value === null || value === '') {
 *       window.ldClient.track(eventKey);
 *     } else {
 *       window.ldClient.track(eventKey, null, Number(value));
 *     }
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
