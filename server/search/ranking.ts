/**
 * Product search ranking — the three variations served by the
 * `search-ranking-algorithm` LaunchDarkly flag.
 *
 * All three operate on the same in-app static catalog
 * (src/components/Products/productData.ts). Nothing here queries a warehouse:
 * `dim_product` is a hand-seeded snapshot of that same file and must never be
 * read on the request path.
 *
 * The relevance logic is demo-grade on purpose. What has to be real is that the
 * three functions are genuinely different algorithms over real `Product` fields,
 * so a buyer watching the stage sees the result order change when the flag
 * changes — not three labels on one sort.
 */
import { products, type Product } from '../../src/components/Products/productData.js';
import {
  isDropProductPurchasable,
  isDropProductVisible,
  type DropAccessState,
} from '../../src/lib/dropAccess.js';

export const SEARCH_VARIATIONS = [
  'legacy-keyword',
  'weighted-relevance',
  'personalized-affinity',
] as const;

export type SearchVariation = (typeof SEARCH_VARIATIONS)[number];

/** Control arm. Also the flag's off/fallback value — see section 3 of the plan. */
export const DEFAULT_SEARCH_VARIATION: SearchVariation = 'legacy-keyword';


export function isSearchVariation(value: unknown): value is SearchVariation {
  return SEARCH_VARIATIONS.includes(value as SearchVariation);
}

/**
 * The attributes the personalized arm reads off the requesting context. Both are
 * optional: a guest has neither, and the algorithm has to degrade to plain
 * keyword relevance rather than throw or return nothing.
 */
export interface SearchRequester {
  memberTier?: string;
  preferredCategory?: string;
}

export interface RankedProduct extends Product {
  /** Ranking score, rounded. Exposed so the served arm is verifiable on stage. */
  _score: number;
}

/**
 * Collectibles live in the same array but have their own catalog page, so the
 * PLP search domain is footwear only — matching what `/products` renders.
 */
const SEARCHABLE: Product[] = products.filter((p) => p.category !== 'collectibles');

/** Lowercased alphanumeric tokens, deduped. Single characters are dropped. */
function tokenize(query: string): string[] {
  const seen = new Set<string>();
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length >= 2) seen.add(raw);
  }
  return [...seen];
}

function normalize(value: string): string {
  return value.toLowerCase();
}

/**
 * The searchable text of a product, split by field so the weighted arm can
 * treat a name hit differently from a description hit.
 *
 * The plan calls the naive field set "name + description + tags". `subtitle` and
 * `collab` are folded into `name` because they are rendered as part of the
 * display name ("VOLT-HI x AC26 — Magenta Drop"), and `colorway` / `category`
 * are included so the obvious stage queries ("black", "running") match under
 * every arm rather than only the ones that happen to mention a color in prose.
 */
interface ProductText {
  name: string;
  tags: string[];
  body: string;
}

function productText(p: Product): ProductText {
  return {
    name: normalize([p.name, p.subtitle, p.collab, p.brand].filter(Boolean).join(' ')),
    tags: p.tags.map(normalize),
    body: normalize([p.colorway, p.category, p.description].join(' ')),
  };
}

// The catalog is static, so the per-product text is computed once at module
// load rather than on every request.
const TEXT = new Map<string, ProductText>(SEARCHABLE.map((p) => [p.id, productText(p)]));

function textOf(p: Product): ProductText {
  return TEXT.get(p.id) ?? productText(p);
}

function containsToken(text: ProductText, token: string): boolean {
  return (
    text.name.includes(token) ||
    text.body.includes(token) ||
    text.tags.some((tag) => tag.includes(token))
  );
}

/** How many of the query's tokens appear anywhere in the product's text. */
function tokenHitCount(text: ProductText, tokens: string[]): number {
  return tokens.reduce((n, token) => (containsToken(text, token) ? n + 1 : n), 0);
}

/** Shared base match: a product is a candidate if any query token appears. */
function candidates(tokens: string[]): Array<{ product: Product; hits: number }> {
  const out: Array<{ product: Product; hits: number }> = [];
  for (const product of SEARCHABLE) {
    const hits = tokenHitCount(textOf(product), tokens);
    if (hits > 0) out.push({ product, hits });
  }
  return out;
}

/** Score desc, then name asc — the alphabetical tie-break every arm shares. */
function byScoreThenName(a: RankedProduct, b: RankedProduct): number {
  if (b._score !== a._score) return b._score - a._score;
  return a.name.localeCompare(b.name);
}

function finish(scored: Array<{ product: Product; score: number }>): RankedProduct[] {
  return scored
    .map(({ product, score }) => ({ ...product, _score: Math.round(score * 100) / 100 }))
    .sort(byScoreThenName);
}

// ---------------------------------------------------------------------------
// legacy-keyword (control)
// ---------------------------------------------------------------------------

/**
 * Naive keyword match: every field counts the same, the score is just how many
 * query tokens were found, and ties break alphabetically. No field weighting,
 * no recency, no personalization — it is meant to look basic, and a one-word
 * query collapses the whole result set to a single alphabetical list.
 */
export function rankLegacyKeyword(tokens: string[]): RankedProduct[] {
  return finish(candidates(tokens).map(({ product, hits }) => ({ product, score: hits })));
}

// ---------------------------------------------------------------------------
// weighted-relevance (candidate A)
// ---------------------------------------------------------------------------

const FIELD_WEIGHT = { name: 3, tag: 2, body: 1 } as const;
const TAG_EXACT_BONUS = 2.5;
const PRICE_PROXIMITY_WEIGHT = 2;
const RECENCY_WEIGHT = 3;
/** Recency half-life-ish constant: a year-old release keeps ~1/e of the boost. */
const RECENCY_DECAY_DAYS = 365;

function fieldWeightedScore(text: ProductText, tokens: string[]): number {
  let score = 0;
  for (const token of tokens) {
    if (text.name.includes(token)) score += FIELD_WEIGHT.name;
    if (text.tags.some((tag) => tag.includes(token))) score += FIELD_WEIGHT.tag;
    if (text.body.includes(token)) score += FIELD_WEIGHT.body;
  }
  return score;
}

/** Query tokens that are an exact tag, not just a substring of one. */
function exactTagOverlap(text: ProductText, tokens: string[]): number {
  const tagSet = new Set(text.tags);
  return tokens.reduce((n, token) => (tagSet.has(token) ? n + 1 : n), 0);
}

function recencyBoost(releaseDate: string, now: number): number {
  const released = Date.parse(releaseDate);
  if (Number.isNaN(released)) return 0;
  // An unreleased drop is as new as it gets, so clamp the future to zero days.
  const days = Math.max(0, (now - released) / 86_400_000);
  return Math.exp(-days / RECENCY_DECAY_DAYS);
}

/**
 * Keyword match, then boosted by three real signals off the `Product` shape:
 *
 *  - **Field weighting + tag overlap** — a hit in the name outranks a hit in the
 *    description, and a token that *is* one of the product's tags outranks a
 *    token that merely appears inside one.
 *  - **Price proximity** — closeness to the median price of the matched set, so
 *    a query's mainstream-priced results float above its outliers.
 *  - **Recency** — exponential decay on `releaseDate`, so current drops beat
 *    2025 carryover.
 */
export function rankWeightedRelevance(tokens: string[], now = Date.now()): RankedProduct[] {
  const matched = candidates(tokens);
  if (matched.length === 0) return [];

  const prices = matched.map(({ product }) => product.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  // Spread of the matched set, not the catalog: proximity should mean "typical
  // for this query". Guard the single-result case against a divide by zero.
  const spread = Math.max(1, prices[prices.length - 1] - prices[0]);

  return finish(
    matched.map(({ product }) => {
      const text = textOf(product);
      const proximity = 1 - Math.min(1, Math.abs(product.price - median) / spread);
      const score =
        fieldWeightedScore(text, tokens) +
        exactTagOverlap(text, tokens) * TAG_EXACT_BONUS +
        proximity * PRICE_PROXIMITY_WEIGHT +
        recencyBoost(product.releaseDate, now) * RECENCY_WEIGHT;
      return { product, score };
    }),
  );
}

// ---------------------------------------------------------------------------
// personalized-affinity (candidate B)
// ---------------------------------------------------------------------------

const CATEGORY_MATCH_BONUS = 6;
const CATEGORY_TAG_BONUS = 2;
const VIP_EXCLUSIVE_BONUS = 4;
const VIP_LIMITED_BONUS = 2;
const STANDARD_SAVINGS_WEIGHT = 2;
const GUEST_GENERAL_RELEASE_BONUS = 1.5;

const LIMITED_TAGS = new Set(['limited', 'early-access', 'prototype', 'collab']);

/**
 * Keyword match, then boosted by who is asking rather than by the query.
 *
 * Deliberately *not* field-weighted — the base stays the flat token count from
 * the control arm so the only thing separating this from `legacy-keyword` is
 * personalization, which is what the experiment is actually testing:
 *
 *  - `preferredCategory` match on the product's category (or its tags).
 *  - `memberTier`: VIP gets a further push toward `isDropExclusive` items and
 *    limited/collab tags; Standard gets a nudge toward the biggest
 *    price → memberPrice savings; a guest, who cannot see locked drops at all,
 *    gets general-release items first.
 *
 * A guest with no attributes degrades to the control arm's ordering, which is
 * the honest outcome — there is nothing to personalize on.
 */
export function rankPersonalizedAffinity(
  tokens: string[],
  requester: SearchRequester,
): RankedProduct[] {
  const preferred = requester.preferredCategory ? normalize(requester.preferredCategory) : undefined;
  const tier = requester.memberTier ? normalize(requester.memberTier) : 'guest';

  return finish(
    candidates(tokens).map(({ product, hits }) => {
      const text = textOf(product);
      let score = hits;

      if (preferred) {
        if (normalize(product.category) === preferred) score += CATEGORY_MATCH_BONUS;
        else if (text.tags.includes(preferred)) score += CATEGORY_TAG_BONUS;
      }

      if (tier === 'vip') {
        if (product.isDropExclusive) score += VIP_EXCLUSIVE_BONUS;
        if (text.tags.some((tag) => LIMITED_TAGS.has(tag))) score += VIP_LIMITED_BONUS;
      } else if (tier === 'standard') {
        // Savings as a fraction of list price, so a $30 saving on a $130 shoe
        // outranks the same $30 off a $285 drop.
        const savings = Math.max(0, product.price - product.memberPrice) / Math.max(1, product.price);
        score += savings * STANDARD_SAVINGS_WEIGHT;
      } else if (!product.isDropExclusive) {
        score += GUEST_GENERAL_RELEASE_BONUS;
      }

      return { product, score };
    }),
  );
}

// ---------------------------------------------------------------------------
// Entitlement
// ---------------------------------------------------------------------------

/**
 * A result plus whether the requester may actually buy it. `view-only` results
 * are returned like any other hit — they just can't be purchased — so the
 * frontend renders the blocked-CTA treatment instead of guessing.
 */
export interface EntitledProduct extends RankedProduct {
  _purchasable: boolean;
}

/**
 * Apply drop entitlement to a ranked list, after ranking and before counting.
 *
 * Three states, three outcomes:
 *   - `hidden`      → drop-exclusive hits are dropped from the list entirely
 *   - `view-only`   → they stay, flagged `_purchasable: false`
 *   - `full-access` → they stay, purchasable
 *
 * Non-exclusive products are untouched in all three states.
 *
 * Gating is on `isDropExclusive`, never on tag text — see src/lib/dropAccess.ts
 * for why (the old tag match missed `volt-1`).
 */
export function applyDropAccessState(
  list: RankedProduct[],
  state: DropAccessState,
): EntitledProduct[] {
  const out: EntitledProduct[] = [];
  for (const product of list) {
    if (!isDropProductVisible(product, state)) continue;
    out.push({ ...product, _purchasable: isDropProductPurchasable(product, state) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export interface SearchOutcome {
  results: RankedProduct[];
  /** The variation that actually ranked these results. */
  served: SearchVariation;
}

/**
 * Run `query` through the ranking function for `variation`. An empty or
 * all-punctuation query returns nothing rather than the whole catalog — the
 * caller decides whether that counts as a zero-result search.
 */
export function runSearch(
  query: string,
  variation: SearchVariation,
  requester: SearchRequester,
): SearchOutcome {
  const tokens = tokenize(query ?? '');
  if (tokens.length === 0) return { results: [], served: variation };

  switch (variation) {
    case 'weighted-relevance':
      return { results: rankWeightedRelevance(tokens), served: variation };
    case 'personalized-affinity':
      return { results: rankPersonalizedAffinity(tokens, requester), served: variation };
    case 'legacy-keyword':
    default:
      return { results: rankLegacyKeyword(tokens), served: 'legacy-keyword' };
  }
}

/** Catalog size the search actually covers. Used by the route's health output. */
export const SEARCHABLE_COUNT = SEARCHABLE.length;
