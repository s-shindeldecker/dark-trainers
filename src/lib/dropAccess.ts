/**
 * Drop-access entitlement: the `ac26-drop-access` flag's three variations, and
 * what each one means for a drop-exclusive product.
 *
 * This module is the single mapping from flag string → app-internal state, and
 * the single definition of what that state permits. It is deliberately pure —
 * no LaunchDarkly SDK, no React, no Node — because *both* runtimes need it:
 *
 *   - the Express server evaluates the flag with the Node SDK and maps it here
 *     (see server/search/access.ts, the one server-side resolver)
 *   - the browser evaluates the same flag with the React SDK and maps it here
 *     (grid + PDP)
 *
 * Two SDKs, two evaluations, but one mapping. That is the point: the last time
 * the same gate was expressed twice, the two copies disagreed and a metric
 * stopped matching the screen.
 *
 * Gating keys off the catalog's `isDropExclusive` boolean. It deliberately does
 * NOT match on tag text: the older grid filter tested `tags.includes('early-access')`,
 * which silently missed `volt-1` (tagged `'Early access'`, capitalized) and let a
 * drop-exclusive SKU leak into the guest grid. The tag strings are untouched —
 * nothing gates on them any more.
 */

/** The flag key. Three variations, all real and load-bearing in production. */
export const DROP_ACCESS_FLAG_KEY = 'ac26-drop-access';

/**
 * Off/fallback variation. `teaser` is the locked state, so a missing flag, a
 * failed evaluation, or an SDK that hasn't initialized all fail closed.
 */
export const DEFAULT_DROP_ACCESS = 'teaser';

/**
 * What the visitor may do with a drop-exclusive product.
 *
 * | flag variation | state         | behavior                                  |
 * |----------------|---------------|-------------------------------------------|
 * | `teaser`       | `hidden`      | not shown at all — grid, search, or PDP   |
 * | `early-access` | `view-only`   | shown everywhere, purchase blocked        |
 * | `full-access`  | `full-access` | shown and purchasable                     |
 */
export type DropAccessState = 'hidden' | 'view-only' | 'full-access';

/**
 * Map an `ac26-drop-access` value to its state.
 *
 * Unrecognized values (including a variation added in the LD UI that this code
 * doesn't know about yet) fall to `hidden` — the closed state. An unknown
 * variation must never accidentally unlock a drop.
 */
export function dropAccessStateFromFlag(value: unknown): DropAccessState {
  switch (value) {
    case 'full-access':
      return 'full-access';
    case 'early-access':
      return 'view-only';
    case 'teaser':
    default:
      return 'hidden';
  }
}

/**
 * Minimal shape the gate needs. Structural rather than importing `Product`, so
 * this module stays dependency-free and works on a ranked search result, a
 * catalog entry, or anything else carrying the flag.
 */
export interface DropGatable {
  isDropExclusive: boolean;
}

/** Non-exclusive products are always visible; exclusives only when not hidden. */
export function isDropProductVisible(product: DropGatable, state: DropAccessState): boolean {
  return !product.isDropExclusive || state !== 'hidden';
}

/** Non-exclusive products are always purchasable; exclusives only on full access. */
export function isDropProductPurchasable(product: DropGatable, state: DropAccessState): boolean {
  return !product.isDropExclusive || state === 'full-access';
}
