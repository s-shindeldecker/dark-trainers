/**
 * Session key for the AI search lab (/search-lab). Separate from the
 * storefront's 'dt-ld-session-key' (ldSessionKey.ts), which this never reads
 * or changes.
 *
 * Precedence: a valid ?sk=<value> query parameter (saved for later loads),
 * then the stored key, then a new random UUID.
 */

const STORAGE_KEY = 'dt-lab-session-key';
const VALID_KEY = /^[A-Za-z0-9_-]{1,64}$/;

/** Used when sessionStorage is unavailable (private mode, blocked storage). */
let memoryKey: string | null = null;

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryKey;
  }
}

function store(key: string): void {
  memoryKey = key;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* in-memory value above is the fallback */
  }
}

function readQueryKey(): string | null {
  try {
    const sk = new URLSearchParams(window.location.search).get('sk');
    return sk !== null && VALID_KEY.test(sk) ? sk : null;
  } catch {
    return null;
  }
}

export function getLabSessionKey(): string {
  const fromQuery = readQueryKey();
  if (fromQuery) {
    store(fromQuery);
    return fromQuery;
  }

  const stored = readStored() ?? memoryKey;
  if (stored) return stored;

  const created = crypto.randomUUID();
  store(created);
  return created;
}
