import { Router } from 'express';
import type { LDClient } from '@launchdarkly/node-server-sdk';
import { ldContextFromBody } from '../ld-context.js';
import {
  DEFAULT_SEARCH_VARIATION,
  SEARCHABLE_COUNT,
  applyDropAccessState,
  isSearchVariation,
  runSearch,
  type SearchRequester,
  type SearchVariation,
} from '../search/ranking.js';
import { getDropAccessState } from '../search/access.js';
import { groupRankedByLine } from '../../src/components/Products/productLines.js';

/**
 * Server-side product search — the demo's "we're upgrading our backend search
 * engine" story.
 *
 * The whole point is that the decision happens *here*, not in the browser:
 * `search-ranking-algorithm` is evaluated with the Node server SDK on every
 * request, the served arm picks the ranking function, and the engagement events
 * the experiment measures are emitted server-side too. The client never
 * evaluates this flag and never decides which ranking it gets.
 *
 * POST rather than GET: the ranking needs the caller's LaunchDarkly context
 * (session key + user attributes) to bucket consistently with the rest of the
 * app, and every other context-carrying route here already POSTs that body
 * shape — see routes/chat.ts and routes/card-creator.ts.
 *
 * Drop entitlement is applied here too, not on the client. The invariant that
 * buys: `search_performed`'s metric value === `results.length` in the response
 * === what the PLP renders. When the PLP filtered the response itself, the event
 * counted ranked hits while the visitor saw fewer, and the guardrail metric
 * disagreed with the screen.
 *
 * Entitlement is three-state (see src/lib/dropAccess.ts): a `view-only` result
 * is returned and counted like any other, carrying `_purchasable: false` so the
 * card renders access-required messaging in place of its CTA.
 */

const FLAG_KEY = 'search-ranking-algorithm';

/** Keep a stray context-less request traceable to this route. */
const ANONYMOUS_FALLBACK_KEY = 'anonymous-search-user';

/** Cap the response so a one-letter query can't return the whole catalog. */
const MAX_RESULTS = 24;

export function createSearchRouter(ldClient: LDClient) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { q, userContext, sessionKey } = req.body as {
        q?: unknown;
        userContext?: Record<string, unknown>;
        sessionKey?: string;
      };

      if (typeof q !== 'string' || q.trim().length === 0) {
        res.status(400).json({ error: 'A search query (q) is required' });
        return;
      }
      const query = q.trim().slice(0, 120);

      // Cast for the same reason the client and card-creator route do: LD's
      // multi-context type doesn't cleanly accept our inferred literal.
      const context = ldContextFromBody(userContext, sessionKey, ANONYMOUS_FALLBACK_KEY) as any;

      // variationDetail (not variation) so the response can report the
      // variation index and whether this evaluation was part of an experiment.
      // This call is also what records the experiment exposure — deliberately
      // at the real decision point, one per search.
      const detail = await ldClient.variationDetail(FLAG_KEY, context, DEFAULT_SEARCH_VARIATION);
      const variation: SearchVariation = isSearchVariation(detail.value)
        ? detail.value
        : DEFAULT_SEARCH_VARIATION;

      const requester: SearchRequester = {
        memberTier: typeof userContext?.memberTier === 'string' ? userContext.memberTier : undefined,
        preferredCategory:
          typeof userContext?.preferredCategory === 'string'
            ? userContext.preferredCategory
            : undefined,
      };

      const { results: ranked } = runSearch(query, variation, requester);

      // Drop entitlement via the one shared resolver, on the SAME context that
      // chose the ranking arm — no second context, no per-route re-derivation.
      // `ac26-drop-access` targets memberTier on the `user` kind, so a
      // session-only guest falls through to the flag's default.
      const dropAccessState = await getDropAccessState(ldClient, context);

      // hidden → dropped from the list; view-only → kept but marked
      // non-purchasable; full-access → kept and purchasable.
      const entitled = applyDropAccessState(ranked, dropAccessState);

      const capped = entitled.slice(0, MAX_RESULTS);

      // Collapse SKUs that share a photo into one card per declared product line
      // (src/components/Products/productLines.ts), AFTER ranking, entitlement and
      // the cap. The card is whichever member ranked highest in this result set
      // for this arm, so the experiment's reordering stays visible. A line whose
      // every member was hidden never reaches this point. The card carries its
      // own `_purchasable` (the same per-SKU rule as before grouping), and the
      // line's other ranked members ride along in `_variants`.
      const results = groupRankedByLine(capped).map(({ key, lineName, primary, others }) => ({
        ...primary,
        _line: lineName ? { key, name: lineName } : undefined,
        _variants: others.map((p) => ({
          id: p.id,
          name: p.name,
          subtitle: p.subtitle,
          colorway: p.colorway,
          price: p.price,
          memberPrice: p.memberPrice,
          _purchasable: p._purchasable,
        })),
      }));

      // Everything below counts `results` and nothing else: one entry per
      // rendered card, with entitlement, the cap and grouping all applied BEFORE
      // the count is taken. So `search_performed`'s value is always exactly the
      // length of the array the caller receives, and therefore exactly the number
      // of cards the visitor sees. view-only hits are part of that count: they are
      // real results the visitor can see and click, they just can't be bought.
      const resultCount = results.length;

      // Both events fire server-side, as part of handling the request — the
      // client is not responsible for either. `search_performed` carries the
      // result count as its metric value so it works as a volume guardrail.
      ldClient.track('search_performed', context, { query, served: variation }, resultCount);
      // Zero arrives two ways: nothing matched the query, or every hit was in the
      // hidden state. `entitlement` is now strictly the latter — a query whose
      // hits are all view-only returns a real, non-empty result set with blocked
      // purchases, and fires no zero-results event at all.
      if (resultCount === 0) {
        ldClient.track('search_zero_results', context, {
          query,
          served: variation,
          reason: ranked.length === 0 ? 'no_match' : 'entitlement',
        });
      }

      // On serverless the isolate can freeze the moment we respond, so the
      // SDK's timed flush may never run and the exposure + events above would
      // never reach LaunchDarkly. Awaiting a flush here is the same guarantee
      // the card-creator route makes, for the same reason.
      try {
        await ldClient.flush();
      } catch (flushErr) {
        console.error('[Search] LD flush failed:', flushErr);
      }

      res.json({
        query,
        resultCount,
        results,
        _served: {
          variation,
          variationIndex: detail.variationIndex ?? null,
          inExperiment: Boolean(detail.reason?.inExperiment),
          reasonKind: detail.reason?.kind ?? null,
        },
        // Diagnostics for stage narration: how the entitlement gate resolved and
        // how many ranked hits it hid. The client must not re-filter on this —
        // it is already reflected in `results`, and each result carries its own
        // `_purchasable` for the blocked-CTA treatment.
        _entitlement: {
          state: dropAccessState,
          rankedBeforeEntitlement: ranked.length,
          hidden: ranked.length - entitled.length,
          viewOnly: results.filter((r) => !r._purchasable).length,
          // SKUs in the capped list before they collapsed into `results` cards.
          skusBeforeGrouping: capped.length,
        },
      });
    } catch (error) {
      console.error('[Search] Error:', error);
      res.status(500).json({
        error: 'Search failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Catalog size the ranking actually covers. Handy for confirming on stage that
  // the server is searching the expanded catalog, not a stale bundle.
  router.get('/info', (_req, res) => {
    res.json({ flagKey: FLAG_KEY, searchableProducts: SEARCHABLE_COUNT });
  });

  return router;
}
