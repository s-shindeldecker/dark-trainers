# Gravity Farms Petfood Frontend

This is the frontend application for Gravity Farms Petfood, a premium pet food subscription service crafted in Gravity Falls, Oregon, built with React and LaunchDarkly for feature flagging.

## Color Palette

The application uses a consistent color palette inspired by nature and farm-fresh aesthetics:

### Primary Colors
- **Forest Green**: `#35524A` - Main text color, borders, and primary elements
- **Fresh Green**: `#6A994E` - Accent color for headings and highlights
- **Warm Yellow**: `#FFD166` - Primary button color and star ratings
- **Cream**: `#F6E7CB` - Background color for header and footer

### Secondary Colors
- **Red Accent**: `#D7263D` - Hover state for buttons and interactive elements
- **Green Accent**: `#4caf50` - Logo color and link hover states
- **White**: `#FFFFFF` - Card backgrounds and text on dark backgrounds
- **Gray Text**: `#555` - Secondary text in footer and navigation

### Usage Examples
- **Headers & Navigation**: `#F6E7CB` background with `#35524A` text
- **Buttons**: `#FFD166` background with `#35524A` text, hover to `#D7263D`
- **Cards & Content**: `#FFFFFF` background with `#35524A` text
- **Accent Elements**: `#6A994E` for headings and special text
- **Interactive Elements**: `#4caf50` for hover states and links

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with your LaunchDarkly client ID:
```bash
VITE_LAUNCHDARKLY_CLIENT_ID=your-client-side-id
```

3. Start the development server:
```bash
npm run dev
```

## Features

- React with TypeScript
- LaunchDarkly integration for feature flags
- Emotion for styled components
- React Router for navigation
- Material-UI components

## Project Structure

```
src/
├── components/
│   ├── Hero/
│   │   ├── HeroSection.tsx
│   │   ├── HeroSkeleton.tsx
│   │   └── HeroVariants.tsx
│   ├── Layout/
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   └── SeasonalBanner.tsx
│   └── common/
│       ├── Button.tsx
│       └── Card.tsx
├── hooks/
│   ├── useFeatureFlag.ts
│   └── useTrialDays.ts
├── context/
│   └── LDContext.tsx
├── pages/
│   ├── Home.tsx
│   ├── Plans.tsx
│   └── About.tsx
└── App.tsx
```

## Feature Flags

### Seasonal Sale Banner
- **Flag key:** `seasonal-sale-banner-text` (use camelCase `seasonalSaleBannerText` in React code)
- **Type:** String
- **Default value:** `''` (empty string - banner hidden when empty)
- Controls the text displayed in a promotional banner above the main navigation header.
- The banner only appears when the flag has a non-empty value.
- Perfect for seasonal promotions, sales announcements, or special offers.

### Hero Banner (Image, Text, and Style)

The application uses a single LaunchDarkly JSON flag to control the hero banner image, text, colors, and alignment:

- **Flag key:** `hero-banner-text` (use camelCase `heroBannerText` in React code)
- **Type:** JSON
- **Example value:**

```json
{
  "banner-text": "Fresh, healthy meals delivered for your dog",
  "banner-text-color": "#FFFFFF",
  "sub-banner-text": "Start your pup's journey to better health with our free trial",
  "sub-banner-text-color": "#FFFFFF",
  "horiz-justification": "center",
  "vert-justification": "top",
  "image-file": "hero-control.jpeg"
}
```

- `banner-text`: Main heading text
- `banner-text-color`: Hex color for the main heading
- `sub-banner-text`: Subheading text
- `sub-banner-text-color`: Hex color for the subheading
- `horiz-justification`: `left`, `right`, or `center` (text alignment)
- `vert-justification`: `top`, `bottom`, or `center` (vertical placement)
- `image-file`: Filename of the hero image in `public/images/`

**To add a new hero variation:**
1. Place your new image in `frontend/public/images/` (e.g., `hero-summer.jpg`).
2. Add a new variation in LaunchDarkly with the desired JSON structure and image filename.
3. Assign users/contexts to the new variation as needed.

### Trial Days
- **Flag key:** `number-of-days-trial` (use camelCase `numberOfDaysTrial` in React code)
- **Type:** Number
- **Default value:** 7
- Controls the number of days offered in the free trial throughout the application.
- Used in: Hero section button text, modal content, and any other trial-related messaging.

### Trial Button
- **Flag key:** `show-trial-button` (use camelCase `showTrialButton` in React code)
- **Type:** Boolean
- Controls the visibility of the trial button in the hero section.
- The button text dynamically shows the trial days from the `number-of-days-trial` flag.

## Fallback/Default Image Logic
- If the `image-file` property is missing, the app will use a default image (`hero-control.jpeg`).
- If the flag is missing or incomplete, sensible defaults are used for all properties.

## Development

To add new feature flags:

1. Create the flag in LaunchDarkly
2. Use the `useFeatureFlag` hook in your component:
```typescript
const { value, isLoading } = useFeatureFlag('yourFlagKey', defaultValue);
```

For trial days specifically, use the `useTrialDays` hook:
```typescript
const { trialDays, isLoading } = useTrialDays(7);
```

## Building for Production

```bash
npm run build
```

The build output will be in the `dist` directory.

## Adding a New Hero Image Variation

1. Place your new hero image (e.g., `hero-summer.jpg`) in the `frontend/public/images/` directory.
2. In LaunchDarkly, add a new variation to the `hero-image` flag with the value set to the filename (e.g., `hero-summer.jpg`).
3. Assign users/contexts to the new variation as needed.
4. The React app will automatically use `/images/{flagValue}` as the hero image.

## Trial Button and Modal
- The visibility of the trial button is controlled by the `show-trial-button` flag in LaunchDarkly.
- The number of days shown in the button text and modal is controlled by the `number-of-days-trial` flag.
- When enabled, the button appears in the hero section and opens a modal for trial signup.
- Perfect for A/B testing different trial durations to optimize conversion rates.
