# Gravity Farms Petfood - Feature Flags Guide

This guide explains the feature flags used in the Gravity Farms Petfood demo application, their keys, types, and how they affect the user experience.

## Overview

The Gravity Farms demo uses LaunchDarkly feature flags to demonstrate experimentation, observability, and AI Config capabilities. The application simulates a pet food subscription service with various user journeys and conversion events.

## Observability

The frontend integrates `@launchdarkly/observability` and `@launchdarkly/session-replay` as plugins to the React client SDK. These automatically capture:

- **Web Vitals:** CLS, FCP, LCP, TTFB, INP, FID
- **Error monitoring:** Uncaught exceptions and promise rejections
- **Session replays:** End-user session recordings with `strict` privacy

No manual instrumentation is required for these — they activate when the LD SDK initializes.

### Custom Events

These events are manually tracked via `ldClient.track()`:

| Event | Location | Trigger |
|---|---|---|
| `banner_click` | `SeasonalBanner.tsx` | User clicks the seasonal promo banner |

## Feature Flags

### 1. Hero Banner Configuration (`hero-banner-text`)

**Type:** JSON  
**Default:** See below

Controls the hero section on the homepage: headline, headline color, sub-headline, and background image.

```json
{
  "banner-text": "Fresh, healthy meals crafted in Gravity Falls",
  "banner-text-color": "#FFFFFF",
  "sub-banner-text": "Start your pup's journey to better health with our free trial",
  "image-file": "hero-control.jpeg"
}
```

| Field | Description |
|---|---|
| `banner-text` | Main headline text |
| `banner-text-color` | Hex color for the headline |
| `sub-banner-text` | Subheadline text (always white) |
| `image-file` | Filename in `public/images/` |

**Available images:** `hero-control.jpeg`, `hero-treatment.jpeg`, `hero-cats.jpeg`, `hero-next-generation.jpeg`, `Dogs_Snow.jpg`

**Anti-flicker:** The hero renders a skeleton loading state until flag values arrive, preventing the flash of default content on context switches.

### 2. Trial Button (`show-trial-button`)

**Type:** Boolean  
**Default:** `false`

Shows or hides the "Try N Days Free" CTA button in the hero section. When enabled, clicking the button opens a trial signup modal.

### 3. Trial Days (`number-of-days-trial`)

**Type:** Number  
**Default:** `7`

Controls how many trial days appear in the button text and modal copy. Used in combination with `show-trial-button`.

### 4. Seasonal Sale Banner (`seasonal-sale-banner-text`)

**Type:** String  
**Default:** `""` (empty — banner hidden)

Displays a promotional gradient banner above the main navigation. The banner only renders when the flag has a non-empty value. Clicking the banner tracks a `banner_click` event and navigates to the About page.

### 5. Site Tagline (`site-tagline`)

**Type:** String  
**Default:** `"Crafted in Gravity Falls, delivered to your door"`

Controls the tagline displayed in the footer beneath the copyright notice.

### 6. Product Catalog (`show-product-catalog`)

**Type:** Boolean  
**Default:** `false`

When enabled, adds a "Products" link to the navigation and exposes the `/products` and `/products/:id` routes. The product catalog shows three subscription tiers: Basic Bites ($29/mo), Premium Paws ($49/mo), and Deluxe Den ($79/mo).

### 7. AI Chatbot (`show-chatbot`)

**Type:** Boolean  
**Default:** `false`

When enabled, renders a floating chat widget in the bottom-right corner. The chatbot uses LaunchDarkly AI Configs to control the model, system prompt, and generation parameters.

**Requires:** The Express API server running (`npm run dev:server`) and a valid `OPENAI_API_KEY` in `.env`.

**AI Config key:** `gravity-farms-chatbot` (create this in your LaunchDarkly project as a Completion-mode AI Config)

## AI Configs

The chatbot backend (`server/routes/chat.ts`) uses the LaunchDarkly Node.js server-side AI SDK:

1. Evaluates the `gravity-farms-chatbot` AI Config for the current user context
2. Merges the AI Config's messages with conversation history and the user's message
3. Calls the configured LLM provider (defaults to `gpt-4o-mini`)
4. Tracks token usage and latency metrics back to LaunchDarkly

## Simulation (Python)

The Python simulation scripts (`gravityfarms_simulation.py`, `run_continuous_simulation.py`) generate synthetic user traffic for experimentation. They evaluate flags via the server-side Python SDK and track events like `page_view`, `trial_signup`, `trial_to_paid_conversion`, `total_revenue`, and `banner_click`.

### Running the simulation

```bash
python gravityfarms_simulation.py --records 100 --mode launchdarkly
python run_continuous_simulation.py --mode launchdarkly
```

## Environment Variables

| Variable | Required For | Description |
|---|---|---|
| `LAUNCHDARKLY_CLIENT_KEY` | Frontend | Client-side ID for the React SDK |
| `LAUNCHDARKLY_SDK_KEY` | Backend / Simulation | Server-side SDK key |
| `OPENAI_API_KEY` | Chatbot | OpenAI API key for LLM calls |
| `SERVER_PORT` | Backend | Express server port (default: 3001) |

## Adding New Feature Flags

1. Create the flag in LaunchDarkly
2. Use the `useFeatureFlag` hook in your component:
```typescript
const { value, isLoading } = useFeatureFlag('your-flag-key', defaultValue);
```
3. Gate rendering on `isLoading` if the flag controls visible content
4. Update this guide with the new flag

## Best Practices

1. **Flag naming:** Use kebab-case for flag keys (e.g., `show-product-catalog`)
2. **Default values:** Always provide sensible defaults that produce a working UI
3. **Loading states:** Gate content behind `isLoading` to prevent flicker
4. **Event tracking:** Use consistent, descriptive event names
5. **Feature gating:** Wrap all new customer-facing features with a boolean flag
