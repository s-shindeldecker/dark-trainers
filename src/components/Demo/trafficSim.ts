/**
 * Pure helpers for the guarded-release traffic simulator (GuardedReleaseControls).
 *
 * Request building, regression-header selection, response parsing and stats all
 * live here, free of React and timers, so the hook only has to schedule sends.
 *
 * Simulated visitors come from a FIXED pool (`sim-user-0001` … `sim-user-<N>`),
 * not a fresh random key per visitor: a long run then touches at most N user
 * contexts and N session contexts in LaunchDarkly instead of thousands per hour.
 * A pool user's attributes and session key are derived from its index, so the
 * same synthetic user always looks — and buckets — the same.
 */

import type { MemberTier, ProductCategory } from '../../types/darktrainers';

/** Fixed, non-empty, product-style queries. */
export const SIM_QUERIES = [
  'runner',
  'trail',
  'boots',
  'tempo',
  'court',
  'retro',
  'racer',
  'high top',
  'canvas',
  'sprint',
] as const;

// ---------------------------------------------------------------------------
// Settings

export type SimSettings = {
  rps: number;
  maxInFlight: number;
  searchesPerVisitor: number;
  maxDurationMin: number;
  poolSize: number;
};

export type SimSettingKey = keyof SimSettings;

export const SIM_LIMITS: Record<SimSettingKey, { min: number; max: number; default: number }> = {
  rps: { min: 1, max: 20, default: 5 },
  maxInFlight: { min: 1, max: 32, default: 8 },
  searchesPerVisitor: { min: 1, max: 20, default: 2 },
  maxDurationMin: { min: 1, max: 240, default: 120 },
  poolSize: { min: 50, max: 10000, default: 2000 },
};

export const DEFAULT_SIM_SETTINGS: SimSettings = {
  rps: SIM_LIMITS.rps.default,
  maxInFlight: SIM_LIMITS.maxInFlight.default,
  searchesPerVisitor: SIM_LIMITS.searchesPerVisitor.default,
  maxDurationMin: SIM_LIMITS.maxDurationMin.default,
  poolSize: SIM_LIMITS.poolSize.default,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Clamp one raw setting (number or input string) into its enforced range. */
export function clampSetting(key: SimSettingKey, value: unknown): number {
  const { min, max, default: fallback } = SIM_LIMITS[key];
  return clampInt(value, min, max, fallback);
}

export function clampSettings(raw: Partial<Record<SimSettingKey, unknown>>): SimSettings {
  return {
    rps: clampSetting('rps', raw.rps),
    maxInFlight: clampSetting('maxInFlight', raw.maxInFlight),
    searchesPerVisitor: clampSetting('searchesPerVisitor', raw.searchesPerVisitor),
    maxDurationMin: clampSetting('maxDurationMin', raw.maxDurationMin),
    poolSize: clampSetting('poolSize', raw.poolSize),
  };
}

// ---------------------------------------------------------------------------
// Visitors and request body

/** Same field set and order as userToApiContext() for an identified user. */
export type SimUserContext = {
  key: string;
  name: string;
  email: string;
  country: string;
  state: string;
  memberTier: MemberTier;
  memberSince: string;
  lifetimeSpend: number;
  preferredCategory: ProductCategory;
  earlyAccessEnabled: boolean;
  anonymous: false;
};

export type SimSearchBody = {
  q: string;
  userContext: SimUserContext;
  sessionKey: string;
};

export type SimVisitor = {
  sessionKey: string;
  userContext: SimUserContext;
  /** Searches left before this visitor is retired. */
  remaining: number;
};

const SIM_CATEGORIES: readonly ProductCategory[] = ['running', 'basketball', 'lifestyle', 'training'];
const SIM_STATES = ['CA', 'NY', 'TX', 'FL', 'WA', 'IL', 'CO', 'MA'] as const;

function poolSuffix(index: number): string {
  return String(index).padStart(4, '0');
}

/**
 * Deterministic synthetic user for a 1-based pool index. Names and emails are
 * obviously fake (`Sim Visitor 0042`, `sim-user-0042@example.com`).
 */
export function poolUser(index: number): { sessionKey: string; userContext: SimUserContext } {
  const suffix = poolSuffix(index);
  const memberTier: MemberTier = index % 5 === 0 ? 'vip' : 'standard';
  return {
    sessionKey: `sim-session-${suffix}`,
    userContext: {
      key: `sim-user-${suffix}`,
      name: `Sim Visitor ${suffix}`,
      email: `sim-user-${suffix}@example.com`,
      country: 'US',
      state: SIM_STATES[index % SIM_STATES.length],
      memberTier,
      memberSince: `${2018 + (index % 7)}-01-01`,
      lifetimeSpend: memberTier === 'vip' ? 1500 + (index % 50) * 40 : (index % 40) * 25,
      preferredCategory: SIM_CATEGORIES[index % SIM_CATEGORIES.length],
      earlyAccessEnabled: memberTier === 'vip',
      anonymous: false,
    },
  };
}

/** Pick a random pool user and give it a fresh search budget. */
export function pickVisitor(settings: SimSettings, rand: () => number = Math.random): SimVisitor {
  const index = 1 + Math.floor(rand() * settings.poolSize);
  return { ...poolUser(Math.min(index, settings.poolSize)), remaining: settings.searchesPerVisitor };
}

export function pickQuery(rand: () => number = Math.random): string {
  return SIM_QUERIES[Math.floor(rand() * SIM_QUERIES.length) % SIM_QUERIES.length];
}

export function buildSearchBody(visitor: SimVisitor, query: string): SimSearchBody {
  return { q: query, userContext: visitor.userContext, sessionKey: visitor.sessionKey };
}

// ---------------------------------------------------------------------------
// Regression header

export const REGRESSION_LATENCY = { min: 100, max: 3000, default: 750 } as const;

export type RegressionMode = { mode: 'off' } | { mode: 'error' } | { mode: 'latency'; ms: number };

export function clampLatencyMs(value: unknown): number {
  return clampInt(value, REGRESSION_LATENCY.min, REGRESSION_LATENCY.max, REGRESSION_LATENCY.default);
}

/** Request headers for one simulated search. Off → no regression header at all. */
export function searchRequestHeaders(regression: RegressionMode): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (regression.mode === 'error') headers['x-demo-regression'] = 'error';
  else if (regression.mode === 'latency') {
    headers['x-demo-regression'] = `latency:${clampLatencyMs(regression.ms)}`;
  }
  return headers;
}

/** Short label for banners: `off`, `errors`, `latency 750ms`. */
export function regressionLabel(regression: RegressionMode): string {
  if (regression.mode === 'error') return 'errors';
  if (regression.mode === 'latency') return `latency ${regression.ms}ms`;
  return 'off';
}

/** `_served.variation` from a 200 body, or null for anything unexpected. */
export function parseServedVariation(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const served = (body as { _served?: unknown })._served;
  if (typeof served !== 'object' || served === null) return null;
  const variation = (served as { variation?: unknown }).variation;
  return typeof variation === 'string' && variation.length > 0 && variation.length <= 64
    ? variation
    : null;
}

// ---------------------------------------------------------------------------
// Stats

export const LATENCY_WINDOW = 200;

export type SimOutcome =
  | { kind: 'response'; status: number; latencyMs: number; applied: boolean; variation: string | null }
  | { kind: 'failure'; latencyMs: number };

export type SimStats = {
  sent: number;
  ok2xx: number;
  err5xx: number;
  otherFailures: number;
  regressionApplied: number;
  skipped: number;
  arms: Record<string, number>;
  /** Ring buffer of the last LATENCY_WINDOW completed-request latencies (ms). */
  latencies: number[];
  latencyCursor: number;
};

export function createStats(): SimStats {
  return {
    sent: 0,
    ok2xx: 0,
    err5xx: 0,
    otherFailures: 0,
    regressionApplied: 0,
    skipped: 0,
    arms: {},
    latencies: [],
    latencyCursor: 0,
  };
}

function pushLatency(stats: SimStats, ms: number) {
  if (stats.latencies.length < LATENCY_WINDOW) stats.latencies.push(ms);
  else stats.latencies[stats.latencyCursor] = ms;
  stats.latencyCursor = (stats.latencyCursor + 1) % LATENCY_WINDOW;
}

/** Fold one completed request into the stats (mutates `stats`). */
export function recordOutcome(stats: SimStats, outcome: SimOutcome): void {
  pushLatency(stats, outcome.latencyMs);
  if (outcome.kind === 'failure') {
    stats.otherFailures += 1;
    return;
  }
  if (outcome.applied) stats.regressionApplied += 1;
  if (outcome.status >= 200 && outcome.status < 300) stats.ok2xx += 1;
  else if (outcome.status >= 500 && outcome.status < 600) stats.err5xx += 1;
  else stats.otherFailures += 1;
  // Only 200 bodies carry an arm; an error response counts under `applied` only.
  if (outcome.status === 200 && outcome.variation) {
    stats.arms[outcome.variation] = (stats.arms[outcome.variation] ?? 0) + 1;
  }
}

export type SimSummary = Omit<SimStats, 'latencies' | 'latencyCursor'> & {
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  latencySamples: number;
};

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

/** Immutable snapshot for rendering. */
export function summarize(stats: SimStats): SimSummary {
  const n = stats.latencies.length;
  return {
    sent: stats.sent,
    ok2xx: stats.ok2xx,
    err5xx: stats.err5xx,
    otherFailures: stats.otherFailures,
    regressionApplied: stats.regressionApplied,
    skipped: stats.skipped,
    arms: { ...stats.arms },
    avgLatencyMs: n === 0 ? null : stats.latencies.reduce((sum, v) => sum + v, 0) / n,
    p95LatencyMs: percentile(stats.latencies, 95),
    latencySamples: n,
  };
}
