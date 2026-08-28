import { useCallback, useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';
import { useLDClient } from 'launchdarkly-react-client-sdk';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import { useFlagExposure } from '../context/ExposureLog';
import { useContextVersion } from '../context/ContextVersion';
import { LD_FLAGS } from '../lib/ldFlagKeys';
import { initDatadogRum, tagFeatureFlag } from '../lib/datadogRum';

/**
 * About page — Layout Preference experiment (Alterra 2D/3D map preference analog).
 *
 * The one non-negotiable design constraint: the FLAG (`about-layout-default`, the
 * assignment) and `activeLayout` (component state, the observed/current mode) are
 * two separate variables. The flag only seeds what the visitor sees on load; the
 * on-page toggle then changes `activeLayout` freely. This mirrors Alterra's real
 * override-agency problem — assignment vs. observed final state — so we keep them
 * split rather than collapsing them for simplicity.
 *
 * Events (see LD metrics of the same key):
 *  - about_layout_final    PRIMARY. Final active layout at visit end. Fired exactly
 *                          once by a shared exit handler (unmount OR pagehide).
 *  - about_layout_toggled  DIAGNOSTIC. Per manual switch, { from, to }. Best-effort.
 *  - about_layout_time_ms  NUMERIC. Elapsed ms per active layout; flushed on every
 *                          toggle and at visit end so the final layout's time isn't
 *                          lost on tab close/refresh.
 */

type Layout = 'classic' | 'immersive';

const coerceLayout = (v: unknown): Layout => (v === 'immersive' ? 'immersive' : 'classic');

// ---------- shared shell ----------

const Page = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  box-sizing: border-box;
`;

const ControlBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
`;

const Segmented = styled.div`
  display: inline-flex;
  border: 1px solid #333;
  border-radius: 999px;
  padding: 0.2rem;
  background: #0a0a0a;
`;

const SegBtn = styled.button<{ $active: boolean }>`
  appearance: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.4rem 1rem;
  border-radius: 999px;
  color: ${({ $active }) => ($active ? '#0a0a0a' : '#a3a3a3')};
  background: ${({ $active }) => ($active ? '#c8f000' : 'transparent')};
  transition: background 0.15s ease, color 0.15s ease;
  &:hover {
    color: ${({ $active }) => ($active ? '#0a0a0a' : '#f5f5f5')};
  }
`;

// Neutral spacer shown before the flag resolves — avoids a flash of the wrong
// layout and a layout-shift jump when the real content mounts.
const LayoutPlaceholder = styled.div`
  min-height: 60vh;
`;

const StatusLine = styled.div`
  font-size: 0.72rem;
  color: #737373;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  code {
    color: #c8f000;
  }
`;

// ---------- classic layout ----------

const HeroMascot = styled.img`
  display: block;
  width: 100%;
  max-height: 480px;
  object-fit: cover;
  object-position: center;
  border-radius: 12px;
  border: 1px solid #2a2a2a;
  margin-bottom: 2rem;
`;

const AboutContainer = styled.div`
  max-width: 720px;
  margin: 0 auto 2rem;
  background: #111;
  border: 1px solid #2a2a2a;
  border-radius: 16px;
  padding: 2.5rem 2rem;
  color: #d4d4d4;
  font-size: 1.05rem;
  line-height: 1.65;
`;

const AboutTitle = styled.h1`
  font-size: 2.25rem;
  margin: 0 0 1rem;
  text-align: center;
  color: #f5f5f5;
`;

const StoryGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.75rem;
  align-items: start;
  margin: 1.5rem 0;
  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const ChicagoImage = styled.img`
  display: block;
  width: 100%;
  height: auto;
  border-radius: 12px;
  border: 1px solid #2a2a2a;
`;

const StoryCopy = styled.div`
  min-width: 0;
`;

// ---------- immersive layout (layered / parallax staging of the same assets) ----------

const Stage = styled.div`
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid #2a2a2a;
`;

const ParallaxPanel = styled.section<{ $img: string }>`
  position: relative;
  min-height: 60vh;
  display: flex;
  align-items: flex-end;
  padding: 2.5rem 2rem;
  background-image: linear-gradient(to top, rgba(10, 10, 10, 0.92) 0%, rgba(10, 10, 10, 0.15) 60%, rgba(10, 10, 10, 0.55) 100%),
    url(${({ $img }) => $img});
  background-size: cover;
  background-position: center;
  /* Cheap, dependency-free parallax; degrades to a normal fixed panel where
     background-attachment: fixed is unsupported (e.g. most mobile browsers). */
  background-attachment: fixed;
  @media (max-width: 720px) {
    background-attachment: scroll;
    min-height: 48vh;
  }
`;

const FloatCard = styled.div`
  position: relative;
  max-width: 560px;
  background: rgba(17, 17, 17, 0.82);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(200, 240, 0, 0.25);
  border-radius: 14px;
  padding: 1.75rem 1.75rem;
  color: #e5e5e5;
  font-size: 1.05rem;
  line-height: 1.6;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55);
  transform: translateY(1.5rem);
`;

const ImmersiveTitle = styled.h1`
  font-size: clamp(2.25rem, 5vw, 3.25rem);
  margin: 0 0 0.75rem;
  color: #f5f5f5;
  letter-spacing: -0.01em;
`;

const Spacer = styled.div`
  height: 1px;
`;

// Two image slots (hero + story) reused by both layouts. The set is chosen by
// the `about-seasonal-images` flag: 'Summer' = current images, 'Winter' = the
// snowboarding + ski-lodge shots.
type ImageSet = { hero: string; story: string };
type Season = 'Summer' | 'Winter';

const coerceSeason = (v: unknown): Season => (v === 'Winter' ? 'Winter' : 'Summer');

const SEASONAL_IMAGES: Record<Season, ImageSet> = {
  Summer: { hero: '/images/about-mascot.webp', story: '/images/about-chicago.webp' },
  Winter: { hero: '/images/about-mascot-winter.webp', story: '/images/about-lodge-winter.webp' },
};

function ClassicLayout({ images }: { images: ImageSet }) {
  return (
    <>
      <HeroMascot src={images.hero} alt="" />
      <AboutContainer>
        <AboutTitle className="font-display">The Drop Philosophy</AboutTitle>
        <p>
          DarkTrainers exists for one reason: limited sneakers should feel urgent, fair, and worth the obsession. We
          build small-batch releases with honest materials and sharp design — then we get out of the way and let the
          product speak.
        </p>
        <StoryGrid>
          <ChicagoImage src={images.story} alt="" />
          <StoryCopy>
            <p>
              Drops are intentionally scarce. VIP members get early access and member pricing because they commit to
              the culture, not because algorithms said so. Everyone else still sees the full line when we open the
              gates — just on our schedule, not a hype bot’s.
            </p>
            <blockquote
              style={{
                fontStyle: 'italic',
                color: '#c8f000',
                margin: '1.5rem 0 0',
                borderLeft: '4px solid #c8f000',
                paddingLeft: '1rem',
              }}
            >
              Drop-ready, just a toggle away.
            </blockquote>
          </StoryCopy>
        </StoryGrid>
        <p>What we care about:</p>
        <ul style={{ marginLeft: '1.25rem', marginBottom: '1rem' }}>
          <li>Photo-forward presentation — the shoe is the hero.</li>
          <li>Transparent release windows and real inventory (no phantom SKUs).</li>
          <li>Membership that actually moves the needle on price and access.</li>
        </ul>
        <p>Thanks for pulling up. Lace tight, notifications on, and we’ll see you at the drop.</p>
      </AboutContainer>
    </>
  );
}

function ImmersiveLayout({ images }: { images: ImageSet }) {
  return (
    <Stage>
      <ParallaxPanel $img={images.hero}>
        <FloatCard>
          <ImmersiveTitle className="font-display">The Drop Philosophy</ImmersiveTitle>
          <p>
            Limited sneakers should feel urgent, fair, and worth the obsession. Small-batch releases, honest materials,
            sharp design — then we get out of the way and let the product speak.
          </p>
        </FloatCard>
      </ParallaxPanel>
      <Spacer />
      <ParallaxPanel $img={images.story}>
        <FloatCard>
          <p style={{ marginTop: 0 }}>
            Drops are intentionally scarce. VIP members get early access and member pricing because they commit to the
            culture, not because algorithms said so. Everyone else still sees the full line when we open the gates.
          </p>
          <blockquote
            style={{
              fontStyle: 'italic',
              color: '#c8f000',
              margin: '1.25rem 0 0',
              borderLeft: '4px solid #c8f000',
              paddingLeft: '1rem',
            }}
          >
            Drop-ready, just a toggle away.
          </blockquote>
        </FloatCard>
      </ParallaxPanel>
    </Stage>
  );
}

const AboutUs = () => {
  const ldClient = useLDClient();

  // Live, non-eventing flag value (updates on streaming changes). This is the
  // ASSIGNMENT — it only seeds the initial activeLayout, it does not drive
  // rendering after that.
  const { value: assigned, isLoading } = useFeatureFlag(LD_FLAGS.aboutLayoutDefault, 'classic');
  // Record the experiment exposure once, here at the decision point (arriving at
  // the About page). Value is unused — rendering reads `assigned`/`activeLayout`.
  useFlagExposure(LD_FLAGS.aboutLayoutDefault, 'classic');
  // Bumps whenever the LD context changes (identify / roster switch). Used to
  // detect a genuine new visitor mid-visit and re-seed for them.
  const contextVersion = useContextVersion();

  // Seasonal image set — live, non-eventing read so a flag toggle swaps the
  // hero/story images in real time (the seasonal-update story). Independent of
  // the layout experiment above; both layouts use whichever set is served.
  const { value: season } = useFeatureFlag(LD_FLAGS.aboutSeasonalImages, 'Summer');
  const images = SEASONAL_IMAGES[coerceSeason(season)];

  // OBSERVED state: what the visitor is currently looking at. `null` until the
  // flag resolves so we never count pre-assignment time.
  const [activeLayout, setActiveLayout] = useState<Layout | null>(null);
  // ASSIGNED-AT-EXPOSURE: the value this visitor was actually exposed to at load,
  // frozen at seed time. Distinct from the LIVE flag value (`assigned`), which
  // keeps updating on flag flips = "what a NEW session would get". Flipping the
  // flag mid-visit does NOT re-expose or re-assign this visitor, so "overridden"
  // must be measured against this frozen value, not the live one.
  const [exposedLayout, setExposedLayout] = useState<Layout | null>(null);
  const [toggleCount, setToggleCount] = useState(0);

  // Refs mirror the mutable timing/state so the exit handler and the pagehide
  // listener always read current values without stale closures.
  const activeLayoutRef = useRef<Layout | null>(null);
  const layoutStartRef = useRef<number | null>(null);
  // The context KEY we last seeded against (user key when identified, session
  // key when anonymous) — `null` until first seed. We key on the actual context
  // key, not a boolean or the contextVersion counter, so that a genuine new
  // visitor (roster switch / guest→identified) re-seeds, while the redundant
  // initial identify of the SAME context (which also bumps contextVersion) does
  // not. A live flag-value change never re-seeds either.
  const seededKeyRef = useRef<string | null>(null);
  const exitFiredRef = useRef(false);

  const flushTime = useCallback(
    (layout: Layout, startTs: number | null) => {
      if (startTs == null) return;
      const ms = Math.round(Date.now() - startTs);
      if (ms <= 0) return;
      // 3rd arg is the numeric metric value LD records for a value metric.
      ldClient?.track('about_layout_time_ms', { layout, ms }, ms);
    },
    [ldClient],
  );

  // Shared exit handler: fire the PRIMARY final-state event once per visit and
  // flush the final layout's time. Unmount and pagehide are mutually exclusive
  // (cleanup removes the listener before it could also fire), and exitFiredRef
  // guards against any double-invoke, so this runs exactly once per visit. A
  // mid-visit context switch also calls this to close out the previous visit.
  const endVisit = useCallback(() => {
    if (exitFiredRef.current) return;
    const layout = activeLayoutRef.current;
    if (layout == null) return; // never seeded → nothing to report
    exitFiredRef.current = true;
    flushTime(layout, layoutStartRef.current);
    ldClient?.track('about_layout_final', { layout });
  }, [ldClient, flushTime]);

  // Seed activeLayout from the assignment for the CURRENT context, and start the
  // timer when the layout is known. Re-seeds when the context key changes (a new
  // visitor mid-visit — e.g. a roster switch — which useFlagExposure also treats
  // as a fresh exposure), closing out the prior visit first. Never re-seeds on a
  // live flag flip: that must not re-expose or re-assign this visitor. Also the
  // flag-read site for the Datadog "Branch A" tag (no-op unless configured).
  useEffect(() => {
    if (isLoading) return;
    const ctx = ldClient?.getContext?.() as
      | { kind?: string; key?: string; user?: { key?: string } }
      | undefined;
    const key = ctx ? (ctx.kind === 'multi' ? ctx.user?.key : ctx.key) : undefined;
    if (!key) return;
    if (seededKeyRef.current === key) return; // same visitor → don't re-seed

    // Read non-eventing and straight from the client so a re-seed uses the NEW
    // context's assignment even if `assigned` state hasn't caught up yet.
    const live = ldClient?.allFlags?.()?.[LD_FLAGS.aboutLayoutDefault];
    const seed = coerceLayout(live ?? assigned);

    if (seededKeyRef.current !== null) {
      // Context switched while still mounted: close out the previous visit (its
      // final + time) before starting the new one, then re-arm the exit guard.
      endVisit();
      exitFiredRef.current = false;
    }
    seededKeyRef.current = key;
    activeLayoutRef.current = seed;
    layoutStartRef.current = Date.now();
    setActiveLayout(seed);
    setExposedLayout(seed); // frozen — what the visitor was exposed to this visit
    setToggleCount(0); // fresh visit — the toggle diagnostic starts over

    initDatadogRum();
    tagFeatureFlag(LD_FLAGS.aboutLayoutDefault, seed);
  }, [isLoading, assigned, contextVersion, endVisit, ldClient]);

  useEffect(() => {
    // pagehide covers tab close / refresh / external navigation. Preferred over
    // beforeunload (unreliable on mobile, and it disables the bfcache).
    const onPageHide = () => endVisit();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      // SPA navigation away from the page: the cleanup fires the same handler.
      endVisit();
    };
  }, [endVisit]);

  const handleToggle = useCallback(
    (next: Layout) => {
      const from = activeLayoutRef.current;
      if (from == null || from === next) return;
      // A toggle is itself an "exit" from the layout being left: flush its time,
      // then restart the timer for the layout being entered.
      flushTime(from, layoutStartRef.current);
      layoutStartRef.current = Date.now();
      activeLayoutRef.current = next;
      // Diagnostic only, best-effort / fire-and-forget.
      ldClient?.track('about_layout_toggled', { from, to: next });
      setToggleCount((c) => c + 1);
      setActiveLayout(next);
    },
    [ldClient, flushTime],
  );

  // Override = the visitor's OBSERVED layout differs from what they were EXPOSED
  // to — a genuine user action. Measured against the frozen exposed value, never
  // the live flag value, so flipping the flag mid-visit can't fake an override.
  const overridden = activeLayout != null && exposedLayout != null && activeLayout !== exposedLayout;
  const liveDefault = coerceLayout(assigned);

  return (
    <Page>
      <ControlBar>
        <Segmented role="group" aria-label="About page layout">
          <SegBtn
            type="button"
            $active={activeLayout === 'classic'}
            aria-pressed={activeLayout === 'classic'}
            onClick={() => handleToggle('classic')}
          >
            Classic
          </SegBtn>
          <SegBtn
            type="button"
            $active={activeLayout === 'immersive'}
            aria-pressed={activeLayout === 'immersive'}
            onClick={() => handleToggle('immersive')}
          >
            Immersive
          </SegBtn>
        </Segmented>
        <StatusLine>
          Exposed to: <code>{exposedLayout ?? '…'}</code> · Next-session default:{' '}
          <code>{liveDefault}</code> · Now viewing: <code>{activeLayout ?? '…'}</code>
          {overridden ? ' (overridden)' : ''} · Toggles: <code>{toggleCount}</code>
        </StatusLine>
      </ControlBar>

      {activeLayout === 'immersive' ? (
        <ImmersiveLayout images={images} />
      ) : activeLayout === 'classic' ? (
        <ClassicLayout images={images} />
      ) : (
        // Not seeded yet (flag still resolving) — hold vertical space without
        // committing to a layout, so an immersive-assigned visitor never sees a
        // flash of Classic before the swap. Resolves within a frame or two.
        <LayoutPlaceholder aria-hidden />
      )}
    </Page>
  );
};

export default AboutUs;
