/**
 * Keyword search over a content pack — the AI search lab's fallback path.
 *
 * Pure function over `Pack` data: no LaunchDarkly, no network, and no shared
 * code with the storefront search (server/search/ranking.ts). Kept that way so
 * the lab can be evaluated without disturbing the live ranking experiment.
 */
import type { Pack, PackItem } from '../../src/packs/types.js';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
  'is', 'are', 'was', 'be', 'do', 'does', 'i', 'me', 'my', 'we', 'you', 'it',
  'this', 'that', 'there', 'can', 'where', 'what', 'when', 'which', 'who',
  'how', 'any', 'some',
]);

const FIELD_WEIGHT = {
  name: 3,
  aliases: 3,
  species: 2,
  area: 1,
  attributes: 1,
  description: 1,
} as const;

type Field = keyof typeof FIELD_WEIGHT;

/**
 * Naive plural folding, applied to both query and item text so "gorillas"
 * matches "gorilla". Words of 3 letters or fewer are left alone ("bus", "gas").
 */
function stem(token: string): string {
  return token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;
}

/** Lowercase, replace punctuation with spaces, split on whitespace. */
function rawWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** `rawWords` with plurals folded. */
function words(text: string): string[] {
  return rawWords(text).map(stem);
}

/**
 * Query tokens: stopwords removed *before* plural folding (otherwise "this"
 * and "does" fold to "thi" and "doe" and slip past the list), then deduped.
 */
export function tokenizeQuery(query: string): string[] {
  return [...new Set(rawWords(query).filter((w) => !STOPWORDS.has(w)).map(stem))];
}

function fieldWords(item: PackItem): Record<Field, Set<string>> {
  return {
    name: new Set(words(item.name)),
    aliases: new Set(item.aliases.flatMap(words)),
    species: new Set(item.species.flatMap(words)),
    area: new Set(words(item.area)),
    attributes: new Set(item.attributes.flatMap(words)),
    description: new Set(words(item.description)),
  };
}

/**
 * Each query token counts at most once per field: a token found in both the
 * name and the description scores 3 + 1, but repeating it in the description
 * does not score again.
 */
function scoreItem(item: PackItem, tokens: string[]): number {
  const fields = fieldWords(item);
  let score = 0;
  for (const token of tokens) {
    for (const field of Object.keys(FIELD_WEIGHT) as Field[]) {
      if (fields[field].has(token)) score += FIELD_WEIGHT[field];
    }
  }
  return score;
}

export interface KeywordHit {
  item: PackItem;
  score: number;
}

export function keywordSearch(pack: Pack, query: string, limit = 8): KeywordHit[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  return pack.items
    .map((item) => ({ item, score: scoreItem(item, tokens) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit);
}
