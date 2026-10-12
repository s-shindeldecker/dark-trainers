/**
 * Demo-grade abuse protection for the public search lab routes
 * (routes/search-lab.ts and routes/search-lab-click.ts).
 *
 * NOT A SECURITY CONTROL. All state is in memory, so limits hold per server
 * instance only: each serverless instance (or restart) starts with empty
 * counters, and clients behind one IP share a bucket. It exists to keep a
 * public demo from being casually hammered or running up the model bill.
 *
 * The limiter and budget take an injectable clock so they can be tested
 * without waiting (scripts/test-guard.ts).
 */
import type { Request, Response } from 'express';

export type Clock = () => number;

export interface LimitResult {
  allowed: boolean;
  /** 0 when allowed; otherwise whole seconds until the next request fits (at least 1). */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  allow(key: string, limit: number, windowMs: number): LimitResult;
  /** Number of keys currently tracked (for tests). */
  size(): number;
}

export const DEFAULT_MAX_KEYS = 5000;
/** Longer keys are truncated so a client can't grow memory with huge session keys. */
const MAX_KEY_LENGTH = 200;
const HOUR_MS = 60 * 60 * 1000;
export const LAB_WINDOW_MS = 10 * 60 * 1000;

interface Entry {
  hits: number[];
  windowMs: number;
}

/**
 * Sliding-window log limiter. Each key keeps the timestamps of its allowed
 * requests inside the window. The map is kept in least-recently-used order; when
 * it reaches maxKeys, expired keys are swept and then the oldest are evicted.
 */
export function createRateLimiter(options: { now?: Clock; maxKeys?: number } = {}): RateLimiter {
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const entries = new Map<string, Entry>();

  function prune(entry: Entry, t: number) {
    const cutoff = t - entry.windowMs;
    let drop = 0;
    while (drop < entry.hits.length && entry.hits[drop] <= cutoff) drop++;
    if (drop > 0) entry.hits.splice(0, drop);
  }

  function makeRoom(t: number) {
    for (const [key, entry] of entries) {
      prune(entry, t);
      if (entry.hits.length === 0) entries.delete(key);
    }
    for (const key of entries.keys()) {
      if (entries.size < maxKeys) break;
      entries.delete(key);
    }
  }

  return {
    allow(rawKey, limit, windowMs) {
      const key = rawKey.slice(0, MAX_KEY_LENGTH);
      const t = now();
      let entry = entries.get(key);
      if (entry) {
        // Re-insert to move the key to the most-recently-used end.
        entries.delete(key);
        entry.windowMs = windowMs;
        prune(entry, t);
      } else {
        if (entries.size >= maxKeys) makeRoom(t);
        entry = { hits: [], windowMs };
      }
      entries.set(key, entry);

      if (entry.hits.length >= limit) {
        const waitMs = entry.hits[0] + windowMs - t;
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
      }
      entry.hits.push(t);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    size() {
      return entries.size;
    },
  };
}

export interface AiBudget {
  /** Takes one AI call from the rolling-hour budget; false when it is spent. */
  take(): boolean;
}

export function createAiBudget(maxPerHour: number, options: { now?: Clock } = {}): AiBudget {
  const limiter = createRateLimiter({ now: options.now, maxKeys: 1 });
  return {
    take: () => limiter.allow('ai', maxPerHour, HOUR_MS).allowed,
  };
}

export interface GuardConfig {
  /** /api/search-lab requests per IP per LAB_WINDOW_MS. */
  searchPerIp: number;
  /** /api/search-lab requests per session key per LAB_WINDOW_MS. */
  searchPerSession: number;
  /** /api/search-lab/click requests per IP per LAB_WINDOW_MS. */
  clickPerIp: number;
  /** AI calls per rolling hour, across all clients on this instance. */
  aiCallsPerHour: number;
}

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
  searchPerIp: 30,
  searchPerSession: 20,
  clickPerIp: 120,
  aiCallsPerHour: 200,
};

/** A positive integer, or undefined for anything else (missing, blank, 0, negative, decimal, junk). */
function positiveInt(value: string | undefined): number | undefined {
  if (value === undefined || !/^\s*\d+\s*$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** Reads limits from env; invalid values fall back to the defaults. Never logs values. */
export function readGuardConfig(env: NodeJS.ProcessEnv = process.env): GuardConfig {
  const d = DEFAULT_GUARD_CONFIG;
  return {
    searchPerIp: positiveInt(env.SEARCH_LAB_RATE_LIMIT_PER_IP) ?? d.searchPerIp,
    searchPerSession: positiveInt(env.SEARCH_LAB_RATE_LIMIT_PER_SESSION) ?? d.searchPerSession,
    clickPerIp: positiveInt(env.SEARCH_LAB_CLICK_LIMIT_PER_IP) ?? d.clickPerIp,
    aiCallsPerHour: positiveInt(env.SEARCH_LAB_AI_CALLS_PER_HOUR) ?? d.aiCallsPerHour,
  };
}

/** req.ip, else the first x-forwarded-for value, else 'unknown'. */
export function getClientIp(req: Pick<Request, 'ip' | 'headers'>): string {
  if (req.ip) return req.ip;
  const header = req.headers['x-forwarded-for'];
  const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
  return first || 'unknown';
}

export const TOO_MANY_REQUESTS_MESSAGE = 'Too many requests. Try again shortly.';

export function sendTooManyRequests(res: Response, retryAfterSeconds: number) {
  res.set('Retry-After', String(retryAfterSeconds));
  res.status(429).json({ error: TOO_MANY_REQUESTS_MESSAGE });
}

export interface LabGuard {
  config: GuardConfig;
  limiter: RateLimiter;
  aiBudget: AiBudget;
}

let labGuard: LabGuard | undefined;

/**
 * The shared per-instance guard for the lab routes. Created on first use, so env
 * is read after dotenv has loaded rather than at import time.
 */
export function getLabGuard(): LabGuard {
  if (!labGuard) {
    const config = readGuardConfig();
    labGuard = {
      config,
      limiter: createRateLimiter(),
      aiBudget: createAiBudget(config.aiCallsPerHour),
    };
  }
  return labGuard;
}

/** Takes one call from the shared hourly AI budget. */
export function takeAiBudget(): boolean {
  return getLabGuard().aiBudget.take();
}
