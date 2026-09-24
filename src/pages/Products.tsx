import styled from '@emotion/styled';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductCard } from '../components/Products/ProductCard';
import { ProductGridSkeleton } from '../components/Products/ProductGridSkeleton';
import { ProductSearchBar } from '../components/Products/ProductSearchBar';
import { products, type Product } from '../components/Products/productData';
import { buildProductLines, type ProductLine } from '../components/Products/productLines';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { useTrackConversion } from '../hooks/useTrackConversion';
import { LD_FLAGS } from '../lib/ldFlagKeys';
import {
  dropAccessStateFromFlag,
  isDropProductPurchasable,
  isDropProductVisible,
} from '../lib/dropAccess';
import { isIdentifiedUser } from '../types/darktrainers';
import { useUser } from '../context/UserContext';
import { userToApiContext } from '../context/LDContext';
import { useServerSearchLog } from '../context/ServerSearchLog';

/**
 * A product as returned by /api/search: the catalog shape, its rank score, and
 * the server's own entitlement verdict. `_purchasable` is authoritative — the
 * server resolved it on the context it evaluated the ranking flag with, so the
 * card must not second-guess it from a client flag read.
 *
 * Each result is one card: the server has already collapsed SKUs that share a
 * photo into their product line, with the highest-ranked member as the result
 * itself and the line's other matching members in `_variants`.
 */
type RankedProduct = Product & {
  _score?: number;
  _purchasable?: boolean;
  _variants?: Array<{
    id: string;
    name: string;
    subtitle?: string;
    colorway: string;
    price: number;
    memberPrice: number;
    _purchasable: boolean;
  }>;
};

interface SearchState {
  status: 'idle' | 'loading' | 'done' | 'error';
  query: string;
  results: RankedProduct[];
  /**
   * The arm the server reported for *this* result set. Held here rather than
   * read back off the shared log so the badge can never describe one search
   * while the grid below it shows another.
   */
  served?: string;
  variationIndex?: number | null;
  inExperiment?: boolean;
}

const IDLE: SearchState = { status: 'idle', query: '', results: [] };

/**
 * Typeahead state, separate from the grid's `SearchState`.
 *
 * The dropdown and the grid answer different questions — "what might I mean"
 * vs "what did I search for" — and conflating them made the grid flicker on
 * every keystroke.
 */
interface SuggestState {
  /** Presentation the server chose for this visitor's arm. */
  mode: 'submit' | 'typeahead' | undefined;
  /** The query these suggestions belong to. */
  query: string;
  suggestions: RankedProduct[];
  /** Full result count for the query, so the panel can offer "see all N". */
  total: number;
  served?: string;
}

const NO_SUGGESTIONS: SuggestState = { mode: undefined, query: '', suggestions: [], total: 0 };

/**
 * Trailing-edge debounce. Requests go out once typing pauses, not once per
 * keystroke — which is what makes it safe to reuse /api/search for suggestions:
 * one request per pause means one `search_performed` per completed search
 * intent, comparable to one submit in the control arm.
 */
const SUGGEST_DEBOUNCE_MS = 350;

/** The ranking tokenizer ignores single characters, so don't bother asking. */
const MIN_SUGGEST_LENGTH = 2;

const PageContainer = styled.div`
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  box-sizing: border-box;
`;

const Title = styled.h1`
  font-size: clamp(2rem, 5vw, 3.25rem);
  margin: 0 0 0.35rem;
  text-align: center;
`;

const Subtitle = styled.p`
  text-align: center;
  color: #a3a3a3;
  max-width: 520px;
  margin: 0 auto 2rem;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
  width: 100%;
`;

const Banner = styled.div`
  text-align: center;
  margin-top: 2.5rem;
  padding: 1.5rem;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
`;

const ResultsNote = styled.p`
  text-align: center;
  color: #a3a3a3;
  font-size: 0.85rem;
  margin: 0 auto 1.5rem;
`;

/**
 * Served-arm badge, shown beside the results line when the demo panel's
 * "show on page" toggle is on. Sized to be legible from the back of a room —
 * this exists so the served variation can be narrated live on stage.
 */
const ServedRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  margin: -1rem auto 1.5rem;
`;

const ServedChip = styled.code`
  font-size: 0.95rem;
  font-weight: 700;
  color: #c8f000;
  background: rgba(200, 240, 0, 0.08);
  border: 1px solid #4d5c00;
  border-radius: 999px;
  padding: 0.2rem 0.7rem;
`;

const ServedVar = styled.span`
  font-size: 0.8rem;
  color: #737373;
  font-variant-numeric: tabular-nums;
`;

const ServedExpTag = styled.span<{ $inExperiment: boolean }>`
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  color: ${({ $inExperiment }) => ($inExperiment ? '#c8f000' : '#666')};
  border: 1px solid ${({ $inExperiment }) => ($inExperiment ? '#4d5c00' : '#333')};
  background: ${({ $inExperiment }) => ($inExperiment ? 'rgba(200, 240, 0, 0.08)' : 'transparent')};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 1.5rem;
  background: #111;
  border: 1px dashed #333;
  border-radius: 12px;
  color: #a3a3a3;
`;

/**
 * Sorts the grouped cards, not the raw SKUs — grouping happens first, so the
 * sort has to operate on lines or the order would be discarded when members
 * collapse. Each mode reads the line-level equivalent of the SKU field:
 * `priceFrom` for price, the newest member for recency.
 */
function sortLines(
  lines: ProductLine[],
  mode: 'featured' | 'price-low' | 'new',
  preferredCategory?: string,
) {
  const arr = [...lines];
  if (mode === 'price-low') {
    arr.sort((a, b) => a.priceFrom - b.priceFrom);
  } else if (mode === 'new') {
    const newest = (l: ProductLine) =>
      l.members.reduce((max, p) => (p.releaseDate > max ? p.releaseDate : max), '');
    arr.sort((a, b) => (newest(a) < newest(b) ? 1 : -1));
  } else if (preferredCategory) {
    arr.sort((a, b) => {
      const aFirst = a.category === preferredCategory ? 0 : 1;
      const bFirst = b.category === preferredCategory ? 0 : 1;
      return aFirst - bFirst;
    });
  }
  return arr;
}


export default function Products() {
  const { value: sortDefault } = useFeatureFlag(LD_FLAGS.plpSortDefault, 'featured');
  const { value: ac26DropAccess } = useFeatureFlag(LD_FLAGS.ac26DropAccess, 'teaser');
  const { user, sessionKey } = useUser();
  const { trackConversion } = useTrackConversion();
  const { recordSearch, showServedBadge } = useServerSearchLog();
  const preferred = isIdentifiedUser(user) ? user.preferredCategory : undefined;
  const [search, setSearch] = useState<SearchState>(IDLE);
  const [suggest, setSuggest] = useState<SuggestState>(NO_SUGGESTIONS);
  const suggestTimerRef = useRef<number | undefined>(undefined);
  const suggestRequestRef = useRef(0);
  // The served mode, in a ref as well as state. A queued debounce callback
  // closes over the value from when the keystroke happened; if the first
  // response lands in that window and says `submit`, the closure would still
  // fire a request the control arm should never make.
  const suggestModeRef = useRef<SuggestState['mode']>(undefined);
  suggestModeRef.current = suggest.mode;

  // Only the newest request may write state. Without this, a slow "volt" can
  // land after a fast "limited" and show results for a query the box no longer
  // contains.
  const requestIdRef = useRef(0);

  /**
   * Drop-access state for the DEFAULT CATALOG GRID — the browser's own read of
   * `ac26-drop-access`, mapped through the shared table in lib/dropAccess.
   *
   * Search results are deliberately NOT gated here. The server applies the same
   * three states via its own resolver before it counts results and fires
   * `search_performed`; re-deriving entitlement from this client value would
   * reintroduce the exact drift that made the metric disagree with the screen —
   * a cached, non-eventing client read can differ from the server's live
   * evaluation. Search results render verbatim and use the server's
   * `_purchasable`.
   */
  const dropAccessState = dropAccessStateFromFlag(ac26DropAccess);

  const defaultGrid = useMemo(() => {
    const mode = (['featured', 'price-low', 'new'] as const).includes(sortDefault as any)
      ? (sortDefault as 'featured' | 'price-low' | 'new')
      : 'featured';
    // Collectibles live in the shared products array but have their own catalog page.
    const sneakers = products.filter((product) => product.category !== 'collectibles');
    // hidden → drop-exclusives excluded outright; view-only and full-access both
    // render, and the card decides the CTA from `purchasable` below. Gating is on
    // isDropExclusive, not tag text — see lib/dropAccess for why that matters.
    const visible = sneakers.filter((product) => isDropProductVisible(product, dropAccessState));
    // Group before sorting: several SKUs share one photograph, and showing the
    // same shoe four times is what this collapses. A line whose every member is
    // hidden by entitlement simply never appears.
    return sortLines(buildProductLines(visible), mode, preferred);
  }, [sortDefault, dropAccessState, preferred]);

  const runSearch = useCallback(
    async (query: string) => {
      const requestId = ++requestIdRef.current;
      // Submitting supersedes any queued suggestion request. Without this, a
      // pause that ends in Enter fires both — two requests and two
      // `search_performed` events for one search.
      window.clearTimeout(suggestTimerRef.current);
      suggestRequestRef.current += 1;
      setSearch({ status: 'loading', query, results: [] });

      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: query,
            userContext: userToApiContext(user),
            sessionKey,
          }),
        });

        if (!res.ok) throw new Error(`Search failed with status ${res.status}`);

        const data = (await res.json()) as {
          query: string;
          resultCount: number;
          results: RankedProduct[];
          _served: {
            variation: string;
            variationIndex: number | null;
            inExperiment: boolean;
          };
        };

        if (requestId !== requestIdRef.current) return;

        setSearch({
          status: 'done',
          query,
          results: data.results ?? [],
          served: data._served?.variation,
          variationIndex: data._served?.variationIndex ?? null,
          inExperiment: Boolean(data._served?.inExperiment),
        });
        // The served arm is decided by the Node SDK inside the route; the panel
        // shows what the server reported rather than re-evaluating the flag here.
        recordSearch({
          query: data.query ?? query,
          served: data._served?.variation ?? 'unknown',
          variationIndex: data._served?.variationIndex ?? null,
          inExperiment: Boolean(data._served?.inExperiment),
          resultCount: data.resultCount ?? data.results?.length ?? 0,
        });
      } catch (error) {
        console.error('[PLP] Search request failed:', error);
        if (requestId !== requestIdRef.current) return;
        setSearch({ status: 'error', query, results: [] });
      }
    },
    [user, sessionKey, recordSearch],
  );

  /**
   * Debounced suggestion fetch, on the trailing edge of a typing burst.
   *
   * Reuses POST /api/search rather than a dedicated suggest endpoint: the
   * server already ranks, applies entitlement, counts, and emits the events
   * there, and a second endpoint would have meant a second copy of all of it.
   * Debouncing is what makes that safe — one request per pause, not per key.
   *
   * The response's `mode` is the server telling us whether this visitor's arm
   * wants typeahead. Once it says `submit` (the control arm) we stop asking
   * altogether, so a control visitor makes exactly one extra request per
   * search session and never sees a dropdown flash.
   */
  const requestSuggestions = useCallback(
    (query: string) => {
      window.clearTimeout(suggestTimerRef.current);
      const trimmed = query.trim();

      if (trimmed.length < MIN_SUGGEST_LENGTH) {
        // Clear the query rather than recording the short one. Writing it would
        // make the panel's freshness check pass with an empty list, rendering
        // "No matches" for a query that was never sent — the ranking tokenizer
        // ignores single characters, so there is nothing to ask for.
        setSuggest((prev) => ({ ...prev, query: '', suggestions: [], total: 0 }));
        return;
      }
      // Control arm: the server has already said this visitor doesn't get
      // typeahead. Stop making requests entirely.
      if (suggestModeRef.current === 'submit') return;

      suggestTimerRef.current = window.setTimeout(async () => {
        // Re-check: the arm may have been revealed while this was queued.
        if (suggestModeRef.current === 'submit') return;
        const requestId = ++suggestRequestRef.current;
        try {
          const res = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              q: trimmed,
              userContext: userToApiContext(user),
              sessionKey,
            }),
          });
          if (!res.ok) return;
          const data = (await res.json()) as {
            resultCount: number;
            results: RankedProduct[];
            _served: { variation: string; mode: 'submit' | 'typeahead' };
          };
          // Ignore a response that a newer keystroke has already superseded.
          if (requestId !== suggestRequestRef.current) return;
          setSuggest({
            mode: data._served?.mode,
            query: trimmed,
            suggestions: data.results ?? [],
            total: data.resultCount ?? 0,
            served: data._served?.variation,
          });
        } catch (error) {
          // A failed suggestion is not worth surfacing — the visitor can still
          // submit, which has its own error state.
          console.error('[PLP] Suggestion request failed:', error);
        }
      }, SUGGEST_DEBOUNCE_MS);
    },
    [user, sessionKey],
  );

  // Don't leave a pending request behind on unmount.
  useEffect(() => () => window.clearTimeout(suggestTimerRef.current), []);

  // Reset everything suggestion-related when the visitor changes.
  //
  // `mode` is a property of the LaunchDarkly context, not of the query: a
  // previous visitor's `submit` would otherwise block typeahead for a new one
  // who is entitled to it. And stale suggestions can contain products the new
  // visitor is not entitled to see — a VIP's drop-exclusive hits must not
  // linger in the panel after switching to a guest.
  useEffect(() => {
    window.clearTimeout(suggestTimerRef.current);
    suggestRequestRef.current += 1;
    setSuggest(NO_SUGGESTIONS);
  }, [user.key, sessionKey]);

  const clearSearch = useCallback(() => {
    // Invalidate any in-flight request so its response can't repopulate the grid.
    requestIdRef.current += 1;
    window.clearTimeout(suggestTimerRef.current);
    suggestRequestRef.current += 1;
    setSearch(IDLE);
    // Keep `mode` — it's a property of this visitor's arm, not of the query,
    // and re-learning it would cost another request on the next keystroke.
    setSuggest((prev) => ({ ...NO_SUGGESTIONS, mode: prev.mode, served: prev.served }));
  }, []);

  // `search_performed` / `search_zero_results` fire server-side; the click is
  // the one search event the client owns. Value matches `add_to_cart` (price).
  const handleResultClick = useCallback(
    // Takes just id + price so a grouped card's sibling link can report the
    // exact SKU opened, not the card's ranked member.
    (product: Pick<Product, 'id' | 'price'>) => {
      trackConversion('search_result_clicked', { value: product.price, productId: product.id });
    },
    [trackConversion],
  );

  const isSearchActive = search.status !== 'idle';

  return (
    <PageContainer>
      <Title className="font-display">Current drops</Title>
      <Subtitle>Limited releases across running, hoops, lifestyle, and training. VIP unlocks early windows and member pricing when flags are on.</Subtitle>
      <ProductSearchBar
        onSearch={runSearch}
        onClear={clearSearch}
        isSearching={search.status === 'loading'}
        hasResults={isSearchActive}
        onQueryChange={requestSuggestions}
        mode={suggest.mode}
        suggestions={suggest.suggestions}
        suggestionsQuery={suggest.query}
        totalSuggestionCount={suggest.total}
        onSuggestionSelect={handleResultClick}
        servedArm={suggest.served}
        showServedBadge={showServedBadge}
      />
      {search.status === 'loading' ? (
        <ProductGridSkeleton />
      ) : search.status === 'error' ? (
        <EmptyState>
          <p style={{ margin: 0 }}>Search is unavailable right now. Showing nothing rather than a guess — try again.</p>
        </EmptyState>
      ) : search.status === 'done' ? (
        <>
          {/*
            Rendered straight off `search.results` — the server already applied
            ranking, entitlement, and the response cap, and counted exactly this
            array for `search_performed`. Any filtering added here would break
            that agreement.
          */}
          <ResultsNote>
            {search.results.length === 0
              ? `No matches for “${search.query}”.`
              : `${search.results.length} ${search.results.length === 1 ? 'result' : 'results'} for “${search.query}”, ranked server-side.`}
          </ResultsNote>
          {showServedBadge && search.served && (
            <ServedRow>
              <ServedVar>ranked by</ServedVar>
              <ServedChip title="ac26-drop-access is separate; this is the ranking arm">
                {search.served}
              </ServedChip>
              <ServedVar>#{search.variationIndex ?? '?'}</ServedVar>
              <ServedExpTag $inExperiment={Boolean(search.inExperiment)}>
                {search.inExperiment ? 'in exp' : 'no exp'}
              </ServedExpTag>
            </ServedRow>
          )}
          {search.results.length === 0 ? (
            <EmptyState>
              <p style={{ margin: 0 }}>Try a broader term — a silhouette (“volt”, “apex”), a category (“running”), or a tag (“limited”).</p>
            </EmptyState>
          ) : (
            <Grid>
              {search.results.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onSelect={handleResultClick}
                  // The server's verdict, not a client re-derivation. Absent
                  // (an older response shape) means purchasable.
                  purchasable={p._purchasable !== false}
                  variants={p._variants}
                />
              ))}
            </Grid>
          )}
        </>
      ) : (
        <Grid>
          {defaultGrid.map((l) => (
            <ProductCard
              key={l.key}
              product={l.primary}
              purchasable={isDropProductPurchasable(l.primary, dropAccessState)}
              line={
                l.isSingle
                  ? undefined
                  : {
                      name: l.name,
                      modelCount: l.members.length,
                      priceFrom: l.priceFrom,
                      memberPriceFrom: l.memberPriceFrom,
                    }
              }
            />
          ))}
        </Grid>
      )}
      <Banner>
        <p style={{ margin: '0 0 0.75rem', color: '#d4d4d4' }}>Want early access to new drops and member-only offers?</p>
        <Link to="/signup" style={{ fontWeight: 700 }}>
          Become a member
        </Link>
      </Banner>
    </PageContainer>
  );
}
