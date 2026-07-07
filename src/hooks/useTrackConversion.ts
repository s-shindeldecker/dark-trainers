import { useCallback } from 'react';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { useFeatureFlag } from './useFeatureFlag';
import { LD_FLAGS } from '../lib/ldFlagKeys';
import { pushToDataLayer } from '../lib/gtmStub';

export interface ConversionOpts {
  value?: number;
  productId?: string;
}

/**
 * Fire a conversion through exactly one path, governed by the
 * `track-conversions-via-gtm` flag — guaranteeing no double-counting:
 *
 * - flag **on**  → push `ld_conversion` onto the GTM dataLayer only; GTM's
 *   Custom HTML tag forwards it to LD via `ldClient.track()` (see gtmStub.ts).
 * - flag **off** → call `ldClient.track()` directly only.
 *
 * This is the single source of truth for the either/or routing. Any page that
 * emits conversions (Card Creator, Collectible detail, …) must use this hook
 * rather than calling `ldClient.track()` and `pushToDataLayer()` side by side,
 * which would double-count whenever a GTM forwarding tag is live.
 */
export function useTrackConversion() {
  const { value: trackViaGtm } = useFeatureFlag(LD_FLAGS.trackConversionsViaGtm, false);
  const ldClient = useLDClient();

  return useCallback(
    (eventKey: string, opts?: ConversionOpts) => {
      if (trackViaGtm) {
        pushToDataLayer({ event: 'ld_conversion', eventKey, ...opts });
      } else {
        ldClient?.track(eventKey, null, opts?.value);
      }
    },
    [trackViaGtm, ldClient],
  );
}
