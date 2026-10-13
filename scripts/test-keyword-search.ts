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

const total = CASES.length + TOKEN_CASES.length;
console.log(`\n${total - failures}/${total} passed`);
if (failures > 0) process.exitCode = 1;
