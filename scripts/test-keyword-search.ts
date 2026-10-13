/**
 * Tests for the AI search lab's keyword fallback. No LaunchDarkly, no network.
 *
 *   npx tsx scripts/test-keyword-search.ts
 *
 * Exits non-zero on any failure.
 */
import { keywordSearch, tokenizeQuery } from '../server/lab/keywordSearch';
import type { Pack } from '../src/packs/types';

/** Local fixture pack: these tests must not depend on the real ak-park data. */
const fixturePack: Pack = {
  key: 'fixture',
  displayName: 'PLACEHOLDER Animal Park',
  domainDescription: 'PLACEHOLDER: a test fixture pack.',
  items: [
    {
      id: 'placeholder-savanna-ride',
      name: 'PLACEHOLDER Savanna Ride',
      kind: 'attraction',
      area: 'PLACEHOLDER Area A',
      aliases: ['placeholder truck ride'],
      species: ['giraffe', 'zebra'],
      description: 'PLACEHOLDER: an open-vehicle ride through a grassland habitat.',
      attributes: ['outdoor', 'kid-friendly'],
      hoursNote: 'PLACEHOLDER: runs during park hours.',
    },
    {
      id: 'placeholder-forest-trail',
      name: 'PLACEHOLDER Forest Trail',
      kind: 'trail',
      area: 'PLACEHOLDER Area B',
      aliases: [],
      species: ['gorilla'],
      description: 'PLACEHOLDER: a self-guided walking path past a primate habitat.',
      attributes: ['outdoor', 'walking'],
      hoursNote: 'PLACEHOLDER: closes one hour before the park.',
    },
    {
      id: 'placeholder-grill',
      name: 'PLACEHOLDER Grill',
      kind: 'dining',
      area: 'PLACEHOLDER Area A',
      aliases: ['placeholder bbq'],
      species: [],
      description: 'PLACEHOLDER: a counter-service spot serving grilled food.',
      attributes: ['indoor-seating', 'quick-service'],
      hoursNote: 'PLACEHOLDER: lunch and dinner.',
    },
  ],
  queries: [],
};

interface Case {
  name: string;
  query: string;
  limit?: number;
  /** Expected ids, in order. */
  expected: string[];
}

const CASES: Case[] = [
  { name: 'name match', query: 'savanna', expected: ['placeholder-savanna-ride'] },
  { name: 'alias match', query: 'bbq', expected: ['placeholder-grill'] },
  { name: 'species match (plural folded)', query: 'gorillas', expected: ['placeholder-forest-trail'] },
  { name: 'no match', query: 'submarine', expected: [] },
  { name: 'punctuation and casing', query: 'SAVANNA!!! Ride?', expected: ['placeholder-savanna-ride'] },
  { name: 'stopword-only input', query: 'where is the', expected: [] },
  {
    // Grill and Savanna Ride both score 8 on "placeholder"; the tie breaks by
    // name, and the limit drops the lower-scoring Forest Trail.
    name: 'score order, name tie-break, limit',
    query: 'placeholder',
    limit: 2,
    expected: ['placeholder-grill', 'placeholder-savanna-ride'],
  },
];

let failures = 0;
for (const c of CASES) {
  const actual = keywordSearch(fixturePack, c.query, c.limit).map((hit) => hit.item.id);
  const pass = JSON.stringify(actual) === JSON.stringify(c.expected);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.name}  (${JSON.stringify(c.query)})`);
  if (!pass) {
    console.log(`        expected ${JSON.stringify(c.expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

// Checked on the tokenizer directly: no pack item contains "this" or "does",
// so a keywordSearch case would pass even with the bug.
const TOKEN_CASES: { name: string; query: string; expected: string[] }[] = [
  // "this" and "does" end in s; they must be dropped before plural folding.
  { name: 'tokens: stopwords ending in s', query: 'does this ride have gorillas', expected: ['ride', 'have', 'gorilla'] },
];
for (const c of TOKEN_CASES) {
  const actual = tokenizeQuery(c.query);
  const pass = JSON.stringify(actual) === JSON.stringify(c.expected);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.name}  (${JSON.stringify(c.query)})`);
  if (!pass) {
    console.log(`        expected ${JSON.stringify(c.expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

// Text normalization: accents, typographic apostrophes, and dashes. A separate
// fixture pack so the cases above keep their exact expected lists. Non-ASCII
// characters are written as \u escapes so the test data is unambiguous.
function normItem(id: string, name: string, species: string[] = []): Pack['items'][number] {
  return {
    id,
    name,
    kind: 'animal-habitat',
    area: 'PLACEHOLDER Area C',
    aliases: [],
    species,
    description: 'PLACEHOLDER: a normalization test item.',
    attributes: [],
    hoursNote: 'PLACEHOLDER: always open.',
  };
}

const normPack: Pack = {
  key: 'fixture-norm',
  displayName: 'PLACEHOLDER Normalization Park',
  domainDescription: 'PLACEHOLDER: a text-normalization test fixture pack.',
  items: [
    normItem('norm-grevy', "PLACEHOLDER Grévy's Zebra Overlook", ["Grévy's zebra"]),
    normItem('norm-galapagos', 'PLACEHOLDER Galápagos Tortoise Yard', ['Galápagos tortoise']),
    normItem('norm-en-dash', 'PLACEHOLDER Kilimanjaro–Okavango Crossing'),
    normItem('norm-curly', 'PLACEHOLDER Rafiki’s Station'),
    normItem('norm-straight', "PLACEHOLDER Flame Tree's Grill"),
  ],
  queries: [],
};

// Possessive queries carry a stray "s" token that matches every other
// possessive name, so those cases check the top hit only (limit 1).
const NORM_CASES: Case[] = [
  { name: 'accent: query without apostrophe', query: 'grevys zebra', expected: ['norm-grevy'] },
  { name: 'accent: query with apostrophe', query: "Grevy's zebra", limit: 1, expected: ['norm-grevy'] },
  { name: 'accent: single word', query: 'galapagos', expected: ['norm-galapagos'] },
  { name: 'en dash: query with hyphen', query: 'kilimanjaro-okavango', expected: ['norm-en-dash'] },
  { name: 'en dash: query omits it', query: 'kilimanjaro okavango', expected: ['norm-en-dash'] },
  { name: 'curly apostrophe in name, straight in query', query: "rafiki's station", limit: 1, expected: ['norm-curly'] },
  { name: 'straight apostrophe in name, curly in query', query: 'flame tree’s grill', limit: 1, expected: ['norm-straight'] },
];
for (const c of NORM_CASES) {
  const actual = keywordSearch(normPack, c.query, c.limit).map((hit) => hit.item.id);
  const pass = JSON.stringify(actual) === JSON.stringify(c.expected);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.name}  (${JSON.stringify(c.query)})`);
  if (!pass) {
    console.log(`        expected ${JSON.stringify(c.expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

// No accents: tokens must match the pre-normalization pipeline exactly. The old
// pipeline's first step was lowercase + non-[a-z0-9] to space; text already
// cleaned that way passes through the new normalization untouched, so
// tokenizing it gives the old result to compare against.
const legacyClean = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
const asciiInputs = [
  ...CASES.map((c) => c.query),
  ...TOKEN_CASES.map((c) => c.query),
  ...fixturePack.items.flatMap((i) => [i.name, i.area, i.description, ...i.aliases, ...i.species, ...i.attributes]),
  "Can kids ride the Savanna-Ride? It's 3 o'clock!",
];
let asciiMismatches = 0;
for (const text of asciiInputs) {
  if (JSON.stringify(tokenizeQuery(text)) !== JSON.stringify(tokenizeQuery(legacyClean(text)))) {
    asciiMismatches += 1;
    console.log(`        token mismatch on ${JSON.stringify(text)}`);
  }
}
{
  const pass = asciiMismatches === 0;
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  no accents: tokens identical to pre-normalization pipeline  (${asciiInputs.length} inputs)`);
}
{
  const c: Case = { name: 'no accents: search unchanged', query: 'kid-friendly savanna ride', expected: ['placeholder-savanna-ride'] };
  const actual = keywordSearch(fixturePack, c.query, c.limit).map((hit) => hit.item.id);
  const pass = JSON.stringify(actual) === JSON.stringify(c.expected);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.name}  (${JSON.stringify(c.query)})`);
}

const total = CASES.length + TOKEN_CASES.length + NORM_CASES.length + 2;
console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exitCode = 1;
