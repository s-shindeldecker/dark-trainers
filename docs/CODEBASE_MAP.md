# DarkTrainers — Codebase Navigation Map

A jump-to-code reference for demos and walkthroughs. Each subsystem lists **where
it lives → what it does → the LaunchDarkly/AI concept it demonstrates**. Line
numbers are approximate — treat them as "land here, then look nearby."

Companion docs: [SPA_LD_PRIMER.md](SPA_LD_PRIMER.md) (SPA + LD fundamentals),
[GTM_SDK_PATTERNS.md](GTM_SDK_PATTERNS.md) (Option A vs B),
[../FEATURE_FLAGS_GUIDE.md](../FEATURE_FLAGS_GUIDE.md),
[../TECHNICAL_DESIGN_CONTEXT.md](../TECHNICAL_DESIGN_CONTEXT.md).

---

## Foundations (covered in depth elsewhere)

| Concept | Entry point | Notes |
|---|---|---|
| SDK init / provider | `src/context/LDContext.tsx:64` | `LDProvider` + client-side ID + options |
| Context build (session vs multi) | `src/context/LDContext.tsx:69` | anonymous → `session`; identified → `multi{session,user}` |
| Context sync / identify | `src/context/LDContextSync.tsx:20` | `identify()` on context change → bumps `contextVersion` |
| Flag read hook (anti-flicker) | `src/hooks/useFeatureFlag.ts` | `waitForInitialization` + `isLoading` + `on('change')` |
| Persona transitions | `src/context/UserContext.tsx` | atomic `setAuthState` → single `identify()` |
| Session key persistence | `src/lib/ldSessionKey.ts` | `sessionStorage`; rotate on logout / new session |
| Flag key registry | `src/lib/ldFlagKeys.ts` | all flag keys, one typed object |
| Conversion routing (GTM either/or) | `src/hooks/useTrackConversion.ts` | `track-conversions-via-gtm`; single path, value forwarded |

---

## 1. AI Configs — server routes

**`server/app.ts:20`** — app factory; inits LD SDK (`:30`) + AI SDK (`:40`), mounts the three AI routes (`:42`).

- **Chatbot — `server/routes/chat.ts:41`**
  - AI Config read: `aiClient.completionConfig('darktrainers-chatbot', context, …)` (`:59`)
  - Context build: `ldUserFromBody()` (`:14`) → tier/country/email/lifetimeSpend
  - OpenAI call: `openai.chat.completions.create()` (`:75`), model/temp from config
  - Metrics: `aiConfig.tracker.trackMetricsOf()` (`:90`) — tokens + duration
- **Signup agent — `server/routes/signup-agent.ts:63`**
  - AI Config read: `aiClient.agentConfig('darktrainers-signup-agent', …)` (`:87`)
  - Extracts a VIP-recommendation JSON from the response (`:148`)
- **Card creator — `server/routes/card-creator.ts:204`**
  - **Moderation gate:** `isDescriptionToxic()` (`:173`) → `openai.moderations.create('omni-moderation-latest')`; trips at `TOXICITY_THRESHOLD = 0.7` (`:136`) or sexual/minors → returns `NONOMON_CARD` (`:142`)
  - AI Config read: `aiClient.completionConfig('togglemon-card-creator', …)` (`:234`)
  - **Session-inclusive context:** `ldContextFromBody()` (`:105`) mirrors the client so experiments bucket correctly
  - Metrics + **serverless flush:** `tracker.trackOpenAIMetrics()` (`:256`) then `ldClient.flush()` (`:285`) so events reach the Monitor tab
  - **Art route** `POST /api/card-creator/art` (`:324`): `gpt-image-1`, retry loop on transient 408/429/5xx (`:352`), graceful fallback

> **Concept:** model/prompt/params live in LD AI Configs, not code; token & latency tracked per variation; moderation + retry + flush are the production-hardening story.

---

## 2. Card Creator — frontend (flagship)

- **`src/pages/CardCreator.tsx:231`**
  - Flag gate: `useFeatureFlag(LD_FLAGS.showCardCreator)` → redirect if off (`:259`)
  - Generate: `POST /api/card-creator` (`:295`), then `generateArt()` (`:325`) → `POST /api/card-creator/art` with graceful fallback (`:283`)
  - Add to cart: `trackConversion('add_to_cart')` (`:354`), `CUSTOM_CARD_PRICE = $12.99` (`:226`)
  - PNG download: `html-to-image`, filter excludes `.holo-foil` (`:367`), tracks `card_downloaded` (`:376`)
- **`src/components/Collectibles/TogglemonCard.tsx:278`**
  - Foil: `HoloSheen` + `HoloGlare` animated layers on Holo/Ultra rarity (`:351`), tagged `.holo-foil` for the export filter
  - Art box: spinner → image → `imagePrompt` text fallback (`:300`)

> **Concept:** AI Config **variations** (baseline / holographic / summer-beach) drive card style; foil renders by rarity; the download deliberately drops the foil.

---

## 3. Chatbot widget

- **Mount gate:** `App.tsx:111` — `{showChatbot && <ChatWidget />}` (flag `show-chatbot`, read at `App.tsx:48`)
- **`src/components/Chat/ChatWidget.tsx:136`** — floating panel; `POST /api/chat` with `{ message, history, userContext }` (`:166`)
- **`src/components/Chat/ChatMessage.tsx:22`** — user vs assistant bubble styling

---

## 4. VIP upgrade + cart flow

- **`src/context/VipModalContext.tsx:17`** — modal state + `pendingCartAdd`; `openVipModal()` fires `vip_upgrade_modal_shown` (`:25`)
- **`src/context/CartContext.tsx:48`**
  - Drop-exclusive interception: `addItem()` returns `{ needsVipModal: true }` for anon + drop-exclusive (`:96`)
  - VIP line item: `VIP_MEMBERSHIP_UPGRADE_USD = $14.99` (`:15`), `activateVipUpgradeLineItem()` (`:126`)
- **`src/components/VIP/VIPUpgradeModal.tsx:48`** — confirm → `vip_upgrade` ($14.99) (`:54`) → `transitionGuestToVip()` / `upgradeIdentifiedToVip()` (`:57`)

> **Concept:** targeting + persona transition in action — guest hits a gated SKU → upgrade modal → atomic VIP identify → cart reflects new tier.

---

## 5. Product catalog (PLP / PDP)

- **PLP — `src/pages/Products.tsx:68`**: `plp-sort-default` (`:69`), `ac26-drop-access` filter (`:70`), preferred-category sort for identified users (`:58`)
- **PDP — `src/pages/ProductDetail.tsx:140`**: `pdp-hero-layout` standard/editorial (`:148`), `show-vip-pricing` (`:149`), `show-early-access-countdown` (`:151`), `vip-upgrade-cta-copy` (`:152`); drop-exclusive lock (`:181`); fires `product_viewed` (`:188`) + `add_to_cart` (`:243`)
- **`src/components/Products/ProductCard.tsx:128`**: VIP price strike (`:145`), drop badge / locked state
- **`src/components/Products/productData.ts:24`**: `products[]`; `getProductById()` (`:513`); fields `isDropExclusive`, `releaseDate`, `memberPrice`, `tags`, `category`

> **Concept:** one page, many flag-driven variants (layout, sort, pricing, gating) — the "change UX without a deploy" story.

---

## 6. Observability & Session Replay

- **`src/context/LDContext.tsx:92`** — `new Observability({ tracingOrigins: true, networkRecording: { enabled: true } })`
- **`:93`** — `new SessionReplay({ privacySetting: 'strict' })`
- **`:18`** — `gtmDataLayerInspector` mirrors every flag evaluation to the GTM dataLayer

> **Concept:** plugins on the same LD client → Web Vitals, session replay (strict privacy), and flag-eval telemetry with zero per-component wiring.

---

## 7. Simulation / experimentation

- **`server/routes/simulate.ts:43`** — `POST /api/simulate/start`, Server-Sent Events stream; validates `SimulationParams` (`:8`); calls `runSimulation()` (`:77`)
- **`server/simulation/engine.ts`** — synthetic journeys via LD `variationDetail()`; per-tier signup/revenue baselines (`:43`); Z-score / p-value / lift significance calc (`:108`)
- **`darktrainers_simulation.py`** — multi-context journeys; tier ratios (`:73`); per-tier event probabilities (VIP add_to_cart 70% / Standard 12% / …) (`:87`); BigQuery/Databricks/Snowflake connectors (`:26`)
- **`run_continuous_simulation.py`** — infinite runner with time-of-day / day-of-week traffic multipliers (`:34`)

> **Concept:** synthetic traffic → warehouse → native experiment results; realistic per-tier behavior makes experiment metrics meaningful.

---

## 8. Demo controls

- **`src/components/Demo/PersonaSwitcher.tsx:121`** — Guest/Standard/VIP radio → `resetToGuest()` / `setRandomStandard()` / `setRandomVip()` (`:148`)
- **`src/components/Demo/DemoControlsPanel.tsx:82`** — persona dropdown + session-key display + "New session" (desktop only)
- **`src/components/Demo/QRCodeModal.tsx:13`** — Cmd/Ctrl+D QR modal → the deployed URL (handler in `App.tsx:144`)

---

## 9. Promo / seasonal banners

- **`src/components/Layout/SeasonalBanner.tsx:39`** — `promo-banner-text` (empty = hidden, `:58`); `promo-banner-position` top/bottom decided in `App.tsx:55`; fires `banner_click` (`:47`)
- **`src/components/Layout/Header.tsx`** — nav links gated by props (`showProducts`/`showFeed`/`showCollectibles`/`showSignup`) set from flags in `App.tsx`

---

## Quick index

| # | Subsystem | Start here |
|---|---|---|
| — | Foundations | `LDContext.tsx`, `useFeatureFlag.ts`, `UserContext.tsx`, `ldFlagKeys.ts` |
| 1 | AI Config routes | `server/routes/{chat,signup-agent,card-creator}.ts` |
| 2 | Card Creator FE | `src/pages/CardCreator.tsx`, `TogglemonCard.tsx` |
| 3 | Chatbot | `App.tsx:111` gate → `Chat/ChatWidget.tsx` |
| 4 | VIP + cart | `VipModalContext.tsx`, `CartContext.tsx`, `VIPUpgradeModal.tsx` |
| 5 | PLP / PDP | `pages/Products.tsx`, `pages/ProductDetail.tsx`, `productData.ts` |
| 6 | Observability | `LDContext.tsx:92` |
| 7 | Simulation | `simulate.ts`, `engine.ts`, `darktrainers_simulation.py` |
| 8 | Demo controls | `Demo/PersonaSwitcher.tsx`, `DemoControlsPanel.tsx` |
| 9 | Banners | `Layout/SeasonalBanner.tsx` |
