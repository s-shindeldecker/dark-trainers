import type { PackItemKind } from '../packs/types';

/**
 * Client for POST /api/search-lab (server/routes/search-lab.ts). The AI search
 * lab is separate from the storefront search and its ranking experiment.
 */

export type SearchLabServed = 'keyword' | 'ai';

export type SearchLabFallbackReason =
  | 'config-missing'
  | 'config-disabled'
  | 'invalid-output'
  | 'error';

export interface SearchLabItem {
  id: string;
  name: string;
  kind: PackItemKind;
  area: string;
  description: string;
}

export interface SearchLabResponse {
  served: SearchLabServed;
  packKey: string;
  items: SearchLabItem[];
  /** The model's message, or the server's no-match message when declined. */
  message: string | null;
  declined: boolean;
  fallbackUsed: boolean;
  fallbackReason: SearchLabFallbackReason | null;
  variationKey: string | null;
  modelName: string | null;
  tokens: number | null;
  latencyMs: number;
}

/**
 * A failed request. `message` is the server's short `error` string when it
 * sent one, otherwise a generic line — never a stack trace or raw body.
 */
export interface SearchLabError {
  kind: 'http' | 'network' | 'aborted';
  status: number | null;
  message: string;
}

export type SearchLabResult =
  | { ok: true; data: SearchLabResponse }
  | { ok: false; error: SearchLabError };

const GENERIC_ERROR = 'Search failed';
const MAX_ERROR_LENGTH = 200;

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function readServerError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error.trim().slice(0, MAX_ERROR_LENGTH);
    }
  } catch {
    /* non-JSON body: fall through to the generic message */
  }
  return GENERIC_ERROR;
}

export async function searchLab(
  q: string,
  sessionKey: string,
  signal?: AbortSignal,
): Promise<SearchLabResult> {
  let res: Response;
  try {
    res = await fetch('/api/search-lab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, sessionKey }),
      signal,
    });
  } catch (error) {
    if (isAbort(error)) {
      return { ok: false, error: { kind: 'aborted', status: null, message: 'Aborted' } };
    }
    return { ok: false, error: { kind: 'network', status: null, message: GENERIC_ERROR } };
  }

  if (!res.ok) {
    return {
      ok: false,
      error: { kind: 'http', status: res.status, message: await readServerError(res) },
    };
  }

  try {
    return { ok: true, data: (await res.json()) as SearchLabResponse };
  } catch (error) {
    if (isAbort(error)) {
      return { ok: false, error: { kind: 'aborted', status: null, message: 'Aborted' } };
    }
    return { ok: false, error: { kind: 'http', status: res.status, message: GENERIC_ERROR } };
  }
}
