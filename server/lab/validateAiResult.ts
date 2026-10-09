/**
 * Shape check and id filtering for the AI search lab's model output.
 *
 * Pure function over `Pack` data, no LaunchDarkly or network, so it can be
 * tested directly (scripts/test-ai-validate.ts).
 */
import type { Pack } from '../../src/packs/types.js';

export type InvalidReason =
  | 'string-empty'
  | 'string-unparseable'
  | 'extra-text-around-json'
  | 'not-an-object'
  | 'ids-not-array'
  | 'ids-contains-non-string'
  | 'message-not-string';

export type ValidatedAiResult =
  | { ok: true; ids: string[]; message: string | null; invalidIdCount: number }
  | { ok: false; reason: InvalidReason };

type Parsed = { ok: true; value: unknown } | { ok: false; reason: InvalidReason };

/**
 * Trim, strip a leading ```json / ``` fence and a trailing ``` fence, then
 * JSON.parse. On failure, `extra-text-around-json` means a parseable `{...}`
 * sits inside other text (e.g. a preamble), which we deliberately don't accept.
 */
function parseStringResponse(raw: string): Parsed {
  const text = raw
    .trim()
    .replace(/^```(?:json)?[ \t]*\r?\n?/i, '')
    .replace(/\r?\n?```$/, '')
    .trim();
  if (text === '') return { ok: false, reason: 'string-empty' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try {
        JSON.parse(text.slice(first, last + 1));
        return { ok: false, reason: 'extra-text-around-json' };
      } catch {
        // fall through
      }
    }
    return { ok: false, reason: 'string-unparseable' };
  }
}

/**
 * `raw` is the AI Config's response. With `outputFormat` set in LaunchDarkly
 * the SDK has already parsed it into `{ ids, message }`; without one it is the
 * model's text, which is parsed here (see parseStringResponse).
 *
 * Ids not in the pack are dropped and counted; repeated ids are kept once and
 * not counted as invalid. An empty or blank message becomes null.
 */
export function validateAiResult(pack: Pack, raw: unknown): ValidatedAiResult {
  let value = raw;
  if (typeof value === 'string') {
    const parsed = parseStringResponse(value);
    if (!parsed.ok) return parsed;
    value = parsed.value;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'not-an-object' };
  }
  const { ids, message } = value as { ids?: unknown; message?: unknown };
  if (!Array.isArray(ids)) {
    return { ok: false, reason: 'ids-not-array' };
  }
  if (!ids.every((id) => typeof id === 'string')) {
    return { ok: false, reason: 'ids-contains-non-string' };
  }
  if (message !== null && typeof message !== 'string') {
    return { ok: false, reason: 'message-not-string' };
  }

  const known = new Set(pack.items.map((item) => item.id));
  const kept: string[] = [];
  let invalidIdCount = 0;
  for (const id of ids as string[]) {
    if (!known.has(id)) invalidIdCount += 1;
    else if (!kept.includes(id)) kept.push(id);
  }

  // The prompt asks for "" when there is nothing to say; report that as null,
  // the same as the keyword path.
  const normalizedMessage = message === null || message.trim() === '' ? null : message;
  return { ok: true, ids: kept, message: normalizedMessage, invalidIdCount };
}
