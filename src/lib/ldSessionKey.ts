/** sessionStorage key for LaunchDarkly pre-login `session` context (browser session). */
export const LD_SESSION_STORAGE_KEY = 'dt-ld-session-key';

function randomKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

/** Read existing session key from storage, or create and persist a new one. */
export function getOrCreateLdSessionKey(): string {
  try {
    const existing = sessionStorage.getItem(LD_SESSION_STORAGE_KEY);
    if (existing) return existing;
    const key = randomKey();
    sessionStorage.setItem(LD_SESSION_STORAGE_KEY, key);
    return key;
  } catch {
    return randomKey();
  }
}

/** Generate a new key, persist it, and return it (e.g. guest reset / demo slate). */
export function rotateLdSessionKey(): string {
  const key = randomKey();
  try {
    sessionStorage.setItem(LD_SESSION_STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
  return key;
}
