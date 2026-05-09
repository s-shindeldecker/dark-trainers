# Gravity Farms Petfood Frontend

A demo application for **Gravity Farms Petfood**, a premium pet food subscription service crafted in Gravity Falls, Oregon. Built with React, TypeScript, and LaunchDarkly to demonstrate feature flagging, experimentation, observability, and AI Configs.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```bash
LAUNCHDARKLY_CLIENT_KEY=your-client-side-id
LAUNCHDARKLY_SDK_KEY=your-server-side-sdk-key
OPENAI_API_KEY=your-openai-api-key          # Required for AI chatbot
SERVER_PORT=3001                             # Optional, defaults to 3001
```

3. Start the development servers:
```bash
# Terminal 1 — Vite frontend (proxies /api to the backend)
npm run dev

# Terminal 2 — Express API server (AI chatbot backend)
npm run dev:server
```

## Architecture

```
├── src/                      # React frontend (Vite + TypeScript)
│   ├── components/
│   │   ├── Chat/             # AI chatbot widget (ChatWidget, ChatMessage)
│   │   ├── Hero/             # Hero section with skeleton loading
│   │   ├── Layout/           # Header, Footer, SeasonalBanner
│   │   ├── Products/         # ProductCard, product data
│   │   └── common/           # Modal
│   ├── context/              # LaunchDarkly + User context providers
│   ├── hooks/                # useFeatureFlag, useTrialDays
│   └── pages/                # Products, ProductDetail, About, FAQ, etc.
├── server/                   # Express API server
│   ├── index.ts              # Server entry point (LD server SDK + AI init)
│   └── routes/chat.ts        # POST /api/chat endpoint (AI Configs)
└── vite.config.ts            # Dev proxy: /api → Express server
```

## LaunchDarkly Integration

For **Snowflake native Experimentation** (Live Events vs Results, export cadence, and Snowflake checks), see [docs/snowflake-native-experimentation-debug.md](docs/snowflake-native-experimentation-debug.md).

### Observability SDK
The app integrates `@launchdarkly/observability` and `@launchdarkly/session-replay` as plugins to the React SDK. These automatically capture Web Vitals (CLS, FCP, LCP, TTFB, INP), errors, and session replays without manual instrumentation.

### AI Configs
The chatbot uses LaunchDarkly AI Configs via the Node.js server-side AI SDK (`@launchdarkly/server-sdk-ai`). The `gravity-farms-chatbot` AI Config controls the model, system prompt, and parameters. Metrics (tokens, latency) are tracked automatically.

### Custom Events
- `banner_click` — Tracked when users click the seasonal sale banner

## Feature Flags

| Flag Key | Type | Purpose |
|---|---|---|
| `hero-banner-text` | JSON | Controls hero headline, headline color, sub-headline, and image |
| `show-trial-button` | Boolean | Shows/hides the free trial CTA in the hero section |
| `number-of-days-trial` | Number | Number of trial days shown in button and modal copy |
| `seasonal-sale-banner-text` | String | Promotional banner text (hidden when empty) |
| `site-tagline` | String | Tagline shown in the footer |
| `show-product-catalog` | Boolean | Enables the Products nav link and product pages |
| `show-chatbot` | Boolean | Enables the floating AI chat widget |

### Hero Banner Flag (`hero-banner-text`)

```json
{
  "banner-text": "Fresh, healthy meals crafted in Gravity Falls",
  "banner-text-color": "#FFFFFF",
  "sub-banner-text": "Start your pup's journey to better health with our free trial",
  "image-file": "hero-control.jpeg"
}
```

Available hero images in `public/images/`: `hero-control.jpeg`, `hero-treatment.jpeg`, `hero-cats.jpeg`, `hero-next-generation.jpeg`, `Dogs_Snow.jpg`.

## Color Palette

| Color | Hex | Usage |
|---|---|---|
| Forest Green | `#35524A` | Primary text, borders, dark backgrounds |
| Fresh Green | `#6A994E` | Accent headings, highlights |
| Warm Yellow | `#FFD166` | Primary buttons, star ratings |
| Cream | `#F6E7CB` | Header/footer background |
| Red Accent | `#D7263D` | Button hover states |
| White | `#FFFFFF` | Card backgrounds, sub-banner text |

## Development

### Adding a feature flag
```typescript
const { value, isLoading } = useFeatureFlag('your-flag-key', defaultValue);
```

### Building for production
```bash
npm run build
```

Output goes to the `dist` directory.
 
 
