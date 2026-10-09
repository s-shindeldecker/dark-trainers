import type { Pack } from './types';

/**
 * Structural checks for a pack. Returns a list of human-readable problems;
 * an empty list means the pack is valid.
 */
export function validatePack(pack: Pack): string[] {
  const problems: string[] = [];

  const itemIds = new Set<string>();
  for (const item of pack.items) {
    if (itemIds.has(item.id)) problems.push(`Duplicate item id: "${item.id}"`);
    itemIds.add(item.id);
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
