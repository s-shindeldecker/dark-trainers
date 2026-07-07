import { useCallback, useRef } from 'react';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { useFeatureFlag } from './useFeatureFlag';
import { LD_FLAGS } from '../lib/ldFlagKeys';
import { pushToDataLayer } from '../lib/gtmStub';

export interface ConversionOpts {
  value?: number;
  productId?: string;
}

export interface TrackConversion {
  /**
   * Fire a conversion through exactly one path, governed by the
   * `track-conversions-via-gtm` flag. Stable identity across renders (reads the
   * latest flag/client from a ref) so it is safe to list in a `useEffect`
   * dependency array without re-firing when the flag resolves or changes.
   */
  trackConversion: (eventKey: string, opts?: ConversionOpts) => void;
  /**
   * True once the routing flag has finished evaluating. Effects that fire a
   * conversion automatically (e.g. a page-view) MUST gate on this — otherwise
   * they can fire once against the default (direct) path and again once routing
   * resolves to GTM, double-counting the same event. User-triggered conversions
   * (click handlers) run long after init and can ignore it.
   */
  ready: boolean;
}

/**
 * Single source of truth for conversion routing:
 *
 * - flag **on**  → push `ld_conversion` onto the GTM dataLayer only; GTM's
 *   Custom HTML tag forwards it to LD via `ldClient.track()` (see gtmStub.ts).
 * - flag **off** → call `ldClient.track()` directly only.
 *
 * Any page that emits conversions must use this hook rather than calling
 * `ldClient.track()` and `pushToDataLayer()` side by side, which double-counts
 * whenever a GTM forwarding tag is live.
 */
export function useTrackConversion(): TrackConversion {
  const { value: trackViaGtm, isLoading } = useFeatureFlag(LD_FLAGS.trackConversionsViaGtm, false);
  const ldClient = useLDClient();

  // Keep the latest values in a ref so trackConversion can stay identity-stable
  // (empty dep array) yet always read current state. A stable callback is what
  // lets consumers depend on it in effects without re-firing on flag changes.
  const latest = useRef({ trackViaGtm, ldClient });
  latest.current = { trackViaGtm, ldClient };

  const trackConversion = useCallback((eventKey: string, opts?: ConversionOpts) => {
    const { trackViaGtm, ldClient } = latest.current;
    if (trackViaGtm) {
      pushToDataLayer({ event: 'ld_conversion', eventKey, ...opts });
    } else {
      ldClient?.track(eventKey, null, opts?.value);
    }
  }, []);

  return { trackConversion, ready: !isLoading };
}
