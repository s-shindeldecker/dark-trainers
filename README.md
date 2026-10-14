# DarkTrainers

A demo application for **DarkTrainers**, a premium limited-drop sneaker brand. Built with React, TypeScript, Express, and LaunchDarkly to demonstrate full-stack feature flagging, client- and server-side experimentation, warehouse-native experimentation (BigQuery / Databricks / Snowflake), multi-context targeting, observability, session replay, and AI Configs.

The app is not a real store — it is a demonstration vehicle for LaunchDarkly's capabilities in a realistic e-commerce context. For deeper architecture and conventions, see [TECHNICAL_DESIGN_CONTEXT.md](TECHNICAL_DESIGN_CONTEXT.md); to jump straight to code, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in values. The ones the app needs to run:
```bash
LAUNCHDARKLY_CLIENT_KEY=your-client-side-id    # browser React SDK
LAUNCHDARKLY_SDK_KEY=your-server-side-sdk-key   # Express server (flags, AI Configs, server-side search)
OPENAI_API_KEY=your-openai-api-key              # Card Creator (text + image) and AI search lab
SERVER_PORT=3001                                # Optional, defaults to 3001
```

Optional integrations, each a no-op when unset — see [.env.example](.env.example) for the full list:

| Integration | Variables | Without them |
|---|---|---|
| Contentful (homepage Hero) | `VITE_CONTENTFUL_SPACE_ID`, `VITE_CONTENTFUL_CDA_TOKEN`, `VITE_CONTENTFUL_ENVIRONMENT` | Hero renders its static fallback content |
| Datadog RUM | `VITE_DATADOG_APPLICATION_ID`, `VITE_DATADOG_CLIENT_TOKEN`, `VITE_DATADOG_SITE` (+ optional `SERVICE` / `ENV` / `VERSION`) | RUM is never initialized |
| AI search lab tuning | `AI_SEARCH_LAB_CONFIG_KEY`, `SEARCH_LAB_RATE_LIMIT_PER_IP`, `SEARCH_LAB_RATE_LIMIT_PER_SESSION`, `SEARCH_LAB_CLICK_LIMIT_PER_IP`, `SEARCH_LAB_AI_CALLS_PER_HOUR` | Built-in defaults |

The simulation script uses additional warehouse/environment keys — see [SIMULATION.md](SIMULATION.md).

3. Enable the secret-scanning pre-commit hook (once per clone — see [CLAUDE.md](CLAUDE.md)):
```bash
git config core.hooksPath .githooks
```

4. Start the development servers (both are needed):
```bash
# Terminal 1 — Vite frontend (proxies /api to the backend)
npm run dev

# Terminal 2 — Express API server (card creator, search, search lab, simulation)
npm run dev:server
```

## What's in the demo

| Feature | Where | LaunchDarkly concept |
|---|---|---|
| Storefront (PLP / PDP / drops / cart / VIP upgrade) | `/products`, `/products/:id`, `/drops` | Flag-driven layout, sort, pricing, three-state drop entitlement, multi-context targeting |
| Server-side search experiment | PLP search box → `POST /api/search` | Flag evaluated per request in Express; experiment on a backend service |
| Hero content experiment | Homepage | LaunchDarkly × Contentful — LD picks the variation, Contentful supplies the content |
| About page layout experiment + seasonal images | `/about` | Assigned default vs observed behavior; live, non-eventing image swap |
| PDP customer-feedback note | Apex Low product pages | String flag as content; exposure deferred to the decision point |
| Member signup | `/signup` | Anonymous → known (session context → `multi{session,user}`) |
| Togglemon Card Creator | `/collectibles/card-creator` | AI Configs (variations, judge, metrics), content safety |
| AI search lab | `/search-lab` (unlinked) | AI Config with keyword fallback, cost/abuse guardrails, separate session context |
| Bootstrap + deferred exposure | App-wide | Preload flags without exposure; record exposure only at the funnel |
| Observability, session replay, Datadog RUM | App-wide | LD observability plugins; flag evaluations tagged into Datadog |
| Simulation + warehouse loaders | `darktrainers_simulation.py` | Synthetic traffic for native and warehouse-native experiment results |

### Server-side search experiment
`POST /api/search` evaluates `search-ranking-algorithm` with the Node SDK on every request (`variationDetail` is both the decision and the experiment exposure) and ranks the catalog with one of three algorithms: `legacy-keyword` (control), `weighted-relevance`, or `personalized-affinity`. The same request applies the `ac26-drop-access` entitlement on the same context, fires `search_performed` / `search_zero_results` server-side, and returns the served arm as `_served` — the browser never evaluates this flag. Results are grouped by product line, one card per shared photo. Typeahead cadence is a separate client-side flag (`search-typeahead`) so request volume can't confound the ranking experiment. The demo controls panel shows the arm the server actually served.

### Hero content experiment (LaunchDarkly × Contentful)
The homepage Hero reads `hero-content-experiment` (`control` | `benefit-led` | `drive-vip-signup` | `court-view`). The value is a key into a Contentful `launchDarklyFeatureFlag` entry whose `meta` map points at a `heroBanner` entry, fetched from the Contentful Content Delivery API ([src/lib/heroContent.ts](src/lib/heroContent.ts)). Targeting stays in LD; Contentful supplies content. Any Contentful failure falls back to static content. The exposure is recorded deliberately when the Hero mounts (`useFlagExposure`), and CTA clicks fire `hero_cta_click` tagged with the variation.

### About page experiment
`about-layout-default` (`classic` | `immersive`, randomized on the `user` context) seeds the page's initial layout only; the on-page toggle then changes it freely, so the assignment and the observed layout stay separate. The page fires `about_layout_toggled`, `about_layout_final`, and `about_layout_time_ms`. Independently, `about-seasonal-images` (`Summer` | `Winter`) swaps the hero and story images live.

### Togglemon Card Creator
A flag-gated page (`/collectibles/card-creator`) that turns a free-text creature description into a rendered trading card with AI-generated art — the flagship AI Configs demo.

- **Text:** `POST /api/card-creator` evaluates `togglemon-card-creator` on a session-inclusive context and returns a validated card (name, type, HP, rarity, two moves, flavor, `imagePrompt`).
- **Art:** `POST /api/card-creator/art` generates a text-free creature illustration via `gpt-image-1` (bounded retry on transient failures; graceful fallback to the prompt text).
- **Content safety:** the description is screened with OpenAI Moderations before generation; anything at/above a `0.7` threshold (or any hint of `sexual/minors`) returns a friendly **NoNoMon** stand-in card instead.
- **Visual editions:** Holo Rare / Ultra Rare cards render an animated holographic foil; special-edition prompts add a labeled ribbon (`edition` field).
- **Actions:** add the card to the cart (custom collectible, fires `add_to_cart`) or download it as a PNG (fires `card_downloaded`).

### AI search lab
`/search-lab` is a standalone page (no storefront nav or layout) for natural-language search over a **content pack** — a self-contained catalog plus a labeled query set, independent of the shoe catalog. The current pack is `ak-park`, an Animal Kingdom theme-park pack (49 items across rides, trails, habitats, dining, shows, and services).

- `POST /api/search-lab` evaluates the server-side `ai-search-lab` flag on a **session-only** context. Off → keyword search. On → the `ai-search-lab-model` AI Config (via `@launchdarkly/ai-node`), falling back to keyword search on any failure (`config-missing`, `config-disabled`, `invalid-output`, `error`, or `ai-budget`). Model output is validated and filtered to real pack ids before it is shown.
- Every search fires `ai_search_performed` (with served path, fallback reason, variation, model, and token data); `POST /api/search-lab/click` records `lab_result_clicked` on the first click of each result.
- **Guardrails:** in-memory per-IP and per-session rate limits plus an hourly AI-call budget ([server/lab/guard.ts](server/lab/guard.ts)). They are per server instance and demo-grade only — not a security control.
- The lab uses its own session key (`dt-lab-session-key`), overridable with `?sk=<value>`, and never touches the storefront's session key. A debug strip shows the served path, variation, model, tokens, and latency.
- **Rebuilding the pack:** the pack is generated from the research data in [data/ak-pack/](data/ak-pack/) — never edit `src/packs/ak-park.ts` by hand. Unresolved sourcing questions are tracked in [data/ak-pack/open-questions.md](data/ak-pack/open-questions.md).

## Architecture

```
├── src/                      # React frontend (Vite + TypeScript, Emotion + MUI)
│   ├── components/
│   │   ├── Cart/             # CartDrawer
│   │   ├── Collectibles/     # TogglemonCard (AI-generated trading card + holo foil)
│   │   ├── Demo/             # Persona switcher (+ "New session"), demo controls panel, QR code modal
│   │   ├── Hero/             # Contentful-driven HeroSection + skeleton
│   │   ├── Layout/           # Header, Footer, SeasonalBanner (promo strip)
│   │   ├── Member/           # MemberBadge
│   │   ├── Products/         # ProductCard, ProductSearchBar, grid skeleton, productData, productLines
│   │   ├── SearchLab/        # Search lab SearchBar, ResultCard, DeclineCard, DebugStrip
│   │   ├── Signup/           # MemberSignupForm (member signup)
│   │   ├── VIP/              # VIPUpgradeModal
│   │   └── common/           # Modal
│   ├── context/              # User, LaunchDarkly (+ LDContextSync, ContextVersion), ExposureLog,
│   │                         #   ServerSearchLog, Cart, VIP modal providers
│   ├── hooks/                # useFeatureFlag, useTrackConversion, useTrialDays
│   ├── lib/                  # ldFlagKeys, ldSessionKey, labSession, dropAccess, heroContent,
│   │                         #   datadogRum, gtmStub, searchLabApi, generateRandomUser
│   ├── packs/                # Search lab content packs: types, validate, ak-park (generated)
│   ├── pages/                # Products, ProductDetail, Drops, Account, Signup, About, FAQ, Reviews,
│   │                         #   Collectibles, CollectibleDetail, CardCreator, SearchLab
│   └── types/                # darktrainers.ts (Product, User models)
├── server/                   # Express API server (TypeScript via tsx)
│   ├── index.ts              # Local entry point (app.listen)
│   ├── app.ts                # createApp() — builds the Express app (shared: local + Vercel fn)
│   ├── launchdarkly.ts       # LD Node server SDK client
│   ├── ld-context.ts         # Shared multi{session,user} context builder
│   ├── routes/
│   │   ├── card-creator.ts   # POST /api/card-creator (+ /art) — AI Config: togglemon-card-creator
│   │   ├── search.ts         # POST /api/search, GET /api/search/info — flag: search-ranking-algorithm
│   │   ├── search-lab.ts     # POST /api/search-lab — flag: ai-search-lab, AI Config: ai-search-lab-model
│   │   ├── search-lab-click.ts # POST /api/search-lab/click — lab_result_clicked
│   │   └── simulate.ts       # POST /api/simulate (flag evaluation for simulation)
│   ├── search/               # ranking.ts (3 algorithms), access.ts (drop entitlement resolver)
│   ├── lab/                  # Search lab: aiSearch, keywordSearch, validateAiResult, guard, packRegistry
│   └── simulation/engine.ts  # TypeScript simulation engine
├── api/index.ts              # Vercel serverless entry — runs the Express app in production
├── data/ak-pack/             # Research ledger + queries the ak-park pack is built from
├── scripts/                  # Pack build/validation and search lab test scripts (run with tsx)
├── sql/                      # Hand-run warehouse SQL (Databricks star schema)
├── docs/                     # Deeper guides (see below)
├── darktrainers_simulation.py # Python experiment data simulation (see SIMULATION.md)
├── run_continuous_simulation.py # Continuous simulation runner with traffic multipliers
└── vite.config.ts            # Dev proxy: /api → Express server
```

## LaunchDarkly Integration

**Manual setup:** In the LaunchDarkly project, add a custom context kind named **`session`** (Context kinds / schema) so pre-login evaluation and `multi` payloads with `session` + `user` are valid for targeting and Live Events. See the [User Context Model](TECHNICAL_DESIGN_CONTEXT.md#user-context-model) for the multi-context design.

**Bootstrap + deferred exposure:** flag values are preloaded app-wide without sending exposure events (`useFeatureFlag` reads `allFlags()`, which is non-eventing). Every experiment flag therefore records its exposure deliberately at its decision point via `variationDetail` (`useFlagExposure`, or `useExposureRecorder` for event-driven points) from [src/context/ExposureLog.tsx](src/context/ExposureLog.tsx) — e.g. when the Hero mounts, the cart opens, or an Apex Low PDP loads. The demo controls panel shows the exposure log live.

For **native experimentation** debugging (Live Events vs Results, export cadence, and warehouse checks), see [RUNBOOK_BQ_NATIVE_DEBUG.md](RUNBOOK_BQ_NATIVE_DEBUG.md).

### Observability
The app integrates `@launchdarkly/observability` and `@launchdarkly/session-replay` as plugins to the React client SDK. These automatically capture Web Vitals (CLS, FCP, LCP, TTFB, INP), errors, and session replays (strict privacy) without manual instrumentation. The server uses `@launchdarkly/observability-node`.

**Datadog RUM** is wired app-wide but ships dark: when the two `VITE_DATADOG_*` keys are set, RUM initializes and every flag evaluation is tagged via `addFeatureFlagEvaluation` from the LD inspector ([src/lib/datadogRum.ts](src/lib/datadogRum.ts)).

### AI Configs
| AI Config | Used by | Notes |
|---|---|---|
| `togglemon-card-creator` | `POST /api/card-creator` (`@launchdarkly/server-sdk-ai`) | Completion mode; prompt **variations** (`baseline`, `holographic`, `summer-beach`) for toggling/experimentation; out-of-the-box **Toxicity judge** at 100% sampling. Metrics via `trackOpenAIMetrics`. |
| `ai-search-lab-model` | `POST /api/search-lab` (`@launchdarkly/ai-node`) | Gated by the `ai-search-lab` flag; key overridable with `AI_SEARCH_LAB_CONFIG_KEY`. The newer AI SDK keeps its own LD client (reads `LD_SDK_KEY`, defaulted from `LAUNCHDARKLY_SDK_KEY`). |

Token usage, latency, and success/error are tracked per variation and surfaced in the AI Config **Monitor** tab. Both routes flush events before responding so they survive serverless freezes. The configured LLM provider is called via the OpenAI SDK.

### Custom Events
| Event key | Fired from | Value |
|---|---|---|
| `add_to_cart` | Cart add (PDP, collectibles, custom Togglemon cards) | product price |
| `checkout_initiated` | Cart drawer checkout | cart total |
| `product_viewed` | PDP / collectible detail | product price |
| `vip_upgrade` | VIP upgrade confirm | `14.99` |
| `vip_upgrade_modal_shown` | VIP upgrade modal open | — |
| `member_signup` | `/signup` (anonymous guests only) | — |
| `banner_click` | `SeasonalBanner.tsx` click | — |
| `hero_cta_click` | Hero CTA (tagged with variation) | — |
| `about_layout_toggled` / `about_layout_final` / `about_layout_time_ms` | About page | `about_layout_time_ms` = ms in layout |
| `card_downloaded` | Card creator "Download card" | — |
| `search_result_clicked` | PLP search result click | product price |
| `search_performed` | **Server** — every `/api/search` call | results shown |
| `search_zero_results` | **Server** — no visible results | — |
| `ai_search_performed` | **Server** — every `/api/search-lab` call | result count |
| `lab_result_clicked` | **Server** — `/api/search-lab/click` | — |

`add_to_cart`, `product_viewed`, `card_downloaded`, `member_signup`, and `search_result_clicked` go through `useTrackConversion`, which routes each conversion through **either** the GTM dataLayer **or** a direct `track()` call per `track-conversions-via-gtm` (see [docs/GTM_SDK_PATTERNS.md](docs/GTM_SDK_PATTERNS.md)). The simulation also emits `trial_signup`, `trial_to_paid_conversion`, `total_revenue`, `adjusted_revenue`, and `hero_engagement` — see [SIMULATION.md](SIMULATION.md).

## Feature Flags

| Flag Key | Type | Purpose |
|---|---|---|
| `show-product-catalog` | Boolean | Products nav link + `/products` route guard |
| `show-vip-signup` | Boolean | Signup nav link only (`Header.tsx`); `/signup` renders `MemberSignupForm` regardless |
| `show-ac26-drop-feed` | Boolean | `/drops` page (AC26 collection feed) |
| `show-vip-pricing` | Boolean | VIP member price display on PLP/PDP |
| `show-drop-exclusive-products` | Boolean | Drop-exclusive items visible on PLP |
| `show-early-access-countdown` | Boolean | Countdown timer for upcoming drops |
| `ac26-drop-access` | String | Drop entitlement: `teaser` (hidden) \| `early-access` (view-only) \| `full-access` (purchasable); shared browser/server mapping in `src/lib/dropAccess.ts` |
| `pdp-hero-layout` | String/JSON | PDP layout variant (`default` \| `splash`) |
| `plp-sort-default` | String | PLP sort order (`relevance` \| `newest` \| `price-asc`) |
| `vip-upgrade-cta-copy` | String | VIP upgrade CTA button text |
| `checkout-vip-banner` | JSON | VIP upsell banner config at checkout |
| `promo-banner-text` | String | Top promo strip (empty string = hidden) |
| `promo-banner-position` | String | Promo strip placement (`top` \| `bottom`) |
| `show-collectibles-catalog` | Boolean | Collectibles nav link, `/collectibles` routes, and the card-creator CTA |
| `show-collectibles-vip-content` | Boolean | Unlocks VIP-gated collectibles content (LD targets `tier=vip`) |
| `show-card-creator` | Boolean | Togglemon Card Creator page (`/collectibles/card-creator`) + PLP CTA |
| `track-conversions-via-gtm` | Boolean | Conversions route via GTM dataLayer (on) or direct LD track (off) |
| `show-customer-feedback-on-pdp` | String | Customer-feedback note on Apex Low PDPs; the value is the note text, `''` hides it |
| `hero-content-experiment` | String | Homepage Hero variation (`control` \| `benefit-led` \| `drive-vip-signup` \| `court-view`), content from Contentful |
| `about-layout-default` | String | About page initial layout (`classic` \| `immersive`), randomized on `user` |
| `about-seasonal-images` | String | About page image set (`Summer` \| `Winter`) |
| `search-typeahead` | Boolean | PLP search fires on keystroke (debounced) vs submit only |
| `storefront-theme` | String | **Reserved** — nothing reads it yet |
| `search-ranking-algorithm` | String | **Server-only.** Ranking arm for `/api/search` (`legacy-keyword` \| `weighted-relevance` \| `personalized-affinity`) |
| `ai-search-lab` | Boolean | **Server-only.** Search lab path: keyword (off) or AI Config (on) |

See [FEATURE_FLAGS_GUIDE.md](FEATURE_FLAGS_GUIDE.md) for details on each flag. Flag keys are immutable and visible on the LD flag list — keep them vertical-generic, never named after a customer.

## Demo Personas

| Persona | Tier | Notable attributes |
|---|---|---|
| Guest | — | Anonymous; `session` context only |
| Standard | `standard` | Jordan Mitchell, CA, $285 lifetime spend |
| VIP | `vip` | Alex Rivera, NY, $1,840 lifetime spend, early access enabled |

Switch personas in-app via the demo controls panel, which also shows the session key, a "New session" button, the deferred-exposure log, and the server-side search arm. See [DEMO_SCRIPTS.md](DEMO_SCRIPTS.md) for guided demo walkthroughs.

## Development

### Reading a feature flag
```typescript
const { value, isLoading } = useFeatureFlag('your-flag-key', defaultValue);
useFlagExposure('your-flag-key', defaultValue); // only for experiment flags, at the decision point

if (isLoading) return <SkeletonLoader />;  // anti-flicker is mandatory on gated content
return value ? <FeatureComponent /> : <FallbackComponent />;
```

### Search lab pack and tests
No test runner is configured; the scripts below are standalone `tsx` checks with no LaunchDarkly or network access. Each exits non-zero on failure.

```bash
npx tsx scripts/build-ak-pack.ts        # regenerate src/packs/ak-park.ts from data/ak-pack
npx tsx scripts/validate-pack.ts        # structural validation of the pack
npx tsx scripts/test-pack.ts            # pack report: counts, prompt size, keyword recall
npx tsx scripts/test-keyword-search.ts  # keyword fallback
npx tsx scripts/test-ai-validate.ts     # AI output validation
npx tsx scripts/test-guard.ts           # rate limiter + AI budget
```

### Lint and build
```bash
npm run lint
npm run build
```

Output goes to the `dist` directory. On Vercel, the SPA is served from `dist` and the Express API runs as a single serverless function (`api/index.ts`), routed by the `/api/(.*)` rewrite in [vercel.json](vercel.json).

## Further docs

| Doc | What it covers |
|---|---|
| [TECHNICAL_DESIGN_CONTEXT.md](TECHNICAL_DESIGN_CONTEXT.md) | Architecture, context model, flag/event inventory, conventions for new features |
| [FEATURE_FLAGS_GUIDE.md](FEATURE_FLAGS_GUIDE.md) | Per-flag behavior and variations |
| [DEMO_SCRIPTS.md](DEMO_SCRIPTS.md) | Guided demo scenarios |
| [SIMULATION.md](SIMULATION.md) | Simulation script, profiles, warehouse configuration |
| [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md) | Jump-to-code map by subsystem |
| [docs/WAREHOUSE_MODEL.md](docs/WAREHOUSE_MODEL.md) | Databricks star schema and LD metric data source |
| [docs/GTM_SDK_PATTERNS.md](docs/GTM_SDK_PATTERNS.md) | GTM ↔ LD SDK patterns (Option A vs B) |
| [docs/SPA_LD_PRIMER.md](docs/SPA_LD_PRIMER.md) | SPA + LaunchDarkly fundamentals |
| [docs/BOOTSTRAP_EXPOSURE_PLAN.md](docs/BOOTSTRAP_EXPOSURE_PLAN.md) | Design record for bootstrap + deferred exposure |
| [RUNBOOK_BQ_NATIVE_DEBUG.md](RUNBOOK_BQ_NATIVE_DEBUG.md) | Debugging native experimentation results |
| [CLAUDE.md](CLAUDE.md), [SECURITY_INCIDENT.md](SECURITY_INCIDENT.md) | Secrets policy, pre-commit hook, past incident |
