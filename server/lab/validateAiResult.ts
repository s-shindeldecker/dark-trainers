/**
 * Shape check and id filtering for the AI search lab's model output.
 *
 * Pure function over `Pack` data, no LaunchDarkly or network, so it can be
 * tested directly (scripts/test-ai-validate.ts).
 */
import type { Pack } from '../../src/packs/types.js';

export type ValidatedAiResult =
  | { ok: true; ids: string[]; message: string | null; invalidIdCount: number }
  | { ok: false };

/**
 * `raw` is the AI Config's response. With `outputFormat` set in LaunchDarkly
 * the SDK has already parsed it into `{ ids, message }`; it only arrives as a
 * string when the SDK's own parse failed, so one more `JSON.parse` is tried
 * before giving up.
 *
 * Ids not in the pack are dropped and counted; repeated ids are kept once and
 * not counted as invalid.
 */
export function validateAiResult(pack: Pack, raw: unknown): ValidatedAiResult {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false };
    }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false };
  }
  const { ids, message } = value as { ids?: unknown; message?: unknown };
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
    return { ok: false };
  }
  if (message !== null && typeof message !== 'string') {
    return { ok: false };
  }

  const known = new Set(pack.items.map((item) => item.id));
  const kept: string[] = [];
  let invalidIdCount = 0;
  for (const id of ids as string[]) {
    if (!known.has(id)) invalidIdCount += 1;
    else if (!kept.includes(id)) kept.push(id);
  }

  return { ok: true, ids: kept, message, invalidIdCount };
}
