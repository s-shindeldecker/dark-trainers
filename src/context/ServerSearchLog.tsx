import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * The last server-side search decision, so the demo controls panel can show
 * which `search-ranking-algorithm` arm the backend actually served.
 *
 * Why a context and not a flag read: the search ranking is decided by the Node
 * SDK inside `POST /api/search` and comes back on the response's `_served`
 * field. Reading the flag in the browser to display it would be a second,
 * client-side evaluation of a server-side flag — a different code path that can
 * disagree with what the server served, and an extra exposure event. So the
 * page records what the server reported and the panel displays that.
 *
 * Provided inside ExposureLogProvider in App.tsx purely for hierarchy tidiness;
 * it depends on neither LaunchDarkly nor the user context.
 */

export interface ServerSearchRecord {
  query: string;
  /** Variation key the server served, e.g. 'weighted-relevance'. */
  served: string;
  variationIndex: number | null;
  inExperiment: boolean;
  resultCount: number;
  at: number;
}

interface ServerSearchLogValue {
  /** Most recent search, or undefined until one has run this session. */
  lastSearch: ServerSearchRecord | undefined;
  recordSearch: (record: Omit<ServerSearchRecord, 'at'>) => void;
  clear: () => void;
  /**
   * Whether the PLP renders the served-arm badge beside its results line.
   *
   * Defaults to OFF and is toggled from the demo controls panel: it's stage
   * narration, not product UI, and a real customer looking at the storefront
   * shouldn't see a flag key on the page. Persisted so it survives a reload
   * once it's been switched on for a demo.
   */
  showServedBadge: boolean;
  setShowServedBadge: (visible: boolean) => void;
}

const ServerSearchLogContext = createContext<ServerSearchLogValue | undefined>(undefined);

const BADGE_VISIBLE_KEY = 'dt-show-served-badge';

function readBadgeVisible(): boolean {
  try {
    return localStorage.getItem(BADGE_VISIBLE_KEY) === '1';
  } catch {
    return false;
  }
}

export function ServerSearchLogProvider({ children }: { children: ReactNode }) {
  const [lastSearch, setLastSearch] = useState<ServerSearchRecord | undefined>(undefined);
  const [showServedBadge, setShowServedBadgeState] = useState<boolean>(readBadgeVisible);

  const recordSearch = useCallback((record: Omit<ServerSearchRecord, 'at'>) => {
    setLastSearch({ ...record, at: Date.now() });
  }, []);

  const clear = useCallback(() => setLastSearch(undefined), []);

  const setShowServedBadge = useCallback((visible: boolean) => {
    setShowServedBadgeState(visible);
    try {
      localStorage.setItem(BADGE_VISIBLE_KEY, visible ? '1' : '0');
    } catch {
      /* private browsing — the toggle still works for this page view */
    }
  }, []);

  const value = useMemo<ServerSearchLogValue>(
    () => ({ lastSearch, recordSearch, clear, showServedBadge, setShowServedBadge }),
    [lastSearch, recordSearch, clear, showServedBadge, setShowServedBadge],
  );

  return (
    <ServerSearchLogContext.Provider value={value}>{children}</ServerSearchLogContext.Provider>
  );
}

export function useServerSearchLog(): ServerSearchLogValue {
  const ctx = useContext(ServerSearchLogContext);
  if (!ctx) {
    throw new Error('useServerSearchLog must be used within a ServerSearchLogProvider');
  }
  return ctx;
}
