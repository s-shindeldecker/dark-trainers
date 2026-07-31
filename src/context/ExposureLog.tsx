import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { useContextVersion } from './ContextVersion';

/**
 * Deferred experiment exposure.
 *
 * Flag *values* are preloaded app-wide without exposure via the non-eventing
 * `useFeatureFlag` (backed by `ldClient.allFlags()`, which sends no analytics
 * events in the React SDK). An experiment exposure is only recorded when we
 * deliberately call `ldClient.variationDetail()` at the feature's real decision
 * point — e.g. when the cart drawer opens or the promo banner actually renders.
 *
 * This module provides that deliberate-exposure path plus a small in-memory log
 * so the demo panel can show, live, that exposures fire only at the funnel.
 */

export interface ExposureRecord {
  flagKey: string;
  value: unknown;
  variationIndex: number | undefined;
  inExperiment: boolean;
  reasonKind: string | undefined;
  at: number;
}

interface ExposureLogValue {
  exposures: ExposureRecord[];
  /** Evaluate `flagKey` via `variationDetail` (generates the exposure event) and log it. */
  recordExposure: (flagKey: string, defaultValue?: unknown) => ExposureRecord | undefined;
  clear: () => void;
}

const MAX_RECORDS = 25;

const ExposureLogContext = createContext<ExposureLogValue | undefined>(undefined);

export function ExposureLogProvider({ children }: { children: ReactNode }) {
  const ldClient = useLDClient();
  const [exposures, setExposures] = useState<ExposureRecord[]>([]);
  const [ready, setReady] = useState(false);

  // Track SDK readiness. Recording before the client has initialized would make
  // variationDetail() return the fallback with a CLIENT_NOT_READY reason and
  // miscount the funnel visit. When this flips true, recordExposure's identity
  // changes (it depends on `ready`), so callers whose effects depend on it re-run
  // and retry any exposure that was skipped while the client was still loading.
  useEffect(() => {
    if (!ldClient) {
      setReady(false);
      return;
    }
    let cancelled = false;
    ldClient
      .waitForInitialization()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        /* init failed; leave ready=false so we never record a bogus exposure */
      });
    return () => {
      cancelled = true;
    };
  }, [ldClient]);

  const recordExposure = useCallback(
    (flagKey: string, defaultValue: unknown = false): ExposureRecord | undefined => {
      // Not ready yet → return undefined so the caller can retry once readiness
      // flips (this callback's identity changes when `ready` does).
      if (!ldClient || !ready) return undefined;
      // variationDetail() is the call that emits the evaluation event LD counts
      // as an experiment exposure. Everything else in the app reads non-eventing.
      const detail = ldClient.variationDetail(flagKey, defaultValue);
      const record: ExposureRecord = {
        flagKey,
        value: detail.value,
        variationIndex: detail.variationIndex ?? undefined,
        inExperiment: Boolean(detail.reason?.inExperiment),
        reasonKind: detail.reason?.kind,
        at: Date.now(),
      };
      setExposures((prev) => {
        // Collapse an identical exposure that arrives within a tiny window. This
        // keeps the demo log clean under React StrictMode's dev-only double-invoke
        // of effects (the underlying variationDetail event fires twice in dev, but
        // LD dedupes experiment exposures per context, and prod fires once). Genuine
        // re-exposures — reopening the cart, re-showing the banner — are seconds
        // apart and still logged.
        const last = prev[0];
        if (
          last &&
          last.flagKey === record.flagKey &&
          last.variationIndex === record.variationIndex &&
          record.at - last.at < 300
        ) {
          return prev;
        }
        return [record, ...prev].slice(0, MAX_RECORDS);
      });
      return record;
    },
    [ldClient, ready],
  );

  const clear = useCallback(() => setExposures([]), []);

  const value = useMemo<ExposureLogValue>(
    () => ({ exposures, recordExposure, clear }),
    [exposures, recordExposure, clear],
  );

  return <ExposureLogContext.Provider value={value}>{children}</ExposureLogContext.Provider>;
}

export function useExposureLog(): ExposureLogValue {
  const ctx = useContext(ExposureLogContext);
  if (!ctx) {
    throw new Error('useExposureLog must be used within an ExposureLogProvider');
  }
  return ctx;
}

/**
 * Imperative recorder for event-driven decision points (e.g. "cart drawer
 * opened"). Returns a stable `recordExposure(flagKey, default)` callback.
 */
export function useExposureRecorder(): ExposureLogValue['recordExposure'] {
  return useExposureLog().recordExposure;
}

/**
 * Declarative exposure for decision points that coincide with a component being
 * shown: mounting this hook records the exposure once (and again if the LD
 * context changes, e.g. anonymous → identified). Use it in a component that only
 * mounts when the experimented feature is actually visible.
 */
export function useFlagExposure(flagKey: string, defaultValue: unknown = false) {
  const recordExposure = useExposureRecorder();
  const contextVersion = useContextVersion();
  const [detail, setDetail] = useState<ExposureRecord | undefined>(undefined);
  const lastKeyRef = useRef<string>('');

  useEffect(() => {
    // Re-expose when the flag key or the LD context changes, but not on every render.
    const guard = `${flagKey}:${contextVersion}`;
    if (lastKeyRef.current === guard) return;
    // Only mark this (flag, context) as exposed once it actually recorded. If the
    // SDK wasn't ready, recordExposure returns undefined and we retry when its
    // identity changes on readiness.
    const record = recordExposure(flagKey, defaultValue);
    if (record) {
      lastKeyRef.current = guard;
      setDetail(record);
    }
    // defaultValue is intentionally not a dependency; it is a constant per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flagKey, contextVersion, recordExposure]);

  return { value: detail?.value, detail };
}
