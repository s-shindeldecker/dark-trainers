/**
 * Gravity Farms Experiment Simulator — Core Engine
 *
 * Simulates user journeys using the LaunchDarkly server SDK.
 * Calls variationDetail() for every user so that LD's experiment
 * allocation rules drive variation assignment, and inExperiment
 * status is captured accurately.
 */

import { randomUUID } from 'crypto';
import type { LDClient, LDContext } from '@launchdarkly/node-server-sdk';

// ---------------------------------------------------------------------------
// Lookup tables — matches the Python simulation
// ---------------------------------------------------------------------------

const COUNTRIES = ['US', 'UK', 'FR', 'DE', 'CA'] as const;
const PET_TYPES = ['dog', 'cat', 'both'] as const;
const PLAN_TYPES = ['basic', 'premium', 'trial'] as const;
const PAYMENT_TYPES = ['credit_card', 'paypal', 'apple_pay', 'google_pay', 'bank'] as const;

const US_STATES = ['CA', 'TX', 'NY', 'FL', 'WA', 'OR', 'IL', 'OH', 'PA', 'GA'];
const CA_PROVINCES = ['ON', 'BC', 'AB', 'QC', 'MB'];
const UK_CITIES = ['London', 'Manchester', 'Birmingham', 'Edinburgh', 'Bristol'];
const FR_CITIES = ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Nice'];
const DE_CITIES = ['Berlin', 'Munich', 'Hamburg', 'Frankfurt', 'Cologne'];

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery',
  'Blake', 'Cameron', 'Drew', 'Elliot', 'Finley', 'Hayden', 'Jamie',
  'Kendall', 'Logan', 'Peyton', 'Reese', 'Sage',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Wilson', 'Taylor', 'Anderson', 'Thomas', 'Jackson', 'White',
  'Harris', 'Martin', 'Clark', 'Lewis', 'Robinson', 'Walker',
];

// ---------------------------------------------------------------------------
// Statistical constants — base rates match Python simulation
// ---------------------------------------------------------------------------

const BASE_SIGNUP_RATE: Record<string, number> = {
  'Control': 0.05,
  'Variant 1': 0.07,
  'Next Generation': 0.09,
  'Unknown': 0.05,
};

const BASE_REVENUE_MEAN: Record<string, number> = {
  'Control': 30.0,
  'Variant 1': 35.0,
  'Next Generation': 40.0,
  'Unknown': 30.0,
};

// Monthly plan prices by region — matches Python calculate_adjusted_revenue
const BASE_PRICES: Record<string, Record<string, number>> = {
  basic:   { US: 29.99, CA: 39.99, UK: 24.99, EU: 27.99 },
  premium: { US: 49.99, CA: 64.99, UK: 39.99, EU: 44.99 },
  trial:   { US: 29.99, CA: 39.99, UK: 24.99, EU: 27.99 },
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VariationName = 'Control' | 'Variant 1' | 'Next Generation' | 'Unknown';

export interface SimulationParams {
  totalUsers: number;       // 10–2000
  usersPerSecond: number;   // 0.1–50
  winningVariation: VariationName;
  effectSize: number;       // 0.0–1.0: how much better the winner is above its base rate
  noiseLevel: number;       // 0.0–1.0: 0=clean data, 1=very noisy
}

export interface VariationStats {
  users: number;
  experimentUsers: number;  // users where inExperiment === true
  signups: number;
  conversions: number;
  totalRevenue: number;
  conversionRate: number;       // signups / users
  paidConversionRate: number;   // conversions / signups
  avgRevenue: number;
}

export interface SimulationUserResult {
  userId: string;
  userName: string;
  variation: VariationName;
  variationIndex: number | null;
  inExperiment: boolean;
  reason: string;
  eventsTracked: string[];
  trialDays: number;
  country: string;
  petType: string;
}

export interface RunningTotals {
  totalUsers: number;
  experimentUsers: number;
  byVariation: Record<string, VariationStats>;
}

export interface SimulationWinner {
  variation: VariationName;
  controlConversionRate: number;
  winnerConversionRate: number;
  lift: number;             // relative lift vs Control, e.g. 0.40 = 40% better
  zScore: number;
  pValue: number;
  isSignificant: boolean;   // p < 0.05
  confidenceLevel: string;
}

export interface SimulationSummary {
  totalUsers: number;
  experimentUsers: number;
  duration: number;         // ms
  byVariation: Record<string, VariationStats>;
  winner: SimulationWinner | null;
  warnings: string[];
}

export interface SimulationEvent {
  type: 'user' | 'progress' | 'complete' | 'error';
  user?: SimulationUserResult;
  running: RunningTotals;
  summary?: SimulationSummary;
  error?: string;
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Box-Muller transform for Gaussian noise */
function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random() || 1e-10; // guard against log(0)
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * Normal CDF approximation (Abramowitz & Stegun, accurate to ~4 decimal places).
 * Used to compute p-values without a stats library.
 */
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return x > 0 ? 1 - p : p;
}

function twoTailPValue(z: number): number {
  return 2 * (1 - normalCDF(Math.abs(z)));
}

/** Two-proportion z-test (Control vs. challenger) */
function computeZScore(n1: number, p1: number, n2: number, p2: number): number {
  if (n1 === 0 || n2 === 0) return 0;
  const pooledP = (n1 * p1 + n2 * p2) / (n1 + n2);
  const se = Math.sqrt(pooledP * (1 - pooledP) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;
  return (p2 - p1) / se;
}

function emptyVariationStats(): VariationStats {
  return {
    users: 0,
    experimentUsers: 0,
    signups: 0,
    conversions: 0,
    totalRevenue: 0,
    conversionRate: 0,
    paidConversionRate: 0,
    avgRevenue: 0,
  };
}

function updateVariationStats(
  stats: VariationStats,
  inExperiment: boolean,
  didSignup: boolean,
  didConvert: boolean,
  revenue: number,
): VariationStats {
  const s = { ...stats };
  s.users += 1;
  if (inExperiment) s.experimentUsers += 1;
  if (didSignup) s.signups += 1;
  if (didConvert) {
    s.conversions += 1;
    s.totalRevenue += revenue;
  }
  s.conversionRate = s.users > 0 ? s.signups / s.users : 0;
  s.paidConversionRate = s.signups > 0 ? s.conversions / s.signups : 0;
  s.avgRevenue = s.conversions > 0 ? s.totalRevenue / s.conversions : 0;
  return s;
}

/**
 * Identifies the human-readable variant name from the flag value.
 * Uses banner-text keyword matching (same logic as the Python simulation)
 * with variationIndex as a fallback.
 */
function identifyVariant(bannerValue: unknown, variationIndex: number | null | undefined): VariationName {
  let bannerText = '';
  if (typeof bannerValue === 'object' && bannerValue !== null) {
    bannerText = String((bannerValue as Record<string, unknown>)['banner-text'] ?? '');
  } else if (typeof bannerValue === 'string') {
    bannerText = bannerValue;
  }

  const lower = bannerText.toLowerCase();
  if (lower.includes('control')) return 'Control';
  if (lower.includes('next')) return 'Next Generation';
  if (lower.includes('variant') || lower.includes('top')) return 'Variant 1';

  // Fall back to variationIndex if banner text doesn't contain keywords
  if (variationIndex === 0) return 'Control';
  if (variationIndex === 1) return 'Variant 1';
  if (variationIndex === 2) return 'Next Generation';

  // Default: treat as Control (matches Python fallthrough behaviour)
  return 'Control';
}

/**
 * Generates a user context matching the Python simulation's attribute schema.
 */
function generateUserContext(): { context: LDContext; attrs: Record<string, string> } {
  const country = pick(COUNTRIES);
  const petType = pick(PET_TYPES);
  const planType = pick(PLAN_TYPES);
  const paymentType = pick(PAYMENT_TYPES);
  const key = randomUUID();
  const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;

  let state: string;
  if (country === 'US') state = pick(US_STATES);
  else if (country === 'CA') state = pick(CA_PROVINCES);
  else if (country === 'UK') state = pick(UK_CITIES);
  else if (country === 'FR') state = pick(FR_CITIES);
  else state = pick(DE_CITIES);

  const context: LDContext = {
    kind: 'user',
    key,
    name,
    country,
    state,
    petType,
    planType,
    paymentType,
  };

  return { context, attrs: { key, name, country, state, petType, planType, paymentType } };
}

/**
 * Calculates the effective signup rate for a variation, applying the
 * effectSize boost to the winning variation and Gaussian noise to all.
 */
function calculateSignupRate(
  variation: VariationName,
  winningVariation: VariationName,
  effectSize: number,
  noiseLevel: number,
): number {
  const base = BASE_SIGNUP_RATE[variation] ?? 0.05;
  const adjusted = variation === winningVariation ? base * (1 + effectSize) : base;
  if (noiseLevel === 0) return adjusted;

  // Perturb the rate with Gaussian noise — at noiseLevel=1, stdDev = 50% of rate
  const stdDev = noiseLevel * adjusted * 0.5;
  return Math.max(0.001, Math.min(0.999, gaussianRandom(adjusted, stdDev)));
}

function calculateRevenue(variation: VariationName, noiseLevel: number): number {
  const mean = BASE_REVENUE_MEAN[variation] ?? 30;
  const stdDev = 5 + noiseLevel * 10;
  return Math.max(0, Math.round(gaussianRandom(mean, stdDev) * 100) / 100);
}

/** Compute the final summary with z-test stats */
function computeSummary(
  running: RunningTotals,
  startTime: number,
  warnings: string[],
): SimulationSummary {
  const duration = Date.now() - startTime;
  const controlStats = running.byVariation['Control'];
  let winner: SimulationWinner | null = null;

  if (controlStats && controlStats.users > 0) {
    // Use experiment users if available, otherwise fall back to total users
    const controlN = controlStats.experimentUsers > 0
      ? controlStats.experimentUsers
      : controlStats.users;
    const controlRate = controlN > 0 ? controlStats.signups / controlN : 0;

    let bestVariation: VariationName = 'Control';
    let bestRate = controlRate;

    for (const [varName, stats] of Object.entries(running.byVariation)) {
      if (varName === 'Control') continue;
      const n = stats.experimentUsers > 0 ? stats.experimentUsers : stats.users;
      const rate = n > 0 ? stats.signups / n : 0;
      if (rate > bestRate) {
        bestRate = rate;
        bestVariation = varName as VariationName;
      }
    }

    const winnerStats = running.byVariation[bestVariation];
    const winnerN = winnerStats
      ? (winnerStats.experimentUsers > 0 ? winnerStats.experimentUsers : winnerStats.users)
      : 0;
    const winnerRate = winnerN > 0 ? (winnerStats?.signups ?? 0) / winnerN : 0;

    const zScore =
      bestVariation !== 'Control'
        ? computeZScore(controlN, controlRate, winnerN, winnerRate)
        : 0;
    const pValue = twoTailPValue(zScore);
    const isSignificant = pValue < 0.05;
    const lift = controlRate > 0 ? (winnerRate - controlRate) / controlRate : 0;

    let confidenceLevel: string;
    if (pValue < 0.001) confidenceLevel = '99.9%';
    else if (pValue < 0.01) confidenceLevel = '99%';
    else if (pValue < 0.05) confidenceLevel = '95%';
    else if (pValue < 0.10) confidenceLevel = '90% (not significant)';
    else confidenceLevel = 'Not significant';

    winner = {
      variation: bestVariation,
      controlConversionRate: controlRate,
      winnerConversionRate: winnerRate,
      lift,
      zScore,
      pValue,
      isSignificant,
      confidenceLevel,
    };
  }

  return {
    totalUsers: running.totalUsers,
    experimentUsers: running.experimentUsers,
    duration,
    byVariation: running.byVariation,
    winner,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Runs a simulation of `params.totalUsers` user journeys.
 *
 * For each user:
 *  1. Generates a randomised user context (matching the Python simulation)
 *  2. Calls `ldClient.variationDetail()` so LD's experiment rules assign the variation
 *  3. Checks `reason.inExperiment` to determine experiment enrolment
 *  4. Applies the statistical model (effectSize + noise) to fire events
 *  5. Tracks events via `ldClient.track()`
 *  6. Emits SSE-style events via `onEvent`
 *
 * @param params     Simulation configuration
 * @param ldClient   Initialised LaunchDarkly server SDK client
 * @param onEvent    Callback for each streamed event (user / progress / complete / error)
 * @param signal     AbortSignal — abort to stop mid-run (e.g. client disconnect)
 */
export async function runSimulation(
  params: SimulationParams,
  ldClient: LDClient,
  onEvent: (event: SimulationEvent) => void,
  signal: AbortSignal,
): Promise<SimulationSummary> {
  const { totalUsers, usersPerSecond, winningVariation, effectSize, noiseLevel } = params;
  const delayMs = usersPerSecond > 0 ? Math.round(1000 / usersPerSecond) : 0;
  const startTime = Date.now();
  const warnings: string[] = [];

  const running: RunningTotals = {
    totalUsers: 0,
    experimentUsers: 0,
    byVariation: {},
  };

  let noExperimentWarned = false;

  for (let i = 0; i < totalUsers; i++) {
    if (signal.aborted) break;

    // 1. Generate user context
    const { context, attrs } = generateUserContext();

    // 2. Evaluate flags with variationDetail — LD assigns the variation
    const heroBannerDetail = await ldClient.variationDetail('hero-banner-text', context, {});
    const trialDaysDetail = await ldClient.variationDetail('number-of-days-trial', context, 7);
    const seasonalBanner = await ldClient.variation('seasonal-sale-banner-text', context, '');

    // 3. Extract variation info and inExperiment status from reason
    const variation = identifyVariant(
      heroBannerDetail.value,
      heroBannerDetail.variationIndex,
    );
    const inExperiment = heroBannerDetail.reason?.inExperiment === true;
    const reasonKind = heroBannerDetail.reason?.kind ?? 'UNKNOWN';
    const trialDays =
      typeof trialDaysDetail.value === 'number' ? trialDaysDetail.value : 7;

    // Warn once if no users are enrolled in experiment after 20 evaluations
    if (!noExperimentWarned && i >= 19 && running.experimentUsers === 0) {
      warnings.push(
        '⚠️ No users enrolled in the experiment after 20 evaluations. Check that your hero-banner-text flag has an active experiment with a percentage rollout configured in LaunchDarkly.',
      );
      noExperimentWarned = true;
    }

    // 4. Apply statistical model
    const signupRate = calculateSignupRate(variation, winningVariation, effectSize, noiseLevel);
    const didSignup = Math.random() < signupRate;
    const didConvert = didSignup && Math.random() < 0.5;
    const revenue = didConvert ? calculateRevenue(variation, noiseLevel) : 0;

    // 5. Track events via LD SDK (matches Python simulate_user_journey_v2)
    const eventsTracked: string[] = ['page_view'];

    if (didSignup) {
      eventsTracked.push('trial_signup');
      ldClient.track('trial_signup', context);

      if (didConvert) {
        eventsTracked.push('trial_to_paid_conversion');
        ldClient.track('trial_to_paid_conversion', context);

        eventsTracked.push('total_revenue');
        ldClient.track('total_revenue', context, undefined, revenue);

        // Adjusted revenue = total_revenue − trial cost
        const region = ['FR', 'DE'].includes(attrs.country) ? 'EU' : attrs.country;
        const monthlyPrice =
          BASE_PRICES[attrs.planType]?.[region] ?? BASE_PRICES['basic']['US'];
        const trialCost = (monthlyPrice / 30) * trialDays;
        const adjustedRevenue = Math.max(
          0,
          Math.round((revenue - trialCost) * 100) / 100,
        );
        eventsTracked.push('adjusted_revenue');
        ldClient.track('adjusted_revenue', context, undefined, adjustedRevenue);
      }
    }

    if (seasonalBanner && Math.random() < 0.1) {
      eventsTracked.push('banner_click');
      ldClient.track('banner_click', context);
    }

    if (Math.random() < 0.15) {
      eventsTracked.push('hero_engagement');
      ldClient.track('hero_engagement', context);
    }

    // 6. Update running totals
    if (!running.byVariation[variation]) {
      running.byVariation[variation] = emptyVariationStats();
    }
    running.byVariation[variation] = updateVariationStats(
      running.byVariation[variation],
      inExperiment,
      didSignup,
      didConvert,
      revenue,
    );
    running.totalUsers += 1;
    if (inExperiment) running.experimentUsers += 1;

    // 7. Emit user event (for event log in UI)
    const userResult: SimulationUserResult = {
      userId: attrs.key.slice(0, 8),
      userName: attrs.name,
      variation,
      variationIndex: heroBannerDetail.variationIndex ?? null,
      inExperiment,
      reason: reasonKind,
      eventsTracked,
      trialDays,
      country: attrs.country,
      petType: attrs.petType,
    };

    onEvent({
      type: 'user',
      user: userResult,
      running: {
        ...running,
        byVariation: { ...running.byVariation },
      },
    });

    // Emit a progress event every 10 users and flush LD events
    if ((i + 1) % 10 === 0) {
      onEvent({
        type: 'progress',
        running: {
          ...running,
          byVariation: { ...running.byVariation },
        },
      });
      ldClient.flush().catch(() => {}); // non-blocking flush
    }

    // Pace the simulation
    if (delayMs > 0 && i < totalUsers - 1) {
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, delayMs);
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new Error('aborted'));
            },
            { once: true },
          );
        });
      } catch {
        break; // AbortSignal fired — exit loop cleanly
      }
    }
  }

  // Final flush before summary
  await ldClient.flush().catch(() => {});

  const summary = computeSummary(running, startTime, warnings);
  onEvent({ type: 'complete', running, summary });

  return summary;
}
