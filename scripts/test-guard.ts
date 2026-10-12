/**
 * Tests for the search lab's in-memory rate limiter and AI budget. No
 * LaunchDarkly, no network; time comes from an injected clock.
 *
 *   npx tsx scripts/test-guard.ts
 *
 * Exits non-zero on any failure.
 */
import {
  DEFAULT_GUARD_CONFIG,
  createAiBudget,
  createRateLimiter,
  getClientIp,
  readGuardConfig,
} from '../server/lab/guard';

let failures = 0;
let passes = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passes++;
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}\n      expected ${e}\n      got      ${a}`);
  }
}

function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

const MIN = 60 * 1000;
const WINDOW = 10 * MIN;
const ALLOWED = { allowed: true, retryAfterSeconds: 0 };

// --- Under, at and over the limit ---
{
  const clock = fakeClock();
  const limiter = createRateLimiter({ now: clock.now });
  check('1st of 3 allowed', limiter.allow('a', 3, WINDOW), ALLOWED);
  check('2nd of 3 allowed (under limit)', limiter.allow('a', 3, WINDOW), ALLOWED);
  check('3rd of 3 allowed (at limit)', limiter.allow('a', 3, WINDOW), ALLOWED);
  check('4th blocked (over limit)', limiter.allow('a', 3, WINDOW).allowed, false);
  check('other key unaffected', limiter.allow('b', 3, WINDOW), ALLOWED);
}

// --- retryAfterSeconds and window expiry ---
{
  const clock = fakeClock();
  const limiter = createRateLimiter({ now: clock.now });
  limiter.allow('a', 2, WINDOW); // t=0
  clock.advance(2 * MIN);
  limiter.allow('a', 2, WINDOW); // t=2m
  clock.advance(MIN); // t=3m
  check('blocked retryAfter = until oldest hit expires', limiter.allow('a', 2, WINDOW), {
    allowed: false,
    retryAfterSeconds: 7 * 60,
  });
  clock.advance(7 * MIN - 500); // 0.5s before the first hit expires
  check('retryAfter rounds up to at least 1', limiter.allow('a', 2, WINDOW), {
    allowed: false,
    retryAfterSeconds: 1,
  });
  clock.advance(500); // first hit expires exactly now
  check('allowed once oldest hit leaves the window', limiter.allow('a', 2, WINDOW), ALLOWED);
  check('blocked again (sliding, not fixed, window)', limiter.allow('a', 2, WINDOW).allowed, false);
  clock.advance(WINDOW);
  check('fully reset after a full window', limiter.allow('a', 2, WINDOW), ALLOWED);
}

// --- Blocked requests do not extend the block ---
{
  const clock = fakeClock();
  const limiter = createRateLimiter({ now: clock.now });
  limiter.allow('a', 1, WINDOW);
  for (let i = 0; i < 5; i++) {
    clock.advance(MIN);
    limiter.allow('a', 1, WINDOW);
  }
  clock.advance(5 * MIN); // 10 minutes after the only allowed hit
  check('rejected hits are not counted', limiter.allow('a', 1, WINDOW), ALLOWED);
}

// --- Map size cap ---
{
  const clock = fakeClock();
  const limiter = createRateLimiter({ now: clock.now, maxKeys: 3 });
  limiter.allow('k1', 1, WINDOW);
  limiter.allow('k2', 1, WINDOW);
  limiter.allow('k3', 1, WINDOW);
  check('map holds up to the cap', limiter.size(), 3);
  limiter.allow('k1', 1, WINDOW); // touch k1 so k2 is least recently used
  limiter.allow('k4', 1, WINDOW);
  check('map never exceeds the cap', limiter.size(), 3);
  check('least recently used key was evicted (k2 is fresh again)', limiter.allow('k2', 1, WINDOW), ALLOWED);
  check('recently used key kept its count (k1 still blocked)', limiter.allow('k1', 1, WINDOW).allowed, false);

  clock.advance(WINDOW);
  limiter.allow('k5', 1, WINDOW);
  check('expired keys swept when full', limiter.size(), 1);

  const big = createRateLimiter({ now: clock.now, maxKeys: 100 });
  for (let i = 0; i < 1000; i++) big.allow(`ip-${i}`, 5, WINDOW);
  check('1000 distinct keys stay within a cap of 100', big.size(), 100);

  const longKeys = createRateLimiter({ now: clock.now });
  longKeys.allow('x'.repeat(10_000), 1, WINDOW);
  check(
    'very long keys are truncated (share one bucket)',
    longKeys.allow('x'.repeat(20_000), 1, WINDOW).allowed,
    false,
  );
}

// --- Hourly AI budget ---
{
  const clock = fakeClock();
  const budget = createAiBudget(3, { now: clock.now });
  check('budget: 1st call taken', budget.take(), true);
  clock.advance(10 * MIN);
  check('budget: 2nd call taken', budget.take(), true);
  check('budget: 3rd call taken', budget.take(), true);
  check('budget: exhausted', budget.take(), false);
  clock.advance(49 * MIN); // 59 min after the first call
  check('budget: still exhausted inside the hour', budget.take(), false);
  clock.advance(MIN); // first call is now an hour old
  check('budget: recovers one call after an hour', budget.take(), true);
  check('budget: then exhausted again', budget.take(), false);
  clock.advance(60 * MIN);
  check('budget: fully recovered after another hour', [budget.take(), budget.take(), budget.take(), budget.take()], [
    true,
    true,
    true,
    false,
  ]);
}

// --- Env config ---
{
  check('empty env uses defaults', readGuardConfig({}), DEFAULT_GUARD_CONFIG);
  check(
    'valid values are used',
    readGuardConfig({
      SEARCH_LAB_RATE_LIMIT_PER_IP: '5',
      SEARCH_LAB_RATE_LIMIT_PER_SESSION: '4',
      SEARCH_LAB_CLICK_LIMIT_PER_IP: '3',
      SEARCH_LAB_AI_CALLS_PER_HOUR: ' 1 ',
    }),
    { searchPerIp: 5, searchPerSession: 4, clickPerIp: 3, aiCallsPerHour: 1 },
  );
  for (const bad of ['', ' ', '0', '-5', '1.5', 'abc', '10abc', '1e3', 'Infinity', 'NaN', '99999999999999999999']) {
    check(
      `invalid value ${JSON.stringify(bad)} falls back to defaults`,
      readGuardConfig({
        SEARCH_LAB_RATE_LIMIT_PER_IP: bad,
        SEARCH_LAB_RATE_LIMIT_PER_SESSION: bad,
        SEARCH_LAB_CLICK_LIMIT_PER_IP: bad,
        SEARCH_LAB_AI_CALLS_PER_HOUR: bad,
      }),
      DEFAULT_GUARD_CONFIG,
    );
  }
}

// --- Client IP helper ---
{
  check('uses req.ip', getClientIp({ ip: '1.2.3.4', headers: { 'x-forwarded-for': '9.9.9.9' } }), '1.2.3.4');
  check(
    'falls back to first x-forwarded-for value',
    getClientIp({ ip: undefined, headers: { 'x-forwarded-for': ' 5.6.7.8 , 10.0.0.1' } }),
    '5.6.7.8',
  );
  check(
    'handles x-forwarded-for as an array',
    getClientIp({ ip: undefined, headers: { 'x-forwarded-for': ['5.6.7.8, 10.0.0.1', '1.1.1.1'] } as never }),
    '5.6.7.8',
  );
  check('empty req.ip falls through', getClientIp({ ip: '', headers: { 'x-forwarded-for': '5.6.7.8' } }), '5.6.7.8');
  check('blank x-forwarded-for gives unknown', getClientIp({ ip: undefined, headers: { 'x-forwarded-for': ' ' } }), 'unknown');
  check('nothing gives unknown', getClientIp({ ip: undefined, headers: {} }), 'unknown');
}

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
