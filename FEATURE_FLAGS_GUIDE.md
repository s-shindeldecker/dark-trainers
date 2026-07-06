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

**Type:** String

VIP-only drop access gate for the AC26 collection.

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

Controls how card-creator conversions (`add_to_cart`, `card_downloaded`) are sent — a demo of two LaunchDarkly integration paths:
- **On** → pushed to the GTM dataLayer as an `ld_conversion` event; a GTM Custom HTML tag forwards it to LaunchDarkly (shows integrating LD via an existing data layer).
- **Off (default)** → sent directly via `ldClient.track()`.

Exactly one path fires per action, so conversions are never double-counted.

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
python darktrainers_simulation.py --mode launchdarkly --records 100
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
