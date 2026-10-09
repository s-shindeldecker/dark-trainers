import { Router } from 'express';
import type { LDClient, LDContext } from '@launchdarkly/node-server-sdk';
import type { TokenUsage, TrackData } from '@launchdarkly/ai-node';
import type { PackItem } from '../../src/packs/types.js';
import { keywordSearch } from '../lab/keywordSearch.js';
import { getPack } from '../lab/packRegistry.js';
import { AiSearchError, aiSearch, flushAiClient, type FallbackReason } from '../lab/aiSearch.js';

/**
 * AI search lab — search over a content pack, separate from the storefront
 * search (routes/search.ts) and its ranking experiment.
 *
 * `ai-search-lab` is evaluated per request on a session-only context. Off:
 * keyword search. On: the AI Config (server/lab/aiSearch.ts), falling back to
 * keyword search on any failure.
 */

const FLAG_KEY = 'ai-search-lab';
const DEFAULT_PACK = 'ak-park';
const MIN_QUERY = 2;
const MAX_QUERY = 200;
const NO_MATCH_MESSAGE = "We couldn't find anything matching that search.";

function toResultItem(item: PackItem) {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    area: item.area,
    description: item.description,
  };
}

export function createSearchLabRouter(ldClient: LDClient) {
  const router = Router();

  router.post('/', async (req, res) => {
    const started = Date.now();
    try {
      const { q, sessionKey, pack: packKey = DEFAULT_PACK } = (req.body ?? {}) as {
        q?: unknown;
        sessionKey?: unknown;
        pack?: unknown;
      };

      if (typeof q !== 'string') {
        res.status(400).json({ error: 'A search query (q) is required' });
        return;
      }
      const query = q.trim();
      if (query.length < MIN_QUERY || query.length > MAX_QUERY) {
        res
          .status(400)
          .json({ error: `Query must be ${MIN_QUERY} to ${MAX_QUERY} characters` });
        return;
      }
      if (typeof sessionKey !== 'string' || sessionKey.length === 0) {
        res.status(400).json({ error: 'A sessionKey is required' });
        return;
      }
      const pack = typeof packKey === 'string' ? getPack(packKey) : undefined;
      if (!pack) {
        res.status(400).json({ error: 'Unknown pack' });
        return;
      }

      // Built inline rather than via ld-context.ts: that helper's return type
      // includes a multi-context shape that only type-checks with an `as any`.
      const context: LDContext = { kind: 'session', key: sessionKey };

      const detail = await ldClient.variationDetail(FLAG_KEY, context, false);
      const aiEnabled = detail.value === true;

      let served: 'keyword' | 'ai' = 'keyword';
      let items: ReturnType<typeof toResultItem>[] = [];
      let modelMessage: string | null = null;
      let fallbackUsed = false;
      let fallbackReason: FallbackReason | null = null;
      let invalidIdCount: number | null = null;
      let trackData: TrackData | undefined;
      let usage: TokenUsage | undefined;

      if (aiEnabled) {
        try {
          const ai = await aiSearch(pack, query, context);
          const byId = new Map(pack.items.map((item) => [item.id, item]));
          items = ai.ids.flatMap((id) => {
            const item = byId.get(id);
            return item ? [toResultItem(item)] : [];
          });
          served = 'ai';
          modelMessage = ai.message;
          invalidIdCount = ai.invalidIdCount;
          trackData = ai.trackData;
          usage = ai.usage;
        } catch (error) {
          // Logged server-side only; the response carries the reason, not the error.
          console.error('[SearchLab] AI path failed, using keyword search:', error);
          fallbackUsed = true;
          fallbackReason = error instanceof AiSearchError ? error.fallbackReason : 'error';
          if (error instanceof AiSearchError) {
            trackData = error.trackData;
            usage = error.usage;
          }
        }
      }

      if (served === 'keyword') {
        items = keywordSearch(pack, query).map(({ item }) => toResultItem(item));
      }

      const resultCount = items.length;
      const declined = resultCount === 0;
      const message = declined
        ? (served === 'ai' && modelMessage) || NO_MATCH_MESSAGE
        : served === 'ai'
          ? modelMessage
          : null;
      const variationKey = trackData?.variationKey ?? null;
      const modelName = trackData?.modelName ?? null;
      const tokens = usage?.total ?? null;

      // track(key, context, data, metricValue): data first, numeric value last.
      ldClient.track(
        'ai_search_performed',
        context,
        {
          query,
          resultCount,
          declined,
          served,
          fallbackUsed,
          fallbackReason,
          variationKey,
          modelName,
          invalidIdCount,
        },
        resultCount,
      );

      // Same reason as routes/search.ts: on serverless the isolate can freeze
      // once we respond, so flush the exposure and event before replying.
      try {
        await ldClient.flush();
      } catch (flushErr) {
        console.error('[SearchLab] LD flush failed:', flushErr);
      }
      // The AI SDK's client is a separate instance with its own event queue.
      if (aiEnabled) {
        try {
          await flushAiClient();
        } catch (flushErr) {
          console.error('[SearchLab] AI SDK flush failed:', flushErr);
        }
      }

      res.json({
        served,
        packKey: pack.key,
        items,
        message,
        declined,
        fallbackUsed,
        fallbackReason,
        variationKey,
        modelName,
        tokens,
        latencyMs: Date.now() - started,
      });
    } catch (error) {
      console.error('[SearchLab] Error:', error);
      res.status(500).json({ error: 'Search failed' });
    }
  });

  return router;
}
