import type { Pack, PackItemKind } from './types';

const ALLOWED_KINDS: readonly PackItemKind[] = [
  'attraction',
  'trail',
  'animal-habitat',
  'dining',
  'show',
  'service',
];

const DESCRIPTION_MIN_WORDS = 5;
const DESCRIPTION_MAX_WORDS = 35;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Structural checks for a pack. Returns a list of human-readable problems;
 * an empty list means the pack is valid.
 */
export function validatePack(pack: Pack): string[] {
  const problems: string[] = [];

  const itemIds = new Set<string>();
  const itemNames = new Set<string>();
  for (const item of pack.items) {
    if (itemIds.has(item.id)) problems.push(`Duplicate item id: "${item.id}"`);
    itemIds.add(item.id);

    const name = item.name.trim();
    if (name === '') problems.push(`Item "${item.id}" has an empty name`);
    else if (itemNames.has(name.toLowerCase())) problems.push(`Duplicate item name: "${name}"`);
    itemNames.add(name.toLowerCase());

    const area = item.area.trim();
    if (area === '' || area.toLowerCase() === 'tbd') {
      problems.push(`Item "${item.id}" has no area (${JSON.stringify(item.area)})`);
    }

    const words = wordCount(item.description);
    if (words < DESCRIPTION_MIN_WORDS || words > DESCRIPTION_MAX_WORDS) {
      problems.push(
        `Item "${item.id}" description has ${words} words (allowed ${DESCRIPTION_MIN_WORDS}-${DESCRIPTION_MAX_WORDS})`,
      );
    }

    if (!ALLOWED_KINDS.includes(item.kind)) {
      problems.push(`Item "${item.id}" has unknown kind "${item.kind}"`);
    }
  }

  const queryIds = new Set<string>();
  for (const query of pack.queries) {
    if (queryIds.has(query.id)) problems.push(`Duplicate query id: "${query.id}"`);
    queryIds.add(query.id);

    for (const expected of query.expectedItemIds) {
      if (!itemIds.has(expected)) {
        problems.push(`Query "${query.id}" expects unknown item id "${expected}"`);
      }
    }

    if (query.shouldDecline && query.expectedItemIds.length > 0) {
      problems.push(`Query "${query.id}" should decline but lists expected item ids`);
    }
    if (!query.shouldDecline && query.expectedItemIds.length === 0) {
      problems.push(`Query "${query.id}" does not decline but has no expected item ids`);
    }
  }

  return problems;
}

/** Text that tends to go stale: prices, wait times, and day-specific hours. */
const VOLATILE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: '$', pattern: /\$/ },
  { label: 'wait', pattern: /\bwait/i },
  { label: 'today', pattern: /\btoday\b/i },
  { label: 'tonight', pattern: /\btonight\b/i },
  { label: 'closes at', pattern: /\bcloses at\b/i },
  { label: 'opens at', pattern: /\bopens at\b/i },
];

/**
 * Softer checks than `validatePack`: things worth a look that do not make the
 * pack invalid. Returns human-readable warnings.
 */
export function lintPack(pack: Pack): string[] {
  const warnings: string[] = [];

  const nameOwner = new Map<string, string>();
  for (const item of pack.items) nameOwner.set(item.name.trim().toLowerCase(), item.id);

  const aliasOwners = new Map<string, string[]>();
  for (const item of pack.items) {
    for (const alias of new Set(item.aliases.map((a) => a.trim().toLowerCase()))) {
      aliasOwners.set(alias, [...(aliasOwners.get(alias) ?? []), item.id]);

      const owner = nameOwner.get(alias);
      if (owner && owner !== item.id) {
        warnings.push(`Item "${item.id}" alias "${alias}" is the name of item "${owner}"`);
      }
    }
  }
  for (const [alias, owners] of aliasOwners) {
    if (owners.length > 1) warnings.push(`Alias "${alias}" is used by ${owners.join(', ')}`);
  }

  for (const item of pack.items) {
    for (const [field, text] of [
      ['description', item.description],
      ['hoursNote', item.hoursNote],
    ] as const) {
      for (const { label, pattern } of VOLATILE_PATTERNS) {
        if (pattern.test(text)) {
          warnings.push(`Item "${item.id}" ${field} contains volatile-looking text "${label}"`);
        }
      }
    }
  }

  return warnings;
}
