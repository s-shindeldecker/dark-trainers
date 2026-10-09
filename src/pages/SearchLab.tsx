import styled from '@emotion/styled';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DebugStrip } from '../components/SearchLab/DebugStrip';
import { DeclineCard } from '../components/SearchLab/DeclineCard';
import { ResultCard } from '../components/SearchLab/ResultCard';
import { SearchBar } from '../components/SearchLab/SearchBar';
import { LAB } from '../components/SearchLab/palette';
import { getOrCreateLdSessionKey } from '../lib/ldSessionKey';
import { searchLab, type SearchLabResponse } from '../lib/searchLabApi';

/**
 * AI search lab page (/search-lab). Unlinked from the storefront nav; talks
 * only to POST /api/search-lab. No click tracking yet.
 */

type LabState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; data: SearchLabResponse }
  | { status: 'error'; message: string };

const Page = styled.div`
  min-height: 100%;
  padding: 2rem 16px 3rem;
  background: ${LAB.pageBg};
  color: ${LAB.ink};
  box-sizing: border-box;
`;

const Column = styled.div`
  width: 100%;
  max-width: 390px;
  margin: 0 auto;
`;

const Title = styled.h1`
  margin: 0 0 1.25rem;
  font-size: 1.5rem;
  font-weight: 700;
  text-align: center;
  color: ${LAB.ink};
`;

const Results = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1.25rem;
`;

const SkeletonCard = styled.div`
  height: 104px;
  border-radius: 12px;
  background: linear-gradient(
    90deg,
    ${LAB.skeleton} 25%,
    ${LAB.skeletonHighlight} 50%,
    ${LAB.skeleton} 75%
  );
  background-size: 200% 100%;
  animation: search-lab-loading 1.5s infinite;

  @keyframes search-lab-loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const Elapsed = styled.p`
  margin: 0;
  font-size: 0.82rem;
  text-align: center;
  color: ${LAB.inkMuted};
  font-variant-numeric: tabular-nums;
`;

const ErrorBox = styled.div`
  padding: 0.85rem 1rem;
  font-size: 0.92rem;
  color: ${LAB.errorInk};
  background: ${LAB.errorBg};
  border: 1px solid ${LAB.errorBorder};
  border-radius: 12px;
`;

function useElapsedSeconds(running: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setSeconds(0);
    if (!running) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);
  return seconds;
}

export default function SearchLab() {
  const [state, setState] = useState<LabState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  const elapsed = useElapsedSeconds(state.status === 'loading');

  useEffect(() => () => abortRef.current?.abort(), []);

  const runSearch = useCallback(async (query: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'loading' });

    // Read per request: the key can be rotated (guest reset) while on the page.
    const result = await searchLab(query, getOrCreateLdSessionKey(), controller.signal);
    if (controller.signal.aborted) return;

    if (result.ok) {
      setState({ status: 'done', data: result.data });
    } else {
      setState({
        status: 'error',
        message: `Sorry, the search didn't work (${result.error.message}). Please try again.`,
      });
    }
  }, []);

  return (
    <Page>
      <Column>
        <Title>Animal Kingdom Search (demo)</Title>
        <SearchBar onSearch={runSearch} />

        {state.status === 'loading' && (
          <Results aria-busy="true">
            <Elapsed>Searching… {elapsed}s</Elapsed>
            <SkeletonCard aria-hidden="true" />
            <SkeletonCard aria-hidden="true" />
            <SkeletonCard aria-hidden="true" />
          </Results>
        )}

        {state.status === 'error' && (
          <Results>
            <ErrorBox role="alert">{state.message}</ErrorBox>
          </Results>
        )}

        {state.status === 'done' && (
          <>
            <Results>
              {state.data.declined ? (
                <DeclineCard message={state.data.message} />
              ) : (
                state.data.items.map((item) => <ResultCard key={item.id} item={item} />)
              )}
            </Results>
            <DebugStrip data={state.data} />
          </>
        )}
      </Column>
    </Page>
  );
}
