/**
 * Validate the ak-park pack and print any problems.
 *
 *   npx tsx scripts/validate-pack.ts
 *
 * Exits non-zero when the pack has problems.
 */
import { akPark } from '../src/packs/ak-park';
import { validatePack } from '../src/packs/validate';

const problems = validatePack(akPark);

console.log(
  `Pack "${akPark.key}": ${akPark.items.length} items, ${akPark.queries.length} queries`,
);

if (problems.length === 0) {
  console.log('OK — no problems found.');
} else {
  console.log(`${problems.length} problem(s):`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exitCode = 1;
}
