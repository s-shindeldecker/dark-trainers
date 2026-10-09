import { Router } from 'express';
import type { LDClient, LDContext } from '@launchdarkly/node-server-sdk';

/**
 * AI search lab — result click tracking. The page posts here on the first
 * click of each result within a search; we record `lab_result_clicked` on the
 * same session-only context the search route (routes/search-lab.ts) uses.
 */

const MAX_ITEM_ID = 100;
const MIN_POSITION = 1;
const MAX_POSITION = 50;
const MIN_QUERY = 2;
const MAX_QUERY = 200;

export function createSearchLabClickRouter(ldClient: LDClient) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { sessionKey, itemId, position, query } = (req.body ?? {}) as {
        sessionKey?: unknown;
        itemId?: unknown;
        position?: unknown;
        query?: unknown;
      };

      if (typeof sessionKey !== 'string' || sessionKey.length === 0) {
        res.status(400).json({ error: 'A sessionKey is required' });
        return;
      }
      if (typeof itemId !== 'string' || itemId.length === 0 || itemId.length > MAX_ITEM_ID) {
        res.status(400).json({ error: `itemId must be 1 to ${MAX_ITEM_ID} characters` });
        return;
      }
      if (
        typeof position !== 'number' ||
        !Number.isInteger(position) ||
        position < MIN_POSITION ||
        position > MAX_POSITION
      ) {
        res
          .status(400)
          .json({ error: `position must be an integer from ${MIN_POSITION} to ${MAX_POSITION}` });
        return;
      }
      if (typeof query !== 'string' || query.length < MIN_QUERY || query.length > MAX_QUERY) {
        res.status(400).json({ error: `query must be ${MIN_QUERY} to ${MAX_QUERY} characters` });
        return;
      }

      // Same inline context as routes/search-lab.ts (not exported there).
      const context: LDContext = { kind: 'session', key: sessionKey };

      // track(key, context, data): no metric value — this is a count metric.
      ldClient.track('lab_result_clicked', context, { itemId, position, query });

      // Flush before replying so the event survives a serverless freeze.
      try {
        await ldClient.flush();
      } catch (flushErr) {
        console.error('[SearchLabClick] LD flush failed:', flushErr);
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('[SearchLabClick] Error:', error);
      res.status(500).json({ error: 'Click failed' });
    }
  });

  return router;
}
