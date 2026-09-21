/**
 * LaunchDarkly flag keys for DarkTrainers (create these in your LD project).
 * AI Config keys (LaunchDarkly AI): `darktrainers-chatbot`, `darktrainers-signup-agent`.
 */
export const PROMO_BANNER_POSITION = 'promo-banner-position';

export const LD_FLAGS = {
  showVipPricing: 'show-vip-pricing',
  pdpHeroLayout: 'pdp-hero-layout',
  plpSortDefault: 'plp-sort-default',
  vipUpgradeCtaCopy: 'vip-upgrade-cta-copy',
  showDropExclusiveProducts: 'show-drop-exclusive-products',
  showAc26DropFeed: 'show-ac26-drop-feed',
  ac26DropAccess: 'ac26-drop-access',
  checkoutVipBanner: 'checkout-vip-banner',
  showChatbot: 'show-chatbot',
  showEarlyAccessCountdown: 'show-early-access-countdown',
  /** Optional top promo strip; empty string hides banner */
  promoBannerText: 'promo-banner-text',
  /** Promo banner placement: 'top' (default) | 'bottom' */
  promoBannerPosition: PROMO_BANNER_POSITION,
  /** Nav: show shop link (default true in code) */
  showProductCatalog: 'show-product-catalog',
  /** Nav: VIP signup AI page */
  showVipSignup: 'show-vip-signup',
  /** Gates the entire Collectibles experience: nav link, routes, and pages. Default false. */
  showCollectiblesCatalog: 'show-collectibles-catalog',
  /** Unlocks VIP-gated collectibles content (e.g. unblurs the special-edition card in the drops feed). Default false; LD targets tier=vip → true. */
  showCollectiblesVipContent: 'show-collectibles-vip-content',
  /** Gates the AI Togglemon Card Creator page and its entry-point CTA. Default false. */
  showCardCreator: 'show-card-creator',
  /** Card creator conversion routing: on → via GTM dataLayer; off → direct LD track. Default false. */
  trackConversionsViaGtm: 'track-conversions-via-gtm',
  /**
   * String flag: customer-feedback note shown beside the size selector on Apex Low PDPs.
   * The string value IS the note text; empty string ('') hides the note. Default ''.
   * Experiment-ready: evaluated with deferred exposure (variationDetail) only when a
   * user reaches an Apex Low PDP — see ApexFeedbackNote in src/pages/ProductDetail.tsx.
   */
  showCustomerFeedbackOnPdp: 'show-customer-feedback-on-pdp',
  /**
   * String flag: assigned default layout for the About page (Alterra 2D/3D map
   * preference analog). 'classic' | 'immersive'. Seeds the initial activeLayout
   * on page load ONLY — the on-page toggle changes activeLayout freely after
   * that, so the flag (assignment) and activeLayout (observed state) stay two
   * separate concepts. Randomized on the `user` context (user-id = visitor id).
   */
  aboutLayoutDefault: 'about-layout-default',
  /**
   * String flag: seasonal image set for the About page. 'Summer' (current
   * images) | 'Winter' (snowboarding + ski-lodge). Read live + non-eventing so a
   * toggle swaps the hero/story images in real time. Independent of the layout
   * experiment (about-layout-default). OFF serves Summer (safe current default).
   */
  aboutSeasonalImages: 'about-seasonal-images',
  /**
   * String flag: which Hero content variation to render on the homepage.
   * 'control' | 'benefit-led' | 'drive-vip-signup' | 'court-view'. The value is a key into the
   * Contentful `launchDarklyFeatureFlag` entry's `meta` map, which points at a
   * `heroBanner` entry — all targeting stays in LD, Contentful supplies content
   * (see src/lib/heroContent.ts). Read live + non-eventing for the value, with the
   * experiment exposure recorded deliberately on Hero mount via useFlagExposure.
   */
  heroContentExperiment: 'hero-content-experiment',
  /**
   * String flag, RESERVED — nothing reads this yet. Per-vertical storefront
   * theming is a stub in this pass: the key exists so it evaluates safely to
   * 'default' (the current, unthemed storefront). 'parks' and 'cruise' are
   * placeholder variations that render nothing today. Do not attach UI to it
   * until that workstream is actually scoped.
   *
   * Deliberately vertical-generic: flag keys are immutable and visible on the
   * LD flag list, so this must not carry a customer or prospect name.
   */
  storefrontTheme: 'storefront-theme',
} as const;

/**
 * Flags evaluated **only** on the Express server via the Node SDK. They are
 * listed here so the project has one inventory of flag keys, but nothing in
 * `src/` may read them — a client-side read would bucket the visitor on the
 * browser's own evaluation and break the server-side story the demo is making.
 */
export const LD_SERVER_FLAGS = {
  /**
   * String flag: which product-search ranking algorithm the backend serves.
   * 'legacy-keyword' (control) | 'weighted-relevance' | 'personalized-affinity'.
   * Default/off → 'legacy-keyword'. Evaluated per request in
   * server/routes/search.ts with `variationDetail` (which is also the
   * experiment exposure), on a multi{session,user} context. The served arm
   * comes back to the client as the `_served` field on the search response —
   * read that, never the flag.
   */
  searchRankingAlgorithm: 'search-ranking-algorithm',
} as const;

export const DEFAULT_CHECKOUT_VIP_BANNER = {
  headline: 'Unlock VIP Pricing',
  subtext: 'Members save up to 20% on every order',
  cta: 'Join VIP — $14.99/mo',
  show: true,
} as const;
