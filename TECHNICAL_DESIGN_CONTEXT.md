# Dark Trainers — Technical Design Context

> This document is intended for use by a Claude design agent when planning new features. It describes the current architecture, integration patterns, conventions, and constraints so new work is consistent with what already exists.

---

## Project Overview

**Dark Trainers** is a premium limited-drop sneaker brand demo application. Its primary purpose is to showcase LaunchDarkly's full-stack capabilities: client-side feature flags, AI Configs, multi-context targeting, native experimentation (BigQuery/Databricks), observability, and session replay — all within a realistic e-commerce context.

The app is not a real store. It is a demonstration vehicle. Every technical decision should ask: *does this make the LaunchDarkly story clearer and more compelling?*

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19, React Router 7.6, TypeScript 5.8 |
| Build tool | Vite 6 |
| Styling | Emotion (CSS-in-JS) + MUI v7 |
| Backend | Express 5.2, Node.js, TypeScript (via `tsx`) |
| AI / LLM | OpenAI SDK (GPT-4o-mini) |
| Feature flags | LaunchDarkly React Client SDK v3, LD Node Server SDK v9, LD Server SDK AI v0.16 |
| Observability | `@launchdarkly/observability` (Web Vitals), `@launchdarkly/session-replay` |
| Data warehouse | BigQuery (primary), Databricks (test), Snowflake |
| Simulation | Python 3.12 (`darktrainers_simulation.py`) |
| Deployment | Vercel (SPA rewrite via `vercel.json`) |

---

## Application Structure

### Frontend Routes

| Route | Component | Gate |
|---|---|---|
| `/` | Homepage / Hero | — |
| `/products` | Product catalog (PLP) | `show-product-catalog` flag |
| `/products/:id` | Product detail (PDP) | — |
| `/drops` | Drop feed (AC26 collection) | `show-ac26-drop-feed` flag |
| `/account` | User account | — |
| `/signup` | VIP signup (AI agent) | `show-vip-signup` flag |
| `/collectibles` | Collectibles catalog (PLP) | `show-collectibles-catalog` flag |
| `/collectibles/card-creator` | Togglemon Card Creator | `show-card-creator` flag |
| `/collectibles/:id` | Collectible detail | `show-collectibles-catalog` flag |
| `/about` | About page | — |
| `/faq` | FAQ | — |
| `/reviews` | Reviews | — |

### Backend API Routes

| Route | Purpose |
|---|---|
| `POST /api/chat` | AI chatbot (LD AI Config: `darktrainers-chatbot`) |
| `POST /api/signup-agent` | VIP onboarding AI agent (LD AI Config: `darktrainers-signup-agent`) |
| `POST /api/card-creator` | Togglemon card text (LD AI Config: `togglemon-card-creator`); moderation gate → NoNoMon |
| `POST /api/card-creator/art` | Togglemon card art via `gpt-image-1` (retry + graceful fallback) |
| `POST /api/simulate` | Flag evaluation for simulation script |
| `GET /api/health` | Health check |

In production the Express app runs as a single Vercel serverless function (`api/index.ts` → `server/app.ts`'s `createApp()`), routed by an `/api/(.*)` rewrite in `vercel.json`. Locally, `server/index.ts` runs the same app with `app.listen()` and Vite proxies `/api`.

---

## Provider Hierarchy

The React tree is structured as follows (outermost first):

```
UserProvider            — session key, auth state, persona transitions
  Router
    LDContextProvider   — LD SDK init, plugin setup (observability, session replay)
      LDContextSync     — watches auth state, pushes context changes to LD
        VipModalProvider — VIP upgrade modal open/close state
          CartProvider  — cart lines, VIP membership line
            AppShell    — routing + page components
```

New providers should slot into this hierarchy at the appropriate level. Anything that needs LD flag evaluations must be inside `LDContextProvider`. Anything that reads user tier must be inside `UserProvider`.

---

## User Context Model

Dark Trainers uses LaunchDarkly's **multi-context** model. Two context kinds are in play simultaneously post-login.

### Context Kinds

| Kind | When active | Key source |
|---|---|---|
| `session` | Always (guest + identified) | Browser-persisted UUID; rotated on logout |
| `user` | Post-login only | Demo persona key |

### Demo Personas

| Persona | Key | Tier | Notable attributes |
|---|---|---|---|
| Guest | *(session only)* | — | Anonymous; no user context |
| Standard | `user-standard-demo-001` | `standard` | Jordan Mitchell, CA, $285 lifetime spend, `running` category |
| VIP | `user-vip-demo-001` | `vip` | Alex Rivera, NY, $1,840 lifetime spend, `basketball` category, `earlyAccessEnabled: true` |

### User Attributes Available for Flag Targeting

```typescript
{
  key: string,
  name: string,
  email: string,
  country: string,        // 'US'
  state: string,          // 'CA' | 'NY' | etc.
  memberTier: string,     // 'guest' | 'standard' | 'vip'
  memberSince: string,    // ISO date
  lifetimeSpend: number,
  preferredCategory: string, // 'running' | 'basketball' | 'lifestyle' | 'training'
  earlyAccessEnabled: boolean
}
```

### Persona Transitions

```
resetToGuest()                  — logout; rotates session key; drops user context
setIdentifiedStandard()         — login as Standard demo user
setIdentifiedVip()              — login as VIP demo user
upgradeIdentifiedToVip()        — Standard → VIP (same session key; user context updated)
transitionGuestToStandard()     — Guest → Standard (session key preserved; user context added)
```

---

## Feature Flag Inventory

### Boolean Flags

| Key | Default | Controls |
|---|---|---|
| `show-product-catalog` | `false` | Products nav link + `/products` route guard |
| `show-chatbot` | `false` | Floating AI chat widget |
| `show-vip-signup` | `true` | VIP signup nav link |
| `show-ac26-drop-feed` | `false` | `/drops` page |
| `show-vip-pricing` | `true` | VIP member price display on PLP/PDP |
| `show-drop-exclusive-products` | `true` | Drop-exclusive items visible on PLP |
| `show-early-access-countdown` | `false` | Countdown timer for upcoming drops |
| `show-collectibles-catalog` | `false` | Collectibles nav link, `/collectibles` routes, card-creator CTA |
| `show-collectibles-vip-content` | `false` | Unlocks VIP-gated collectibles content (targets `tier=vip`) |
| `show-card-creator` | `false` | Togglemon Card Creator page + PLP CTA |
| `track-conversions-via-gtm` | `false` | Card creator & collectible conversions via GTM dataLayer (on) or direct LD track (off) |

### String / JSON Flags

| Key | Type | Controls |
|---|---|---|
| `ac26-drop-access` | String | VIP-only drop access gate |
| `pdp-hero-layout` | String/JSON | PDP layout variant (`default` \| `splash`) |
| `plp-sort-default` | String | PLP sort order (`relevance` \| `newest` \| `price-asc`) |
| `vip-upgrade-cta-copy` | String | VIP CTA button text |
| `checkout-vip-banner` | JSON | VIP upsell banner config in checkout |
| `promo-banner-text` | String | Top promo strip (empty string = hidden) |
| `promo-banner-position` | String | Promo strip placement (`top` \| `bottom`) |

### AI Config Keys

| Key | Mode | Purpose |
|---|---|---|
| `darktrainers-chatbot` | Completion | Controls model, system prompt, temperature, token limits for chatbot |
| `darktrainers-signup-agent` | Completion | VIP onboarding AI agent config |
| `togglemon-card-creator` | Completion | Card creator; variations `baseline` / `holographic` / `summer-beach`; Toxicity judge @ 100% |

AI Configs track token usage (input/output/total), latency (ms), and success/error per variation via
`trackOpenAIMetrics`; the card-creator route flushes events after each generation so they reach the
Monitor tab on serverless.

---

## Feature Flag Usage Pattern

All flag reads go through a custom hook that waits for SDK initialization to prevent UI flicker:

```typescript
const { value, isLoading } = useFeatureFlag('flag-key', defaultValue);

if (isLoading) return <SkeletonLoader />;
return value ? <FeatureComponent /> : <FallbackComponent />;
```

**Rules:**
- Always provide a meaningful default value — flags can be off in any environment.
- Skeleton loaders are mandatory on flag-gated content (prevents flash on context switch).
- Server-side flags (AI Configs, warehouse configs) are read via the Node SDK on the Express server, never in the browser.

---

## Product Catalog

### Product Model

```typescript
interface Product {
  id: string;
  name: string;
  brand: string;
  category: 'running' | 'basketball' | 'lifestyle' | 'training';
  price: number;
  memberPrice: number;        // 15–20% VIP discount
  isDropExclusive: boolean;   // requires VIP early access
  releaseDate: string;        // ISO date
  sizes: number[];            // US sizing
  imageUrl: string;
  description: string;
  tags: string[];
}
```

### Catalog Summary

- 16 SKUs total
- AgentControl '26 (AC26) drop-exclusive collection: 5–6 SKUs, $265–$325, `isDropExclusive: true`
- Evergreen catalog: running, basketball, training, lifestyle, $130–$195

### VIP Membership Line Item

The cart can carry a virtual VIP subscription upgrade:

```typescript
VIP_MEMBERSHIP_UPGRADE_USD = 14.99  // monthly subscription
```

This is added when a Standard or Guest user upgrades to VIP through the upgrade modal. It is a line item in the cart alongside regular products.

---

## Cart & VIP Upgrade Flow

1. User (guest or standard) attempts to add a `isDropExclusive: true` product.
2. `VipModalProvider` intercepts and opens the upgrade modal.
3. User confirms → `upgradeIdentifiedToVip()` fires → VIP membership line added to cart → pending add-to-cart item added → modal closes.
4. If user cancels, cart is unchanged.

The `checkout-vip-banner` JSON flag controls upsell messaging shown at checkout for non-VIP users.

---

## AI Integration

### Chatbot (`/api/chat`)

- Reads `darktrainers-chatbot` AI Config from LD (server-side Node SDK).
- Passes user context (tier, preferred category) to LD for targeted model/prompt selection.
- Calls OpenAI with the AI Config-provided model, system prompt, temperature, and max tokens.
- LD auto-tracks token usage and latency back to the AI Config metrics.

### VIP Signup Agent (`/api/signup-agent`)

- Reads `darktrainers-signup-agent` AI Config.
- Handles multi-turn onboarding conversation for the `/signup` route.
- Same token/latency tracking pattern as chatbot.

### Togglemon Card Creator (`/api/card-creator` + `/art`)

- Reads `togglemon-card-creator` (variations `baseline` / `holographic` / `summer-beach`) on a **session-inclusive** context (mirrors the client: session-only for anonymous, `multi{session,user}` for identified) so session-randomized experiments align and metrics attribute correctly.
- **Content safety:** screens the description with OpenAI Moderations first; score ≥ `0.7` (or any `sexual/minors`) returns a fixed **NoNoMon** card instead of generating.
- Tracks metrics via `trackOpenAIMetrics` and `flush()`es (Monitor tab per variation). Returns `_served` (variationKey/model) for per-call verification.
- **Art** (`/api/card-creator/art`): `gpt-image-1`, text-free illustration, bounded retry on transient errors, graceful fallback to the prompt text on the card.

> Note the older chatbot/agent routes still use a user-only context — apply the same session-inclusive pattern if experimenting on them.

### AI Config Pattern (server-side)

```typescript
const aiConfig = await ldClient.variation('darktrainers-chatbot', ldContext, defaultConfig);
// aiConfig contains: { model, systemPrompt, temperature, maxTokens }
const response = await openai.chat.completions.create({ ...aiConfig, messages });
ldClient.trackTokenUsage(...);
```

---

## Observability & Event Tracking

### Automatic (via LD plugins)

- **Web Vitals**: CLS, FCP, LCP, TTFB, INP, FID — captured via `@launchdarkly/observability`
- **Session Replay**: `@launchdarkly/session-replay`, strict privacy mode (interactions only, no text capture)
- **Error Monitoring**: uncaught exceptions and unhandled promise rejections

### Manual Events

| Event key | Where fired | Value |
|---|---|---|
| `add_to_cart` | Cart add action (incl. custom Togglemon cards) | product price |
| `card_downloaded` | Card creator "Download card" | — |
| `checkout_initiated` | Checkout start | cart total |
| `vip_upgrade` | VIP upgrade confirm | `14.99` |
| `vip_upgrade_modal_shown` | VIP upgrade modal open | — |
| `product_viewed` | Product detail view | — |
| `banner_click` | `SeasonalBanner.tsx` click | — |

Card-creator and collectible conversions route via **either** the GTM dataLayer **or** a direct
`ldClient.track()` call, controlled by the `track-conversions-via-gtm` flag. Both surfaces use the shared
`useTrackConversion` hook (`src/hooks/useTrackConversion.ts`), which guarantees exactly one path fires
(no double-counting) and forwards the numeric conversion value in both modes so value-based metrics stay
consistent. The hook is identity-stable and exposes `ready` so auto-firing view effects wait for the
routing flag to resolve before emitting (avoids a flag-settle double-count race). In GTM mode the Custom
HTML tag must read a `dlv - value` Data Layer Variable and forward it to `ldClient.track()` — see
`src/lib/gtmStub.ts`.

---

## Simulation Infrastructure

### Script: `darktrainers_simulation.py`

Generates synthetic user journeys and emits events to LaunchDarkly + data warehouse backends. Used to populate experiment metrics.

**Journey types:**
- Guest-only (session context)
- Guest → Identified (context upgrade mid-session)
- Identified from start

**Event probabilities by tier:**

| Event | VIP | Standard | Guest |
|---|---|---|---|
| `add_to_cart` | 70% | 12% | 7% |
| `checkout_initiated` | 58% | 8% | 3% |
| `vip_upgrade` | 0% | 6% | 0% |
| `banner_click` | 8% | 8% | 10% |

**Warehouse profiles:**

| Profile | LD environment | Warehouse | Table |
|---|---|---|---|
| `production-bq` (default) | Production | BigQuery | `darktrainers_metrics.metric_events` |
| `test-databricks` | Test | Databricks Unity Catalog | configured via env |
| `snowflake` | Snowflake | Snowflake | configured via env |

See [SIMULATION.md](SIMULATION.md) for full profile and environment configuration.

**Metric table schema (shared across backends):**

```
context_key    STRING     — user or session ID
context_kind   STRING     — 'user' | 'session'
event_key      STRING     — event name
event_value    FLOAT      — metric value
received_time  TIMESTAMP  — event timestamp
```

---

## Environment Variables

App runtime (see [.env.example](.env.example) for the full list, including simulation warehouse keys):

```bash
# LaunchDarkly
LAUNCHDARKLY_CLIENT_KEY=          # browser React SDK client-side ID
LAUNCHDARKLY_SDK_KEY=             # server-side SDK key (Express server)
LAUNCHDARKLY_SDK_KEY_TEST=        # test environment server SDK key (simulation)
LAUNCHDARKLY_SDK_KEY_SNOWFLAKE=   # snowflake environment server SDK key (simulation)

# AI (chatbot, signup agent, and Togglemon Card Creator — text, image, and moderation)
OPENAI_API_KEY=

# Server
SERVER_PORT=3001                  # optional, defaults to 3001

# BigQuery (simulation profile: production-bq)
BIGQUERY_PROJECT_ID=
BIGQUERY_METRICS_DATASET=darktrainers_metrics
BIGQUERY_METRICS_TABLE=metric_events
# GOOGLE_APPLICATION_CREDENTIALS=  # path to service account JSON, or use ADC

# Databricks (simulation profile: test-databricks)
DATABRICKS_HOST=
DATABRICKS_HTTP_PATH=
DATABRICKS_TOKEN=
DATABRICKS_CATALOG=
DATABRICKS_SCHEMA=darktrainers_metrics

# Snowflake (simulation profile: snowflake)
SNOWFLAKE_ACCOUNT=
SNOWFLAKE_USER=
SNOWFLAKE_PASSWORD=
SNOWFLAKE_DATABASE=
SNOWFLAKE_SCHEMA=
SNOWFLAKE_WAREHOUSE=
```

---

## Styling Conventions

- **Emotion** (`@emotion/styled`, `@emotion/css`) for component-scoped styles.
- **MUI v7** (`@mui/material`) for UI primitives (buttons, modals, icons, etc.).
- Fluid typography via CSS `clamp()`.
- Responsive layouts via MUI `sx` prop breakpoints and media queries in Emotion.
- Dark brand aesthetic: black/charcoal backgrounds, white/gray text, accent colors per product line.
- Do not introduce a new CSS-in-JS library or plain CSS modules — stay on Emotion + MUI.

---

## Key Constraints & Conventions for New Features

1. **LaunchDarkly is the control plane.** Every meaningful UI variant, content change, or behavior toggle should be driven by a flag or AI Config — not hardcoded. New features should identify their flag surface area up front.

2. **Multi-context targeting is first-class.** New personalization features should consider whether they target the session context (pre-login) or user context (post-login) or both. Never collapse these.

3. **Simulation coverage is required.** Any new user event or conversion metric needs a corresponding entry in the simulation script with realistic per-tier probabilities. Experiment data is meaningless without synthetic traffic.

4. **Anti-flicker is mandatory.** All flag-gated content must render a skeleton while LD evaluates. No flash of default UI.

5. **AI Configs, not hardcoded prompts.** Any LLM interaction must read its model, prompt, and parameters from a LD AI Config — never hardcoded in source. This lets LaunchDarkly operators control model behavior without a deploy.

6. **Server-side secrets stay server-side.** OpenAI keys, warehouse credentials, and LD server SDK keys live on the Express server. The React client only sees the LD client-side ID.

7. **Demo clarity over realism.** When there is a tension between a realistic e-commerce implementation and a clear LaunchDarkly demo story, prefer clarity. The app exists to showcase LD capabilities.

8. **No new backend frameworks.** The server is Express 5 + TypeScript. Keep it there.

9. **Persona transitions must be atomic.** Any new user state change (e.g., a new tier or attribute) must be applied in a single `identify()` call to LD — never incremental partial updates, which cause targeting race conditions.

---

## Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| Feature flag keys | kebab-case | `show-product-catalog` |
| AI Config keys | kebab-case | `darktrainers-chatbot` |
| Event keys | snake_case | `add_to_cart` |
| React component files | PascalCase.tsx | `ProductCard.tsx` |
| Hook files | camelCase with `use` prefix | `useFeatureFlag.ts` |
| Context files | PascalCase + `Context` | `UserContext.tsx` |
| Server route files | kebab-case | `chat.ts` |

---

## What a Good New Feature Looks Like

A well-designed addition to Dark Trainers has all of the following:

- [ ] One or more LaunchDarkly flags defined (with key, type, default, and targeting intent documented)
- [ ] React component(s) that gate on those flags with skeleton loading states
- [ ] If personalized: uses user attributes already available on the context model (or documents new attributes needed)
- [ ] If AI-powered: reads model + prompt from an AI Config, never hardcoded
- [ ] New conversion/engagement events added to `UserContext` and fired at the right moments
- [ ] Simulation script updated with journey steps and per-tier event probabilities for the new events
- [ ] No new environment variables beyond those already defined (or explicitly justified)
- [ ] Consistent with Emotion + MUI styling patterns
