# DarkTrainers

A demo application for **DarkTrainers**, a premium limited-drop sneaker brand. Built with React, TypeScript, Express, and LaunchDarkly to demonstrate full-stack feature flagging, native experimentation (BigQuery / Databricks / Snowflake), multi-context targeting, observability, session replay, and AI Configs.

The app is not a real store — it is a demonstration vehicle for LaunchDarkly's capabilities in a realistic e-commerce context. For deeper architecture and conventions, see [TECHNICAL_DESIGN_CONTEXT.md](TECHNICAL_DESIGN_CONTEXT.md).

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in values:
```bash
LAUNCHDARKLY_CLIENT_KEY=your-client-side-id    # browser React SDK
LAUNCHDARKLY_SDK_KEY=your-server-side-sdk-key   # Express server (AI Configs)
OPENAI_API_KEY=your-openai-api-key              # AI chatbot, signup agent, and Togglemon Card Creator (text + image)
SERVER_PORT=3001                                # Optional, defaults to 3001
```

The simulation script uses additional warehouse/environment keys — see [SIMULATION.md](SIMULATION.md) and [.env.example](.env.example).

3. Start the development servers:
```bash
# Terminal 1 — Vite frontend (proxies /api to the backend)
npm run dev

# Terminal 2 — Express API server (AI chatbot + signup agent backend)
npm run dev:server
```

## Architecture

```
├── src/                      # React frontend (Vite + TypeScript, Emotion + MUI)
│   ├── components/
│   │   ├── Cart/             # CartDrawer
│   │   ├── Chat/             # AI chatbot widget (ChatWidget, ChatMessage)
│   │   ├── Collectibles/     # TogglemonCard (AI-generated trading card + holo foil)
│   │   ├── Demo/             # Persona switcher (+ "New session"), demo controls, QR code modal
│   │   ├── Hero/             # Hero section with skeleton loading
│   │   ├── Layout/           # Header, Footer, SeasonalBanner (promo strip)
│   │   ├── Member/           # MemberBadge
│   │   ├── Products/         # ProductCard, product data
│   │   ├── Signup/           # VIP signup AI agent
│   │   ├── VIP/              # VIPUpgradeModal
│   │   └── common/           # Modal
│   ├── context/              # User, LaunchDarkly, Cart, VIP modal providers
│   ├── hooks/                # useFeatureFlag, useTrialDays
│   ├── lib/                  # ldFlagKeys, ldSessionKey, generateRandomUser
│   ├── pages/                # Products, ProductDetail, Drops, Account, Signup, About, FAQ, Reviews,
│   │                         #   Collectibles, CollectibleDetail, CardCreator (AI card creator)
│   └── types/                # darktrainers.ts (Product, User models)
├── server/                   # Express API server (TypeScript via tsx)
│   ├── index.ts              # Server entry point (LD server SDK + AI init)
│   ├── routes/
│   │   ├── chat.ts           # POST /api/chat (AI Config: darktrainers-chatbot)
│   │   ├── card-creator.ts   # POST /api/card-creator (+ /art) — AI Config: togglemon-card-creator
│   │   ├── signup-agent.ts   # POST /api/signup-agent (AI Config: darktrainers-signup-agent)
│   │   └── simulate.ts       # POST /api/simulate (flag evaluation for simulation)
│   ├── app.ts                # createApp() — builds the Express app (shared: local + Vercel fn)
│   └── simulation/engine.ts  # TypeScript simulation engine
├── api/index.ts              # Vercel serverless entry — runs the Express app in production
├── darktrainers_simulation.py # Python experiment data simulation (see SIMULATION.md)
└── vite.config.ts            # Dev proxy: /api → Express server
```

## LaunchDarkly Integration

**Manual setup:** In the LaunchDarkly project, add a custom context kind named **`session`** (Context kinds / schema) so pre-login evaluation and `multi` payloads with `session` + `user` are valid for targeting and Live Events. See the [User Context Model](TECHNICAL_DESIGN_CONTEXT.md#user-context-model) for the multi-context design.

For **native experimentation** debugging (Live Events vs Results, export cadence, and warehouse checks), see [RUNBOOK_BQ_NATIVE_DEBUG.md](RUNBOOK_BQ_NATIVE_DEBUG.md).

### Observability SDK
The app integrates `@launchdarkly/observability` and `@launchdarkly/session-replay` as plugins to the React client SDK. These automatically capture Web Vitals (CLS, FCP, LCP, TTFB, INP), errors, and session replays without manual instrumentation.

### AI Configs
The chatbot and VIP signup agent use LaunchDarkly AI Configs via the Node.js server-side AI SDK (`@launchdarkly/server-sdk-ai`):

- `darktrainers-chatbot` — Completion-mode config for the floating chat widget
- `darktrainers-signup-agent` — Agent config for the VIP onboarding flow
- `togglemon-card-creator` — Completion-mode config for the Togglemon Card Creator, with multiple prompt **variations** (`baseline`, `holographic`, `summer-beach`) for toggling/experimentation, and an out-of-the-box **Toxicity judge** attached (100% sampling)

Each controls the model, system prompt, and parameters. Token usage, latency, and success/error are tracked per variation via `trackOpenAIMetrics` and surfaced in the AI Config **Monitor** tab. The configured LLM provider is called via the OpenAI SDK (chatbot/agent default `gpt-4o-mini`; card creator `gpt-4o`).

### Togglemon Card Creator
A flag-gated page (`/collectibles/card-creator`) that turns a free-text creature description into a rendered trading card with AI-generated art — the flagship AI Configs demo.

- **Text:** `POST /api/card-creator` evaluates `togglemon-card-creator` on a session-inclusive context and returns a validated card (name, type, HP, rarity, two moves, flavor, `imagePrompt`).
- **Art:** `POST /api/card-creator/art` generates a text-free creature illustration via `gpt-image-1` (bounded retry on transient failures; graceful fallback to the prompt text).
- **Content safety:** the description is screened with OpenAI Moderations before generation; anything at/above a `0.7` threshold (or any hint of `sexual/minors`) returns a friendly **NoNoMon** stand-in card instead.
- **Visual editions:** Holo Rare / Ultra Rare cards render an animated holographic foil; special-edition prompts add a labeled ribbon (`edition` field).
- **Actions:** add the card to the cart (custom collectible, fires `add_to_cart`) or download it as a PNG (fires `card_downloaded`).

### Custom Events
| Event key | Where fired | Value |
|---|---|---|
| `add_to_cart` | Cart add action (incl. custom Togglemon cards) | product price |
| `card_downloaded` | Card creator "Download card" | — |
| `checkout_initiated` | Checkout start | cart total |
| `vip_upgrade` | VIP upgrade confirm | `14.99` |
| `vip_upgrade_modal_shown` | VIP upgrade modal open | — |
| `product_viewed` | Product detail view | — |
| `banner_click` | `SeasonalBanner.tsx` click | — |

## Feature Flags

| Flag Key | Type | Purpose |
|---|---|---|
| `show-product-catalog` | Boolean | Products nav link + `/products` route guard |
| `show-chatbot` | Boolean | Floating AI chat widget |
| `show-vip-signup` | Boolean | VIP signup nav link + `/signup` AI agent page |
| `show-ac26-drop-feed` | Boolean | `/drops` page (AC26 collection feed) |
| `show-vip-pricing` | Boolean | VIP member price display on PLP/PDP |
| `show-drop-exclusive-products` | Boolean | Drop-exclusive items visible on PLP |
| `show-early-access-countdown` | Boolean | Countdown timer for upcoming drops |
| `ac26-drop-access` | String | VIP-only drop access gate |
| `pdp-hero-layout` | String/JSON | PDP layout variant (`default` \| `splash`) |
| `plp-sort-default` | String | PLP sort order (`relevance` \| `newest` \| `price-asc`) |
| `vip-upgrade-cta-copy` | String | VIP upgrade CTA button text |
| `checkout-vip-banner` | JSON | VIP upsell banner config at checkout |
| `promo-banner-text` | String | Top promo strip (empty string = hidden) |
| `promo-banner-position` | String | Promo strip placement (`top` \| `bottom`) |
| `show-collectibles-catalog` | Boolean | Collectibles nav link, `/collectibles` routes, and the card-creator CTA |
| `show-collectibles-vip-content` | Boolean | Unlocks VIP-gated collectibles content (LD targets `tier=vip`) |
| `show-card-creator` | Boolean | Togglemon Card Creator page (`/collectibles/card-creator`) + PLP CTA |
| `track-conversions-via-gtm` | Boolean | Card creator & collectible conversions route via GTM dataLayer (on) or direct LD track (off) |

See [FEATURE_FLAGS_GUIDE.md](FEATURE_FLAGS_GUIDE.md) for details on each flag.

## Demo Personas

| Persona | Tier | Notable attributes |
|---|---|---|
| Guest | — | Anonymous; `session` context only |
| Standard | `standard` | Jordan Mitchell, CA, $285 lifetime spend |
| VIP | `vip` | Alex Rivera, NY, $1,840 lifetime spend, early access enabled |

Switch personas in-app via the demo controls panel. See [DEMO_SCRIPTS.md](DEMO_SCRIPTS.md) for guided demo walkthroughs.

## Development

### Reading a feature flag
```typescript
const { value, isLoading } = useFeatureFlag('your-flag-key', defaultValue);

if (isLoading) return <SkeletonLoader />;  // anti-flicker is mandatory on gated content
return value ? <FeatureComponent /> : <FallbackComponent />;
```

### Building for production
```bash
npm run build
```

Output goes to the `dist` directory. Deployment is to Vercel as an SPA (rewrite via [vercel.json](vercel.json)).
