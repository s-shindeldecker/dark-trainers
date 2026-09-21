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
}

const ServerSearchLogContext = createContext<ServerSearchLogValue | undefined>(undefined);

export function ServerSearchLogProvider({ children }: { children: ReactNode }) {
  const [lastSearch, setLastSearch] = useState<ServerSearchRecord | undefined>(undefined);

  const recordSearch = useCallback((record: Omit<ServerSearchRecord, 'at'>) => {
    setLastSearch({ ...record, at: Date.now() });
  }, []);

  const clear = useCallback(() => setLastSearch(undefined), []);

  const value = useMemo<ServerSearchLogValue>(
    () => ({ lastSearch, recordSearch, clear }),
    [lastSearch, recordSearch, clear],
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
