/**
 * AI path for the search lab: one call to the `ai-search-lab-model` AI Config
 * (key overridable via AI_SEARCH_LAB_CONFIG_KEY) through the new LaunchDarkly
 * AI SDK.
 *
 * That SDK keeps its own LD client singleton, separate from the repo's client
 * in server/launchdarkly.ts, and reads its key from LD_SDK_KEY.
 */
import { openaiMessages } from '@launchdarkly/ai-openai-messages';
import {
  getClient,
  inspectConfig,
  type LDContext,
  type TokenUsage,
  type TrackData,
} from '@launchdarkly/ai-node';
import type { Pack } from '../../src/packs/types.js';
import { validateAiResult, type InvalidReason } from './validateAiResult.js';

const DEFAULT_CONFIG_KEY = 'ai-search-lab-model';

export type FallbackReason = 'config-missing' | 'config-disabled' | 'invalid-output' | 'error';

/**
 * Thrown by aiSearch. Carries trackData/usage when the model did respond, and
 * invalidReason when its output failed validation.
 */
export class AiSearchError extends Error {
  constructor(
    readonly fallbackReason: FallbackReason,
    readonly trackData?: TrackData,
    readonly usage?: TokenUsage,
    options?: { cause?: unknown },
    readonly invalidReason: InvalidReason | null = null,
  ) {
    super(`AI search failed: ${fallbackReason}`, options);
    this.name = 'AiSearchError';
  }
}

export interface AiSearchResult {
  ids: string[];
  message: string | null;
  invalidIdCount: number;
  usage: TokenUsage;
  trackData: TrackData;
}

/** The new SDK reads LD_SDK_KEY; this repo's env names it LAUNCHDARKLY_SDK_KEY. */
function ensureSdkKeyEnv() {
  process.env.LD_SDK_KEY ||= process.env.LAUNCHDARKLY_SDK_KEY;
}

function configKey(): string {
  return process.env.AI_SEARCH_LAB_CONFIG_KEY || DEFAULT_CONFIG_KEY;
}

/**
 * Why the invoke failed. `inspectConfig` never throws; it returns `meta: null`
 * when the config doesn't exist (or LD is unreachable).
 */
async function classifyFailure(key: string, context: LDContext): Promise<FallbackReason> {
  try {
    const { enabled, meta } = await inspectConfig(key, context);
    if (meta === null) return 'config-missing';
    if (!enabled) return 'config-disabled';
    return 'error';
  } catch {
    return 'error';
  }
}

export async function aiSearch(pack: Pack, query: string, context: LDContext): Promise<AiSearchResult> {
  ensureSdkKeyEnv();
  const key = configKey();

  // Only what the model needs to pick items; keeps the prompt small.
  const compactItems = pack.items.map(
    ({ id, name, kind, area, aliases, species, attributes, hoursNote, description }) => ({
      id, name, kind, area, aliases, species, attributes, hoursNote, description,
    }),
  );

  let result: Awaited<ReturnType<typeof openaiMessages>>;
  try {
    result = await openaiMessages(key, query, context, {
      variables: { packName: pack.displayName, items: JSON.stringify(compactItems) },
      skipJudges: true,
    });
  } catch (error) {
    throw new AiSearchError(await classifyFailure(key, context), undefined, undefined, { cause: error });
  }

  // Typed as string by the SDK. It is an object when the AI Config sets an
  // outputFormat, and the model's raw text (parsed by the validator) when not.
  const raw = result.response as unknown;
  const validated = validateAiResult(pack, raw);
  if (!validated.ok) {
    // Model output only, capped; never the request, env, or catalog.
    const preview = (typeof raw === 'string' ? raw : String(JSON.stringify(raw))).slice(0, 300);
    console.error(
      `[SearchLab] invalid-output reason=${validated.reason} type=${typeof raw} raw=${JSON.stringify(preview)}`,
    );
    throw new AiSearchError('invalid-output', result.trackData, result.usage, undefined, validated.reason);
  }

  return {
    ids: validated.ids,
    message: validated.message,
    invalidIdCount: validated.invalidIdCount,
    usage: result.usage,
    trackData: result.trackData,
  };
}

/**
 * Flushes the AI SDK's own LD client. getClient() throws until the SDK has
 * initialized (e.g. its init failed), in which case there is nothing to flush.
 */
export async function flushAiClient(): Promise<void> {
  let client: ReturnType<typeof getClient>;
  try {
    client = getClient();
  } catch {
    return;
  }
  await client.flush();
}
