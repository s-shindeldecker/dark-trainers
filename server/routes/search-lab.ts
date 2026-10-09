import { Router } from 'express';
import type { LDClient, LDContext } from '@launchdarkly/node-server-sdk';
import { keywordSearch } from '../lab/keywordSearch.js';
import { getPack } from '../lab/packRegistry.js';

/**
 * AI search lab — search over a content pack, separate from the storefront
 * search (routes/search.ts) and its ranking experiment.
 *
 * `ai-search-lab` is evaluated per request on a session-only context. Both
 * flag values currently run keyword search; see the note at the branch below.
 */

const FLAG_KEY = 'ai-search-lab';
const DEFAULT_PACK = 'ak-park';
const MIN_QUERY = 2;
const MAX_QUERY = 200;

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

      // Step 2: both flag values run keyword search. `served: 'ai'` only shows
      // the flag wiring works. The AI path arrives in step 3.
      const served: 'keyword' | 'ai' = aiEnabled ? 'ai' : 'keyword';
      const hits = keywordSearch(pack, query);

      const items = hits.map(({ item }) => ({
        id: item.id,
        name: item.name,
        kind: item.kind,
        area: item.area,
        description: item.description,
      }));
      const resultCount = items.length;
      const declined = resultCount === 0;

      // track(key, context, data, metricValue): data first, numeric value last.
      ldClient.track(
        'ai_search_performed',
        context,
        { query, resultCount, declined, served, fallbackUsed: true },
        resultCount,
      );

      // Same reason as routes/search.ts: on serverless the isolate can freeze
      // once we respond, so flush the exposure and event before replying.
      try {
        await ldClient.flush();
      } catch (flushErr) {
        console.error('[SearchLab] LD flush failed:', flushErr);
      }

      res.json({
        served,
        packKey: pack.key,
        items,
        message: declined ? "We couldn't find anything matching that search." : null,
        declined,
        latencyMs: Date.now() - started,
      });
    } catch (error) {
      console.error('[SearchLab] Error:', error);
      res.status(500).json({
        error: 'Search failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
