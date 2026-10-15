import { Fragment, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import styled from '@emotion/styled';
import {
  DEFAULT_SIM_SETTINGS,
  REGRESSION_LATENCY,
  SIM_LIMITS,
  buildSearchBody,
  clampLatencyMs,
  clampSetting,
  clampSettings,
  createStats,
  parseServedVariation,
  pickQuery,
  pickVisitor,
  recordOutcome,
  regressionLabel,
  searchRequestHeaders,
  summarize,
  type RegressionMode,
  type SimOutcome,
  type SimSettingKey,
  type SimSettings,
  type SimSummary,
  type SimVisitor,
} from './trafficSim';

/**
 * Guarded-release demo controls: a browser-side traffic simulator that drives
 * the real `POST /api/search` (same-origin, so it works on the Vercel deploy),
 * and a regression control that tags simulated requests with
 * `x-demo-regression`. The server applies the marker only on its target arm —
 * see server/routes/search.ts — so a guarded rollout has a real regression to
 * catch. Only requests sent from here ever carry the header.
 *
 * `useTrafficSimulator` runs at the top of DemoControlsPanel (which stays
 * mounted), so collapsing the panel doesn't stop a run.
 */

const SEARCH_URL = '/api/search';
const REQUEST_TIMEOUT_MS = 15_000;
const UI_REFRESH_MS = 500;

type Draft = Record<SimSettingKey, string>;

function draftFrom(settings: SimSettings): Draft {
  return {
    rps: String(settings.rps),
    maxInFlight: String(settings.maxInFlight),
    searchesPerVisitor: String(settings.searchesPerVisitor),
    maxDurationMin: String(settings.maxDurationMin),
    poolSize: String(settings.poolSize),
  };
}

export type TrafficSimulator = ReturnType<typeof useTrafficSimulator>;

export function useTrafficSimulator() {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(DEFAULT_SIM_SETTINGS));
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [regression, setRegressionState] = useState<RegressionMode>({ mode: 'off' });
  const [latencyDraft, setLatencyDraft] = useState(String(REGRESSION_LATENCY.default));
  const [summary, setSummary] = useState<SimSummary>(() => summarize(createStats()));
  const [hidden, setHidden] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );

  const runIdRef = useRef(0);
  const runningRef = useRef(false);
  const settingsRef = useRef<SimSettings>(DEFAULT_SIM_SETTINGS);
  const regressionRef = useRef<RegressionMode>({ mode: 'off' });
  const statsRef = useRef(createStats());
  const visitorRef = useRef<SimVisitor | null>(null);
  const inFlightRef = useRef(new Set<AbortController>());
  const timersRef = useRef<{ tick?: number; ui?: number; deadline?: number }>({});

  const setRegression = useCallback((next: RegressionMode) => {
    regressionRef.current = next;
    setRegressionState(next);
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    runIdRef.current += 1; // late responses from the old run are discarded
    const timers = timersRef.current;
    window.clearInterval(timers.tick);
    window.clearInterval(timers.ui);
    window.clearTimeout(timers.deadline);
    timersRef.current = {};
    inFlightRef.current.forEach((controller) => controller.abort());
    inFlightRef.current.clear();
    visitorRef.current = null;
    setRegression({ mode: 'off' });
    setRunning(false);
    setSummary(summarize(statsRef.current));
  }, [setRegression]);

  const sendOne = useCallback(() => {
    if (!runningRef.current) return;
    const settings = settingsRef.current;
    const stats = statsRef.current;
    if (inFlightRef.current.size >= settings.maxInFlight) {
      stats.skipped += 1;
      return;
    }

    let visitor = visitorRef.current;
    if (!visitor || visitor.remaining <= 0) visitor = pickVisitor(settings);
    visitor.remaining -= 1;
    // Retire after its last search; the next tick picks a new pool user.
    visitorRef.current = visitor.remaining > 0 ? visitor : null;

    const runId = runIdRef.current;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    inFlightRef.current.add(controller);
    stats.sent += 1;

    // Header chosen at send time, so a regression change affects only later sends.
    const headers = searchRequestHeaders(regressionRef.current);
    const body = JSON.stringify(buildSearchBody(visitor, pickQuery()));
    const t0 = performance.now();

    const finish = (outcome: SimOutcome | null) => {
      window.clearTimeout(timeout);
      inFlightRef.current.delete(controller);
      if (outcome && runId === runIdRef.current) recordOutcome(statsRef.current, outcome);
    };

    void (async () => {
      try {
        const res = await fetch(SEARCH_URL, { method: 'POST', headers, body, signal: controller.signal });
        const applied = res.headers.has('x-demo-regression-applied');
        let variation: string | null = null;
        if (res.status === 200) {
          try {
            variation = parseServedVariation(await res.json());
          } catch {
            variation = null;
          }
        } else {
          // Drain without reading it into memory we keep; the body isn't needed.
          res.body?.cancel().catch(() => {});
        }
        finish({ kind: 'response', status: res.status, latencyMs: performance.now() - t0, applied, variation });
      } catch {
        // Aborted by Stop → not a failure. Timeout or network error → other failure.
        const stoppedByUser = controller.signal.aborted && !timedOut;
        finish(stoppedByUser ? null : { kind: 'failure', latencyMs: performance.now() - t0 });
      }
    })();
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    const settings = clampSettings(draft);
    setDraft(draftFrom(settings));
    settingsRef.current = settings;
    statsRef.current = createStats();
    visitorRef.current = null;
    runIdRef.current += 1;
    runningRef.current = true;
    setRegression({ mode: 'off' });

    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    setSummary(summarize(statsRef.current));
    setRunning(true);

    timersRef.current = {
      tick: window.setInterval(sendOne, Math.max(50, Math.round(1000 / settings.rps))),
      ui: window.setInterval(() => {
        setSummary(summarize(statsRef.current));
        setNow(Date.now());
      }, UI_REFRESH_MS),
      deadline: window.setTimeout(stop, settings.maxDurationMin * 60_000),
    };
  }, [draft, sendOne, setRegression, stop]);

  // Stop on unmount and on page unload; track tab visibility for the warning.
  useEffect(() => {
    const onPageHide = () => stop();
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [stop]);

  /** Regression control is live only while running. */
  const chooseRegression = useCallback(
    (mode: RegressionMode['mode']) => {
      if (!runningRef.current) return;
      if (mode === 'latency') {
        const ms = clampLatencyMs(latencyDraft);
        setLatencyDraft(String(ms));
        setRegression({ mode: 'latency', ms });
      } else {
        setRegression(mode === 'error' ? { mode: 'error' } : { mode: 'off' });
      }
    },
    [latencyDraft, setRegression],
  );

  const commitLatency = useCallback(() => {
    const ms = clampLatencyMs(latencyDraft);
    setLatencyDraft(String(ms));
    if (runningRef.current && regressionRef.current.mode === 'latency') {
      setRegression({ mode: 'latency', ms });
    }
  }, [latencyDraft, setRegression]);

  const commitSetting = useCallback((key: SimSettingKey) => {
    setDraft((d) => ({ ...d, [key]: String(clampSetting(key, d[key])) }));
  }, []);

  return {
    draft,
    setDraft,
    commitSetting,
    running,
    elapsedMs: running && startedAt !== null ? now - startedAt : 0,
    regression,
    chooseRegression,
    latencyDraft,
    setLatencyDraft,
    commitLatency,
    summary,
    hidden,
    start,
    stop,
  };
}

// ---------------------------------------------------------------------------
// UI — styles mirror DemoControlsPanel's local styled components.

const Section = styled.div`
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid #2a2a2a;
`;

const Toggle = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 0.5rem;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #737373;
  &:hover {
    color: #a3a3a3;
  }
`;

const Body = styled.div`
  max-height: 55vh;
  overflow-y: auto;
  margin-top: 0.35rem;
`;

const SubLabel = styled.div`
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #666;
  margin: 0.45rem 0 0.25rem;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.3rem;
  flex-wrap: wrap;
`;

const Btn = styled.button<{ $active?: boolean }>`
  font-size: 0.7rem;
  padding: 0.25rem 0.55rem;
  background: ${({ $active }) => ($active ? 'rgba(200, 240, 0, 0.12)' : '#1a1a1a')};
  color: ${({ $active }) => ($active ? '#c8f000' : '#f5f5f5')};
  border: 1px solid ${({ $active }) => ($active ? '#4d5c00' : '#333')};
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) {
    border-color: #c8f000;
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const SettingGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 4.2rem;
  gap: 0.2rem 0.4rem;
  align-items: center;
  font-size: 0.72rem;
`;

const NumInput = styled.input`
  box-sizing: border-box;
  width: 100%;
  font-size: 0.72rem;
  padding: 0.1rem 0.25rem;
  background: #1a1a1a;
  color: #f5f5f5;
  border: 1px solid #333;
  border-radius: 4px;
  &:disabled {
    opacity: 0.5;
  }
`;

const Banner = styled.div<{ $tone: 'idle' | 'ok' | 'warn' }>`
  font-size: 0.72rem;
  padding: 0.3rem 0.45rem;
  border-radius: 6px;
  margin-bottom: 0.35rem;
  border: 1px solid
    ${({ $tone }) => ($tone === 'warn' ? '#7a4a00' : $tone === 'ok' ? '#4d5c00' : '#333')};
  color: ${({ $tone }) => ($tone === 'warn' ? '#ffb020' : $tone === 'ok' ? '#c8f000' : '#a3a3a3')};
  background: ${({ $tone }) =>
    $tone === 'warn' ? 'rgba(255, 176, 32, 0.08)' : $tone === 'ok' ? 'rgba(200, 240, 0, 0.06)' : 'transparent'};
`;

const Stats = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.1rem 0.5rem;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  & > span:nth-of-type(even) {
    color: #f5f5f5;
    text-align: right;
  }
`;

const Hint = styled.p`
  margin: 0.35rem 0 0;
  font-size: 0.7rem;
  line-height: 1.35;
  color: #666;
`;

const SETTING_FIELDS: { key: SimSettingKey; label: string }[] = [
  { key: 'rps', label: 'Requests / sec' },
  { key: 'maxInFlight', label: 'Max in flight' },
  { key: 'searchesPerVisitor', label: 'Searches / visitor' },
  { key: 'poolSize', label: 'User pool size' },
  { key: 'maxDurationMin', label: 'Max duration (min)' },
];

function fmtMs(ms: number | null): string {
  return ms === null ? '—' : `${Math.round(ms)} ms`;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, '0')}s`;
}

export function GuardedReleaseSection({ sim }: { sim: TrafficSimulator }) {
  const [open, setOpen] = useState(false);
  const { draft, running, regression, summary } = sim;
  const arms = Object.entries(summary.arms).sort((a, b) => b[1] - a[1]);

  const onDraft = (key: SimSettingKey) => (e: ChangeEvent<HTMLInputElement>) =>
    sim.setDraft((d) => ({ ...d, [key]: e.target.value }));

  return (
    <Section>
      <Toggle
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Toggle guarded-release controls"
      >
        <span>{open ? '▾' : '▸'} Guarded release sim</span>
        <span style={{ color: running ? '#c8f000' : '#666', letterSpacing: 'normal' }}>
          {running ? `● ${regression.mode === 'off' ? 'running' : regressionLabel(regression)}` : 'idle'}
        </span>
      </Toggle>
      {open && (
        <Body>
          <Banner $tone={!running ? 'idle' : regression.mode === 'off' ? 'ok' : 'warn'} role="status">
            {running ? `Simulation running · ${fmtElapsed(sim.elapsedMs)}` : 'Simulation idle'} ·
            Regression {regressionLabel(regression)}
          </Banner>
          {running && sim.hidden && (
            <Banner $tone="warn" role="alert">
              This tab is in the background. Browsers throttle background timers, so the request
              rate will drop until you return.
            </Banner>
          )}

          <Row>
            <Btn type="button" onClick={sim.start} disabled={running}>
              ▶ Start
            </Btn>
            <Btn type="button" onClick={sim.stop} disabled={!running}>
              ■ Stop
            </Btn>
          </Row>

          <SettingGrid>
            {SETTING_FIELDS.map(({ key, label }) => (
              <label key={key} style={{ display: 'contents' }}>
                <span title={`${SIM_LIMITS[key].min}–${SIM_LIMITS[key].max}`}>{label}</span>
                <NumInput
                  type="number"
                  inputMode="numeric"
                  min={SIM_LIMITS[key].min}
                  max={SIM_LIMITS[key].max}
                  value={draft[key]}
                  disabled={running}
                  onChange={onDraft(key)}
                  onBlur={() => sim.commitSetting(key)}
                />
              </label>
            ))}
          </SettingGrid>

          <SubLabel>Regression (simulated requests only)</SubLabel>
          <Row>
            <Btn
              type="button"
              $active={running && regression.mode === 'off'}
              disabled={!running}
              onClick={() => sim.chooseRegression('off')}
            >
              Off
            </Btn>
            <Btn
              type="button"
              $active={regression.mode === 'error'}
              disabled={!running}
              onClick={() => sim.chooseRegression('error')}
            >
              Inject errors
            </Btn>
            <Btn
              type="button"
              $active={regression.mode === 'latency'}
              disabled={!running}
              onClick={() => sim.chooseRegression('latency')}
            >
              Inject latency
            </Btn>
          </Row>
          <Row>
            <span style={{ fontSize: '0.72rem' }}>Latency ms</span>
            <NumInput
              type="number"
              inputMode="numeric"
              style={{ width: '4.2rem' }}
              min={REGRESSION_LATENCY.min}
              max={REGRESSION_LATENCY.max}
              step={50}
              value={sim.latencyDraft}
              disabled={!running}
              onChange={(e) => sim.setLatencyDraft(e.target.value)}
              onBlur={sim.commitLatency}
              aria-label="Injected latency in milliseconds"
            />
            <Btn type="button" disabled={!running || regression.mode === 'off'} onClick={() => sim.chooseRegression('off')}>
              Clear
            </Btn>
          </Row>

          <SubLabel>Since start</SubLabel>
          <Stats>
            <span>Requests sent</span>
            <span>{summary.sent}</span>
            <span>2xx</span>
            <span>{summary.ok2xx}</span>
            <span>5xx</span>
            <span>{summary.err5xx}</span>
            <span>Other failures</span>
            <span>{summary.otherFailures}</span>
            <span>Regression applied</span>
            <span>{summary.regressionApplied}</span>
            <span>Skipped (in-flight cap)</span>
            <span>{summary.skipped}</span>
            <span>Avg latency (last {summary.latencySamples})</span>
            <span>{fmtMs(summary.avgLatencyMs)}</span>
            <span>P95 latency (last {summary.latencySamples})</span>
            <span>{fmtMs(summary.p95LatencyMs)}</span>
          </Stats>

          <SubLabel>Served arms (200s)</SubLabel>
          {arms.length === 0 ? (
            <Hint style={{ marginTop: 0 }}>No arms yet.</Hint>
          ) : (
            <Stats>
              {arms.map(([arm, count]) => (
                <Fragment key={arm}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={arm}>
                    <code>{arm}</code>
                  </span>
                  <span>{count}</span>
                </Fragment>
              ))}
            </Stats>
          )}
          <Hint>
            Sends real <code>POST /api/search</code> requests as pool users{' '}
            <code>sim-user-0001…</code>. The regression only bites on the server&apos;s target arm;
            error responses have no arm, so they show under “Regression applied”. Latency is over
            the last 200 completed requests.
          </Hint>
        </Body>
      )}
    </Section>
  );
}
