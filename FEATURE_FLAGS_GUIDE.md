# DarkTrainers - Feature Flags Guide

This guide explains the feature flags and AI Configs used in the DarkTrainers demo application, their keys, types, and how they affect the user experience.

## Overview

DarkTrainers is a premium limited-drop sneaker brand demo. It uses LaunchDarkly feature flags, native experimentation, observability, and AI Configs to showcase full-stack flag-driven development in a realistic e-commerce context. The flag keys are defined in [`src/lib/ldFlagKeys.ts`](src/lib/ldFlagKeys.ts).

## Observability

The frontend integrates `@launchdarkly/observability` and `@launchdarkly/session-replay` as plugins to the React client SDK. These automatically capture:

- **Web Vitals:** CLS, FCP, LCP, TTFB, INP
- **Error monitoring:** Uncaught exceptions and promise rejections
- **Session replays:** End-user session recordings with `strict` privacy

No manual instrumentation is required for these — they activate when the LD SDK initializes.

### Custom Events

These events are manually tracked via `ldClient.track()`:

| Event | Location | Trigger |
|---|---|---|
| `add_to_cart` | Cart add action | User adds a product — or a custom Togglemon card — to the cart (value = price) |
| `card_downloaded` | Card creator | User downloads their generated Togglemon card as a PNG |
| `checkout_initiated` | Checkout start | User initiates checkout (value = cart total) |
| `vip_upgrade` | VIP upgrade confirm | User confirms a VIP upgrade (value = `14.99`) |
| `vip_upgrade_modal_shown` | `VIPUpgradeModal.tsx` | VIP upgrade modal is shown |
| `product_viewed` | Product detail page | User views a product detail page |
| `banner_click` | `SeasonalBanner.tsx` | User clicks the promo banner |
| `search_performed` | `server/routes/search.ts` | **Server-side.** Every `/api/search` call (value = number of results returned) |
| `search_zero_results` | `server/routes/search.ts` | **Server-side.** A search query returned nothing |
| `search_result_clicked` | `Products.tsx` (PLP) | User clicks through to a search result (value = product price) |

## Feature Flags

### Boolean Flags

#### 1. Product Catalog (`show-product-catalog`)

**Type:** Boolean &nbsp; **Default:** `false`

Adds the "Products" link to the navigation and exposes the `/products` (PLP) and `/products/:id` (PDP) routes.

#### 2. AI Chatbot (`show-chatbot`)

**Type:** Boolean &nbsp; **Default:** `false`

Renders a floating chat widget in the bottom-right corner. The chatbot uses the `darktrainers-chatbot` AI Config to control model, system prompt, and generation parameters.

**Requires:** The Express API server running (`npm run dev:server`) and a valid `OPENAI_API_KEY` in `.env`.

#### 3. VIP Signup (`show-vip-signup`)

**Type:** Boolean &nbsp; **Default:** `true`

Shows the VIP signup nav link and the `/signup` route, which runs an AI onboarding agent backed by the `darktrainers-signup-agent` AI Config.

#### 4. AC26 Drop Feed (`show-ac26-drop-feed`)

**Type:** Boolean &nbsp; **Default:** `false`

Enables the `/drops` page — the AgentControl '26 (AC26) limited-drop collection feed.

#### 5. VIP Pricing (`show-vip-pricing`)

**Type:** Boolean &nbsp; **Default:** `true`

Shows VIP member pricing alongside standard pricing on the PLP and PDP.

#### 6. Drop-Exclusive Products (`show-drop-exclusive-products`)

**Type:** Boolean &nbsp; **Default:** `true`

Controls whether drop-exclusive products (`isDropExclusive: true`) appear on the product listing page.

#### 7. Early Access Countdown (`show-early-access-countdown`)

**Type:** Boolean &nbsp; **Default:** `false`

Shows a countdown timer for upcoming drops.

### String / JSON Flags

#### 8. AC26 Drop Access (`ac26-drop-access`)

**Type:** String &nbsp; **Variations:** `teaser` / `early-access` / `full-access` &nbsp; **Default:** `teaser`

Drop entitlement for `isDropExclusive` products. All three variations do something
distinct, and each maps to one internal state in
[`src/lib/dropAccess.ts`](src/lib/dropAccess.ts):

| Variation | State | Behavior on a drop-exclusive product |
|---|---|---|
| `teaser` | `hidden` | Not shown at all — absent from the grid, absent from search results, and the PDP returns the same "Product not found." as an unknown ID |
| `early-access` | `view-only` | Shown everywhere, **purchase blocked**: the card's CTA becomes access-required messaging, the PDP's button becomes "Unlock with VIP" |
| `full-access` | `full-access` | Shown and purchasable, normal CTA |

Anything unrecognized (including a variation added in the LD UI that the code
doesn't know yet) falls to `hidden` — the closed state. An unknown variation must
never accidentally unlock a drop.

Gating keys off the catalog's **`isDropExclusive` boolean**, never on tag text. The
older grid filter tested `tags.includes('early-access')` and silently missed
`volt-1` (tagged `'Early access'`, capitalized), leaking a drop-exclusive SKU into
the guest grid. Tag strings are untouched; nothing gates on them.

One mapping, two evaluations: the browser evaluates the flag with the React SDK for
the grid and PDP, the Express server evaluates it with the Node SDK via the single
resolver [`server/search/access.ts`](server/search/access.ts) for `/api/search`.
Both map the value through the same table, so they cannot drift.

#### 9. PDP Hero Layout (`pdp-hero-layout`)

**Type:** String / JSON

Selects the product detail page hero layout variant (e.g. `default` | `splash`).

#### 10. PLP Sort Default (`plp-sort-default`)

**Type:** String

Default sort order on the product listing page (`relevance` | `newest` | `price-asc`).

#### 11. VIP Upgrade CTA Copy (`vip-upgrade-cta-copy`)

**Type:** String

Button text shown on the VIP upgrade call-to-action.

#### 12. Checkout VIP Banner (`checkout-vip-banner`)

**Type:** JSON

Configures the VIP upsell banner shown at checkout for non-VIP users.

```json
{
  "headline": "Unlock VIP Pricing",
  "subtext": "Members save up to 20% on every order",
  "cta": "Join VIP — $14.99/mo",
  "show": true
}
```

#### 13. Promo Banner Text (`promo-banner-text`)

**Type:** String &nbsp; **Default:** `""` (empty — banner hidden)

Displays a promotional strip near the top of the site. The banner only renders when the flag has a non-empty value. Clicking the banner tracks a `banner_click` event.

#### 14. Promo Banner Position (`promo-banner-position`)

**Type:** String &nbsp; **Default:** `top`

Controls placement of the promo strip (`top` | `bottom`).

### Collectibles & Card Creator Flags

#### 15. Collectibles Catalog (`show-collectibles-catalog`)

**Type:** Boolean &nbsp; **Default:** `false`

Gates the entire Collectibles experience: the nav link, the `/collectibles` and `/collectibles/:id` routes, and the Togglemon Card Creator entry-point CTA on the PLP.

#### 16. Collectibles VIP Content (`show-collectibles-vip-content`)

**Type:** Boolean &nbsp; **Default:** `false`

Unlocks VIP-gated collectibles content (e.g. unblurs the special-edition card in the drops feed). LD typically targets `tier=vip → true`.

#### 17. Card Creator (`show-card-creator`)

**Type:** Boolean &nbsp; **Default:** `false`

Gates the Togglemon Card Creator page (`/collectibles/card-creator`) and its CTA on the Collectibles PLP (the CTA also requires `show-collectibles-catalog`). See [Togglemon Card Creator](#togglemon-card-creator) below.

**Requires:** the Express API server running (`npm run dev:server`) and a valid `OPENAI_API_KEY`.

#### 18. Conversion Routing (`track-conversions-via-gtm`)

**Type:** Boolean &nbsp; **Default:** `false`

Controls how conversions (e.g. `add_to_cart`, `product_viewed`, `card_downloaded`) are sent across the Card Creator and Collectibles pages — a demo of two LaunchDarkly integration paths:
- **On** → pushed to the GTM dataLayer as an `ld_conversion` event; a GTM Custom HTML tag forwards it to LaunchDarkly (shows integrating LD via an existing data layer).
- **Off (default)** → sent directly via `ldClient.track()`.

Both pages share the `useTrackConversion` hook (`src/hooks/useTrackConversion.ts`), so exactly one path fires per action (never double-counted), and the numeric conversion value is forwarded in both modes so numeric metrics behave identically either way. In GTM mode the Custom HTML tag must read a `dlv - value` Data Layer Variable and pass it to `ldClient.track()` — see `src/lib/gtmStub.ts`.

### Server-Side Flags

Evaluated with the **Node server SDK** inside Express, never in the browser. Listed in
`LD_SERVER_FLAGS` (`src/lib/ldFlagKeys.ts`) so the project keeps one flag inventory,
but nothing in `src/` may read them.

#### 19. Search Ranking Algorithm (`search-ranking-algorithm`)

**Type:** String &nbsp; **Variations:** `legacy-keyword` (control) / `weighted-relevance` / `personalized-affinity` &nbsp; **Default:** `legacy-keyword`

Which ranking algorithm the backend search engine serves. This is the server-side
experimentation demo: the flag is evaluated per request in `server/routes/search.ts` on
a `multi{session,user}` context, the served arm selects the ranking function, and the
`search_performed` / `search_zero_results` events are emitted by the server. The client
gets the served arm back only as the response's `_served` field and never evaluates the
flag itself.

- **`legacy-keyword`** — naive substring match, every field weighted the same, ties
  broken alphabetically. Meant to look basic.
- **`weighted-relevance`** — field weighting (name > tags > body), exact tag overlap,
  price proximity to the matched set's median, and exponential recency decay on
  `releaseDate`.
- **`personalized-affinity`** — flat keyword base plus the requester's
  `preferredCategory` and `memberTier`; VIP gets a further push toward
  `isDropExclusive` and limited/collab items, Standard toward the biggest member
  savings, a guest toward general-release stock. A guest with no attributes degrades
  to the control arm's ordering, which is the honest outcome.

**Requires:** the Express API server running (`npm run dev:server`). The served arm is
visible live in the Demo controls panel under "Server-side search".

The route also evaluates **`ac26-drop-access`** on the same context to apply drop
entitlement before it counts results, so `search_performed`'s value equals what the
visitor sees. Guest/Standard get `teaser` (early-access drops withheld); VIP gets
`full-access`. Searching `ac26` as a guest is the clean way to demo it: 6 ranked hits,
0 shown, `search_zero_results` fires.

**Experiment setup:** primary metric `search_result_clicked`; `search_performed` as a
volume guardrail. Randomize on `session` so guest traffic is bucketed too — that
context kind must be marked *available for experiments* in LD (Code → Contexts → gear
→ Edit); kinds auto-created from SDKs are not by default.

#### 20. Storefront Theme (`storefront-theme`)

**Type:** String &nbsp; **Variations:** `default` / `parks` / `cruise` &nbsp; **Default:** `default`

**Reserved, wired to nothing.** The key exists so it evaluates safely to `default` —
the current, unthemed storefront. `parks` and `cruise` are placeholder variations that
render nothing today. Do not attach UI to it until per-vertical theming is actually
scoped.

> Naming note: flag keys are **immutable** in LaunchDarkly and appear on the main flag
> list, so a key must never carry a customer or prospect name. This flag replaced an
> earlier vertical-specific key for exactly that reason — the only way to change a key
> is to create a new flag and repoint the code.

## AI Configs

The Express server (`server/routes/`) uses the LaunchDarkly Node.js server-side AI SDK (`@launchdarkly/server-sdk-ai`):

| AI Config key | Mode | Route | Purpose |
|---|---|---|---|
| `darktrainers-chatbot` | Completion | `POST /api/chat` | Floating chat widget |
| `darktrainers-signup-agent` | Agent | `POST /api/signup-agent` | VIP onboarding agent |
| `togglemon-card-creator` | Completion | `POST /api/card-creator` | Togglemon Card Creator (multiple prompt variations + Toxicity judge) |

For each request the server:

1. Evaluates the AI Config for the current user/session context
2. Merges the AI Config's messages with conversation history and the user's message
3. Calls the configured LLM provider via the OpenAI SDK (chatbot/agent default `gpt-4o-mini`; card creator `gpt-4o`)
4. Tracks token usage, latency, and success/error back to LaunchDarkly via `trackOpenAIMetrics`, then flushes events (required on serverless) so they appear in the Monitor tab per variation

### Togglemon Card Creator

The `togglemon-card-creator` config has multiple prompt **variations** — `baseline`, `holographic` ("Holographic Edition"), and `summer-beach` ("Summer Heat Special Edition") — for live toggling, targeting, or experiments (e.g. session-randomized across variations, measured on `add_to_cart` / `card_downloaded`). An out-of-the-box **Toxicity judge** is attached at 100% sampling for output observability.

- **`POST /api/card-creator`** — evaluates the config on a session-inclusive context (session-only for anonymous, `multi{session,user}` for identified) so it aligns with session-randomized experiments, then returns a validated card. Screens the description with **OpenAI Moderations** first; content at/above `0.7` (or any `sexual/minors`) returns a friendly **NoNoMon** stand-in instead of generating.
- **`POST /api/card-creator/art`** — generates a text-free creature illustration via `gpt-image-1`, with a bounded retry on transient failures and graceful fallback to the prompt text.

> **Note:** the image model's own moderation is a second safety layer, and content-policy refusals are not retried.

## Simulation (Python)

The Python simulation script [`darktrainers_simulation.py`](darktrainers_simulation.py) generates synthetic guest and identified user journeys, evaluates flags via the server-side SDK, and optionally writes custom metric events to a warehouse (BigQuery, Databricks, or Snowflake) for native experimentation. See [SIMULATION.md](SIMULATION.md) for full usage and configuration.

```bash
python darktrainers_simulation.py --profile production-bq --records 300
python darktrainers_simulation.py --records 100  # LD-only (no --profile)

# Dimensional (star) warehouse model, Databricks only. Default is --warehouse-schema legacy.
python darktrainers_simulation.py --profile test-databricks --warehouse-schema both --records 300
```

## Environment Variables

| Variable | Required For | Description |
|---|---|---|
| `LAUNCHDARKLY_CLIENT_KEY` | Frontend | Client-side ID for the React SDK |
| `LAUNCHDARKLY_SDK_KEY` | Backend | Server-side SDK key for the Express server |
| `OPENAI_API_KEY` | Chatbot, signup agent, card creator | OpenAI API key for LLM calls, image generation, and moderation |
| `SERVER_PORT` | Backend | Express server port (default: 3001) |

The simulation script uses additional per-warehouse keys — see [SIMULATION.md](SIMULATION.md) and [.env.example](.env.example).

## Reading a Feature Flag

All flag reads go through the `useFeatureFlag` hook, which waits for SDK initialization to prevent UI flicker:

```typescript
const { value, isLoading } = useFeatureFlag(LD_FLAGS.showChatbot, false);

if (isLoading) return <SkeletonLoader />;
return value ? <ChatWidget /> : null;
```

## Best Practices

1. **Flag naming:** Use kebab-case for flag keys (e.g., `show-product-catalog`)
2. **Centralize keys:** Add new flag keys to `src/lib/ldFlagKeys.ts` rather than inlining string literals
3. **Default values:** Always provide sensible defaults that produce a working UI
4. **Loading states:** Gate flag-controlled content behind `isLoading` to prevent flicker
5. **Server-side secrets:** AI Configs and LLM keys are read on the Express server only — never in the browser
6. **Simulation coverage:** New conversion/engagement events need a corresponding entry in the simulation script
