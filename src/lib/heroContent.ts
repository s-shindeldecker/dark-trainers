/**
 * Contentful-driven Hero content resolution for the `hero-content-experiment` flag.
 *
 * Architecture (LaunchDarkly x Contentful integration):
 *  - LD resolves the flag client-side (see useFeatureFlag) and returns a variation
 *    value string: 'control' | 'benefit-led' | 'drive-vip-signup'.
 *  - Contentful holds a single `launchDarklyFeatureFlag` entry (key =
 *    'hero-content-experiment') whose `meta` field maps each variation value to a
 *    `heroBanner` entry id. All targeting stays in LD; Contentful only supplies content.
 *
 * Resolution steps: fetch the flag entry's `meta` map (cached), look up the entry id
 * for the active variation, then fetch that `heroBanner` entry and return its fields.
 *
 * Fallback: any failure (network, bad token, missing mapping, missing entry) returns
 * `null`, signalling the Hero component to render its static built-in content rather
 * than breaking. This is live homepage content — a Contentful hiccup degrades gracefully.
 */

const SPACE_ID = import.meta.env.VITE_CONTENTFUL_SPACE_ID as string | undefined;
const CDA_TOKEN = import.meta.env.VITE_CONTENTFUL_CDA_TOKEN as string | undefined;
const ENVIRONMENT = (import.meta.env.VITE_CONTENTFUL_ENVIRONMENT as string | undefined) || 'master';

const FLAG_KEY = 'hero-content-experiment';
const FLAG_CONTENT_TYPE = 'launchDarklyFeatureFlag';

/** Resolved Hero fields the component renders. */
export interface HeroContent {
  headline: string;
  subhead: string;
  ctaText: string;
  /** Relative in-app path, e.g. '/products' | '/signup'. Routed via react-router <Link>. */
  ctaUrl: string;
  /** Absolute image URL (https). Empty string when the entry has no background image. */
  backgroundImage: string;
}

type VariationMeta = Record<string, string>;

// Minimal shapes for the slices of the Contentful CDA response this module reads.
interface CdaAsset {
  sys: { id: string };
  fields?: { file?: { url?: string } };
}
interface CdaEntryFields {
  meta?: unknown;
  headline?: string;
  subhead?: string;
  ctaText?: string;
  ctaUrl?: string;
  backgroundImage?: string | { sys?: { id?: string } };
}
interface CdaEntry {
  sys: { id: string };
  fields?: CdaEntryFields;
}
interface CdaResponse {
  items?: CdaEntry[];
  includes?: { Asset?: CdaAsset[] };
}

function cdaBase(): string | null {
  if (!SPACE_ID || !CDA_TOKEN) return null;
  return `https://cdn.contentful.com/spaces/${SPACE_ID}/environments/${ENVIRONMENT}`;
}

async function cdaFetch(path: string): Promise<CdaResponse> {
  const base = cdaBase();
  if (!base) throw new Error('Contentful env vars missing');
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${CDA_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Contentful CDA ${res.status}`);
  return res.json() as Promise<CdaResponse>;
}

// The flag->entry-id mapping changes rarely; cache it after the first successful
// fetch so we don't double the CDA calls on every Hero mount. Only successful
// results are cached — a transient failure stays retryable on the next mount.
let metaCache: VariationMeta | null = null;

async function getVariationMeta(): Promise<VariationMeta | null> {
  if (metaCache) return metaCache;
  const data = await cdaFetch(
    `/entries?content_type=${FLAG_CONTENT_TYPE}&fields.key=${FLAG_KEY}&limit=1`,
  );
  const meta = data?.items?.[0]?.fields?.meta;
  if (meta && typeof meta === 'object') {
    metaCache = meta as VariationMeta;
    return metaCache;
  }
  return null;
}

/** Pull the background image URL off a heroBanner entry, resolving a linked Asset. */
function resolveBackgroundImage(
  fields: CdaEntryFields | undefined,
  includes: CdaResponse['includes'],
): string {
  const bg = fields?.backgroundImage;
  // Already a plain URL string.
  if (typeof bg === 'string') return bg;
  // Linked Asset — resolve via the response's includes.Asset collection.
  const assetId = bg?.sys?.id;
  if (assetId && includes?.Asset) {
    const asset = includes.Asset.find((a) => a.sys.id === assetId);
    const url = asset?.fields?.file?.url;
    if (typeof url === 'string') return url.startsWith('//') ? `https:${url}` : url;
  }
  return '';
}

async function fetchHeroBanner(entryId: string): Promise<HeroContent | null> {
  // Use the collection endpoint with include=1 so the linked backgroundImage Asset
  // comes back in `includes.Asset` (a single-entry GET does not resolve links).
  const data = await cdaFetch(`/entries?sys.id=${entryId}&include=1&limit=1`);
  const item = data?.items?.[0];
  if (!item?.fields) return null;
  const f = item.fields;
  return {
    headline: f.headline ?? '',
    subhead: f.subhead ?? '',
    ctaText: f.ctaText ?? '',
    ctaUrl: f.ctaUrl ?? '',
    backgroundImage: resolveBackgroundImage(f, data.includes),
  };
}

/**
 * Resolve Hero content for the given flag variation value.
 * Returns `null` to signal the caller should fall back to static built-in content.
 */
export async function resolveHeroContent(variationValue: string): Promise<HeroContent | null> {
  try {
    const meta = await getVariationMeta();
    const entryId = meta?.[variationValue];
    if (!entryId) return null;
    return await fetchHeroBanner(entryId);
  } catch (error) {
    console.error('[Hero] Contentful resolution failed, using static fallback:', error);
    return null;
  }
}
