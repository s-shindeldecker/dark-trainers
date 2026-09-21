import styled from '@emotion/styled';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductCard } from '../components/Products/ProductCard';
import { ProductGridSkeleton } from '../components/Products/ProductGridSkeleton';
import { ProductSearchBar } from '../components/Products/ProductSearchBar';
import { products, type Product } from '../components/Products/productData';
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
 */
type RankedProduct = Product & { _score?: number; _purchasable?: boolean };

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

function sortProducts(list: Product[], mode: 'featured' | 'price-low' | 'new', preferredCategory?: string) {
  const arr = [...list];
  if (mode === 'price-low') {
    arr.sort((a, b) => a.price - b.price);
  } else if (mode === 'new') {
    arr.sort((a, b) => (a.releaseDate < b.releaseDate ? 1 : -1));
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
    return sortProducts(visible, mode, preferred);
  }, [sortDefault, dropAccessState, preferred]);

  const runSearch = useCallback(
    async (query: string) => {
      const requestId = ++requestIdRef.current;
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

  const clearSearch = useCallback(() => {
    // Invalidate any in-flight request so its response can't repopulate the grid.
    requestIdRef.current += 1;
    setSearch(IDLE);
  }, []);

  // `search_performed` / `search_zero_results` fire server-side; the click is
  // the one search event the client owns. Value matches `add_to_cart` (price).
  const handleResultClick = useCallback(
    (product: Product) => {
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
                />
              ))}
            </Grid>
          )}
        </>
      ) : (
        <Grid>
          {defaultGrid.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              purchasable={isDropProductPurchasable(p, dropAccessState)}
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
