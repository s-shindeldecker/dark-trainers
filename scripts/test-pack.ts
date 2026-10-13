/**
 * Report on the ak-park pack: validation, lint warnings, counts, prompt size,
 * and a keyword-search recall check. No LaunchDarkly, no network.
 *
 *   npx tsx scripts/test-pack.ts
 *
 * Exits non-zero only on validation errors; everything else is informational.
 */
import { akPark } from '../src/packs/ak-park';
import { lintPack, validatePack } from '../src/packs/validate';
import { keywordSearch } from '../server/lab/keywordSearch';

const TOP_N = 8;

function countBy<T>(list: T[], key: (x: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const x of list) counts.set(key(x), (counts.get(key(x)) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}

function printCounts(title: string, rows: [string, number][]): void {
  console.log(`\n${title}`);
  for (const [label, n] of rows) console.log(`  ${label.padEnd(16)} ${n}`);
}

console.log(`Pack "${akPark.key}" (${akPark.displayName}): ${akPark.items.length} items, ${akPark.queries.length} queries`);

// --- Validation --------------------------------------------------------------

const problems = validatePack(akPark);
console.log(`\nValidation: ${problems.length === 0 ? 'OK' : `${problems.length} error(s)`}`);
for (const problem of problems) console.log(`  - ${problem}`);

const warnings = lintPack(akPark);
console.log(`\nLint: ${warnings.length} warning(s)`);
for (const warning of warnings) console.log(`  - ${warning}`);

// --- Counts ------------------------------------------------------------------

printCounts('Items by kind', countBy(akPark.items, (item) => item.kind));
printCounts('Queries by category', countBy(akPark.queries, (query) => query.category));
console.log(`\nHoldout queries: ${akPark.queries.filter((query) => query.holdout).length}`);

// --- Prompt size -------------------------------------------------------------

// Same compact fields server/lab/aiSearch.ts sends to the model.
const compactItems = akPark.items.map(
  ({ id, name, kind, area, aliases, species, attributes, hoursNote, description }) => ({
    id, name, kind, area, aliases, species, attributes, hoursNote, description,
  }),
);
const promptChars = JSON.stringify(compactItems).length;
console.log(`\nPrompt items JSON: ${promptChars} chars, ~${Math.round(promptChars / 4)} tokens (chars / 4)`);

// --- Keyword search recall ---------------------------------------------------

const evaluable = akPark.queries.filter((query) => !query.holdout && query.expectedItemIds.length > 0);
const recall = new Map<string, { hit: number; total: number; misses: string[] }>();
for (const query of evaluable) {
  const top = new Set(keywordSearch(akPark, query.text, TOP_N).map((hit) => hit.item.id));
  const found = query.expectedItemIds.some((id) => top.has(id));
  const row = recall.get(query.category) ?? { hit: 0, total: 0, misses: [] };
  row.total += 1;
  if (found) row.hit += 1;
  else row.misses.push(query.id);
  recall.set(query.category, row);
}

console.log(`\nKeyword search: an expected item in the top ${TOP_N} (non-holdout queries with expected ids)`);
for (const [category, row] of [...recall].sort(([a], [b]) => a.localeCompare(b))) {
  const misses = row.misses.length > 0 ? `  misses: ${row.misses.join(', ')}` : '';
  console.log(`  ${category.padEnd(16)} ${row.hit}/${row.total}${misses}`);
}
const hits = [...recall.values()].reduce((sum, row) => sum + row.hit, 0);
console.log(`  ${'total'.padEnd(16)} ${hits}/${evaluable.length}`);

if (problems.length > 0) process.exitCode = 1;
