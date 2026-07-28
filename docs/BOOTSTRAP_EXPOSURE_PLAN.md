# Bootstrapping + Deferred Experiment Exposure — Implementation Plan

**Branch:** `feat/bootstrap-deferred-exposure`
**Status:** planning (no source changes yet)
**LD project / environment audited:** `dark-trainers` / `production`

## Goal

Prove the LaunchDarkly pattern where the app **preloads all flag values up front**
(fast, flicker-free paint) **without generating any experiment exposures**, and only
counts a user as *exposed* to an experiment when they reach the feature's real decision
point. The flagship example is the **VIP upsell banner in the shopping cart**
(`checkout-vip-banner`): the value is preloaded, but exposure fires only when the user
opens the cart (enters the checkout funnel).

## The mechanism (why this works)

Two orthogonal LaunchDarkly behaviors, confirmed against the docs:

| Concern | Mechanism |
| --- | --- |
| Fast speed-to-paint (preload values) | `bootstrap` option and/or non-eventing reads |
| Exposure counting | An **evaluation event** (`variation()` / `variationDetail()` / `useFlags()`) is what LD records as an experiment exposure |

- `ldClient.allFlags()` in the **React Web SDK does NOT send analytics events** — so it is a
  safe "preload / read for render" path that generates **zero exposures**.
- `useFlags()` **does** send events — it is *not* a safe non-eventing read.
- The only non-eventing read is `ldClient.allFlags()`.
- Exposure = an evaluation event for a flag that is part of an active experiment. So exposure
  timing is controlled by *when we call `variation()`/`variationDetail()`*, not by bootstrapping.

## Current-state gap

All client flag reads funnel through one hook, `src/hooks/useFeatureFlag.ts`, which calls
`ldClient.variation()` (`useFeatureFlag.ts:23`). Every read therefore emits an evaluation
event = exposure. Worse, `CartDrawer` is **always mounted** (CSS slide-out), so its
`checkout-vip-banner` read at `CartDrawer.tsx:131` fires `variation()` on **initial page
load for every visitor**, whether or not they ever open the cart. Today the entire
population is counted as exposed on load — the exact anti-pattern this work fixes.

---

## Audit: are any flags currently powering a live experiment?

> 🚫 **CORRECTION (do not trust the first-pass MCP audit).** The initial audit inferred
> "no running experiments" from `experiments.items` being empty on all 21 flags. **That
> conclusion was wrong.** The project owner confirmed **2 experiments are running in
> `production`.** The MCP simply cannot see them — see "MCP product gap" below. Treat the
> default flip as **BLOCKED** until the 2 target flags are identified (LD **Experiments** UI)
> and their explicit exposure calls ship *in the same PR as the flip.*

**Target flags of the 2 live experiments (confirmed by owner):**

| Experiment target | Type | Evaluated | Risk from the flip | Required action |
| --- | --- | --- | --- | --- |
| `promo-banner-text` | multivariate feature flag | **Client** — `useFeatureFlag` in `SeasonalBanner.tsx:40` (`variation()` today) | **AT RISK** — non-eventing default kills its exposures | Add an explicit exposure call in `SeasonalBanner` (decision point = banner renders with non-empty text), shipped **in the same PR as the flip** |
| `togglemon-card-creator` | **AI Config** (not a feature flag) | **Server** — `aiClient.completionConfig(...)` in `server/routes/card-creator.ts:234` | **Not affected** — server-side eval, outside the client hook | None for Tier 1; exposure stays server-side |

> Both live experiments were invisible to the flag audit, for two different reasons:
> `promo-banner-text` is a flag whose `experiments.items` reads empty via the MCP;
> `togglemon-card-creator` is an **AI Config**, a resource `list-feature-flags` does not
> cover at all. This is why Tier 1 now explicitly includes `promo-banner-text`.

### MCP product gap (why the audit was unreliable)

The LaunchDarkly MCP server has **no experiments primitive**, so an agent cannot answer
"which flags are in a running experiment in this environment?":

- No `list-experiments` / `get-experiment` tool exists.
- `list-feature-flags` and `get-feature-flag` return `experiments.items: []` **even for a
  flag that is experiment-targeted**, and **even with `expand=experiments`** (verified on
  `pdp-hero-layout`). The one field that looks authoritative is empty/unpopulated.
- Experiments surface only *incidentally* in the audit log as `kind: "experiment"` /
  `createExperiment` entries, and only if the create/stop event falls inside the query's
  recent 20-entry window — not a reliable "what's running now" signal.
- The underlying REST API **does** have the data
  (`GET /api/v2/projects/{proj}/environments/{env}/experiments`), so the gap is specifically
  that the MCP does not wrap that endpoint.

**Practical (unreliable) tells** that a flag *might* be experiment-attached, pending UI
confirmation — `trackEvents: true` and/or an `experiment` tag:
`pdp-hero-layout` (tag + trackEvents), `promo-banner-text` (tag + trackEvents + 25%×4
rollout), `promo-banner-position` (tag + trackEvents), `vip-upgrade-cta-copy`,
`show-vip-pricing`, `show-collectibles-catalog`, `show-collectibles-vip-content`,
`show-card-creator`. **These are hints, not proof** — the earlier failure shows why.

**Flags with `trackEvents: true` and/or an `experiment` tag (experiment intent):**

| Flag | Signals |
| --- | --- |
| `pdp-hero-layout` | `trackEvents`, tag `experiment`, recent debug events |
| `promo-banner-text` | `trackEvents`, tag `experiment`, 25%×4 rollout |
| `promo-banner-position` | `trackEvents`, tag `experiment` |
| `vip-upgrade-cta-copy` | `trackEvents` |
| `show-vip-pricing` | `trackEvents` |
| `show-collectibles-catalog` | `trackEvents` |
| `show-collectibles-vip-content` | `trackEvents` |
| `show-card-creator` | `trackEvents` |
| `track-conversions-via-gtm` | `trackEvents` (ops flag — should never be an exposure) |
| `new-search-api` | `trackEvents` (server/search — not a client-hook flag) |

**Holdouts (experimentation constructs, `purpose: holdout`):**
`q-3-2026-homepage-holdout-ld-holdout`, `global-holdout-ld-holdout`. Neither appears in
`src/lib/ldFlagKeys.ts` or the client hook path — they are LD-managed and unaffected by the
client hook change, but note their existence when reasoning about experiment allocation.

---

## Plan 1 — Tier 1 (move forward)

Preload all flag values with zero exposures; fire the cart VIP exposure only on cart-drawer
open; show it live in the demo panel. **Experiment creation/attachment is done manually in
the LD UI — code only ensures the exposure event fires at the right moment.**

### 1. Protect live experiments (gate)
Two experiments are live in production (see audit correction above). Only
**`promo-banner-text`** is at risk from the client default flip. Therefore Tier 1 must ship
its exposure call **together with** the default flip — see step 3b. (`togglemon-card-creator`
is a server-side AI Config and needs no client change.)

### 2. Dual-read infrastructure — `src/hooks/useFeatureFlag.ts`
- **Flip default to non-eventing:** read via `ldClient.allFlags()[key] ?? default` instead of
  `ldClient.variation(...)`. Keep the existing `waitForInitialization` gate, `isLoading`,
  `on('change')` re-read, and `contextVersion` re-read. Same ergonomics, **no exposure**.
- **Add a sibling exposure hook** `useFlagExposure(key, default)` that calls
  `ldClient.variationDetail(key, default)` and returns `{ value, isLoading, detail }`
  (including `reason.inExperiment`). This is the *only* path that generates an exposure.

### 3. Re-wire the cart VIP flag — `src/components/Cart/CartDrawer.tsx`
- **Render** the banner from non-eventing `useFeatureFlag('checkout-vip-banner')` (instant
  paint, no exposure).
- **Expose** via an imperative `ldClient.variationDetail('checkout-vip-banner', default)` in
  an effect keyed on `isOpen` transitioning **false → true** (the funnel-entry moment).
  Guard so it fires once per open, not on every re-render.
- Leave the two cart siblings (`vip-upgrade-cta-copy`, `show-vip-pricing`) non-eventing in
  Tier 1; revisit in the follow-up.

### 3b. Protect the live `promo-banner-text` experiment — `src/components/Layout/SeasonalBanner.tsx`
Mandatory in the same PR as the flip. Keep rendering from non-eventing
`useFeatureFlag('promo-banner-text')`, and add an explicit exposure
(`useFlagExposure` / `variationDetail`) at the banner's decision point — when it renders with
non-empty text (`SeasonalBanner.tsx:58` currently returns `null` for empty/loading). Without
this, flipping the default silently zeroes this running experiment's exposures.

### 4. Visible proof — `src/components/Demo/DemoControlsPanel.tsx` + small exposure log
- Add a lightweight `ExposureLog` context (last N exposures: `flagKey`, `variation`,
  `reason.inExperiment`, timestamp). The exposure path writes to it; the panel renders it.
- Demo becomes literal: load app → panel shows **0 exposures**; open cart → a
  `checkout-vip-banner` exposure appears with `inExperiment: true`.

### 5. Regression check
- Page load emits **zero** evaluation events (LD debugger / network) while the banner still
  renders correctly.
- Exactly one exposure appears on cart-open.
- `on('change')` live updates and the anonymous→identified `identify()` re-read still work
  through the non-eventing path.
- Confirm the GTM consequence (already signed off): the `flag-used` inspector in
  `LDContext.tsx` now pushes `ld_flag_evaluated` only on real exposures, not preloads.

**Touched files:** `useFeatureFlag.ts`, `CartDrawer.tsx`, `SeasonalBanner.tsx` (live-experiment
protection), `DemoControlsPanel.tsx`, one new small context, minor annotation in
`ldFlagKeys.ts`. **Effort: low–moderate, isolated.**

---

## Plan 2 — Follow-up (migrate remaining experiment flags to deliberate exposure)

After the flip, the app default is "no exposure." The follow-up decides, per flag, whether
and where it should expose. Core work = **classification + one exposure call at each real
decision point.**

### Step A — Classify every flag (confirm intent)

Enriched with the audit's `trackEvents` / tag signals. `Experiment` → needs a deliberate
exposure call at its decision point. `Release/ops` → stays non-eventing forever.

| Flag | Type | Exposure decision point (if experiment) |
| --- | --- | --- |
| `checkout-vip-banner` | **Experiment** (done in Tier 1) | Cart drawer open |
| `pdp-hero-layout` | Experiment (tagged) | PDP hero renders (`ProductDetail`) |
| `promo-banner-position` | Experiment (tagged) | Banner renders (`SeasonalBanner`) |
| `promo-banner-text` | Experiment (tagged) | Banner renders |
| `vip-upgrade-cta-copy` | Experiment (copy test) | When CTA shown — **multi-surface** (cart + PDP) |
| `show-vip-pricing` | **Borderline** display treatment | Needs a primary-surface decision (PDP/PLP/cart) |
| `plp-sort-default` | Likely experiment | Product/Collectibles list renders |
| `show-early-access-countdown` | Possible experiment | Countdown region shown on PDP |
| `number-of-days-trial` | Experiment, **server-owned** | Server sim already emits `variationDetail`; decide whether client display double-counts |
| `show-drop-exclusive-products`, `ac26-drop-access`, `show-ac26-drop-feed`, `show-collectibles-vip-content` | Release / targeting | stays non-eventing |
| `show-chatbot`, `show-product-catalog`, `show-vip-signup`, `show-collectibles-catalog`, `show-card-creator` | Release / kill-switch | stays non-eventing |
| `track-conversions-via-gtm` | Ops / routing | never expose |
| `new-search-api` | Server/search routing | out of client-hook scope |

### Step B — Place exposure calls at decision points
For each confirmed experiment flag: keep rendering from non-eventing `useFeatureFlag`, and
add `useFlagExposure` (or imperative `variationDetail`) at the moment the feature is actually
shown / the decision is made. Same pattern as the cart.

### Step C — Handle the hard cases
- **Multi-surface flags** (`vip-upgrade-cta-copy`, `show-vip-pricing`): decide whether each
  surface counts as an exposure or whether one surface is the canonical randomization point.
  This is an experiment-design call, not a code detail.
- **`number-of-days-trial`:** reconcile client vs server exposure so it isn't double-counted —
  the server simulation already emits `variationDetail` for it.

### Step D — Guardrails against regression
- Annotate flag intent in `src/lib/ldFlagKeys.ts` (`experiment` vs `release`) so the correct
  hook is obvious at each call site.
- Update `docs/SPA_LD_PRIMER.md` / `FEATURE_FLAGS_GUIDE.md` with the convention:
  **preload via `useFeatureFlag`, expose via `useFlagExposure` at the decision point.**

---

## Open decisions to confirm before/while building the follow-up

1. Primary vs canonical randomization surface for the multi-surface flags
   (`vip-upgrade-cta-copy`, `show-vip-pricing`).
2. Whether client `number-of-days-trial` display should expose at all (server already owns it).
3. Final experiment-vs-release classification for the borderline flags
   (`plp-sort-default`, `show-early-access-countdown`, `show-vip-pricing`).
