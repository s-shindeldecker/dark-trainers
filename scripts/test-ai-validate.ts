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

const CASES: Case[] = [
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
  { name: 'wrong shape: ids not an array', raw: { ids: 'placeholder-grill', message: null }, expected: { ok: false } },
  { name: 'wrong shape: non-string id', raw: { ids: [42], message: null }, expected: { ok: false } },
  { name: 'wrong shape: message missing', raw: { ids: [] }, expected: { ok: false } },
  { name: 'wrong shape: array', raw: ['placeholder-grill'], expected: { ok: false } },
  {
    name: 'string response containing JSON',
    raw: JSON.stringify({ ids: ['placeholder-grill'], message: null }),
    expected: { ok: true, ids: ['placeholder-grill'], message: null, invalidIdCount: 0 },
  },
  { name: 'string response, not JSON', raw: 'Sorry, I can only answer in prose.', expected: { ok: false } },
  { name: 'null response', raw: null, expected: { ok: false } },
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
