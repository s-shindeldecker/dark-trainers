/**
 * Tests for the AI search lab's output validation. No LaunchDarkly, no network.
 *
 *   npx tsx scripts/test-ai-validate.ts
 *
 * Exits non-zero on any failure.
 */
import { akPark } from '../src/packs/ak-park';
import { validateAiResult, type ValidatedAiResult } from '../server/lab/validateAiResult';

interface Case {
  name: string;
  raw: unknown;
  expected: ValidatedAiResult;
}

const GRILL = { ids: ['placeholder-grill'], message: null };
const GRILL_OK: ValidatedAiResult = { ok: true, ids: ['placeholder-grill'], message: null, invalidIdCount: 0 };
const GRILL_JSON = JSON.stringify(GRILL);

const CASES: Case[] = [
  // Object responses (outputFormat set in LaunchDarkly).
  {
    name: 'valid result',
    raw: { ids: ['placeholder-grill', 'placeholder-savanna-ride'], message: null },
    expected: { ok: true, ids: ['placeholder-grill', 'placeholder-savanna-ride'], message: null, invalidIdCount: 0 },
  },
  {
    name: 'unknown ids dropped and counted',
    raw: { ids: ['made-up', 'placeholder-grill', 'also-made-up'], message: 'Here you go' },
    expected: { ok: true, ids: ['placeholder-grill'], message: 'Here you go', invalidIdCount: 2 },
  },
  {
    name: 'empty ids with message',
    raw: { ids: [], message: 'There is no submarine ride here.' },
    expected: { ok: true, ids: [], message: 'There is no submarine ride here.', invalidIdCount: 0 },
  },

  {
    name: 'empty message becomes null',
    raw: { ids: ['placeholder-grill'], message: '' },
    expected: GRILL_OK,
  },
  {
    name: 'blank message becomes null',
    raw: { ids: ['placeholder-grill'], message: '   ' },
    expected: GRILL_OK,
  },

  // String responses (no outputFormat).
  { name: 'valid JSON string', raw: GRILL_JSON, expected: GRILL_OK },
  { name: 'string wrapped in ```json fences', raw: '```json\n' + GRILL_JSON + '\n```', expected: GRILL_OK },
  { name: 'string wrapped in plain ``` fences', raw: '```\n' + GRILL_JSON + '\n```', expected: GRILL_OK },
  { name: 'surrounding whitespace trimmed', raw: '\n  ' + GRILL_JSON + '  \n', expected: GRILL_OK },
  {
    name: 'text before the JSON (invalid)',
    raw: 'Here are the results: ' + GRILL_JSON,
    expected: { ok: false, reason: 'extra-text-around-json' },
  },
  { name: 'empty string', raw: '', expected: { ok: false, reason: 'string-empty' } },
  { name: 'fences around nothing', raw: '```json\n```', expected: { ok: false, reason: 'string-empty' } },
  { name: 'invalid JSON string', raw: '{"ids": ["placeholder-grill"', expected: { ok: false, reason: 'string-unparseable' } },
  { name: 'prose string', raw: 'Sorry, I can only answer in prose.', expected: { ok: false, reason: 'string-unparseable' } },

  // One case per remaining reason.
  { name: 'not-an-object: null', raw: null, expected: { ok: false, reason: 'not-an-object' } },
  { name: 'not-an-object: array', raw: ['placeholder-grill'], expected: { ok: false, reason: 'not-an-object' } },
  { name: 'not-an-object: JSON string of a number', raw: '42', expected: { ok: false, reason: 'not-an-object' } },
  { name: 'ids-not-array', raw: { ids: 'placeholder-grill', message: null }, expected: { ok: false, reason: 'ids-not-array' } },
  { name: 'ids-contains-non-string', raw: { ids: [42], message: null }, expected: { ok: false, reason: 'ids-contains-non-string' } },
  { name: 'message-not-string: missing', raw: { ids: [] }, expected: { ok: false, reason: 'message-not-string' } },
  { name: 'message-not-string: number', raw: { ids: [], message: 7 }, expected: { ok: false, reason: 'message-not-string' } },
];

let failures = 0;
for (const c of CASES) {
  const actual = validateAiResult(akPark, c.raw);
  const pass = JSON.stringify(actual) === JSON.stringify(c.expected);
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${c.name}`);
  if (!pass) {
    console.log(`        expected ${JSON.stringify(c.expected)}`);
    console.log(`        actual   ${JSON.stringify(actual)}`);
  }
}

console.log(`\n${CASES.length - failures}/${CASES.length} passed`);
if (failures > 0) process.exitCode = 1;
