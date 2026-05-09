/**
 * LaunchDarkly flag keys for DarkTrainers (create these in your LD project).
 * AI Config keys (LaunchDarkly AI): `darktrainers-chatbot`, `darktrainers-signup-agent`.
 */
export const LD_FLAGS = {
  showVipPricing: 'show-vip-pricing',
  pdpHeroLayout: 'pdp-hero-layout',
  plpSortDefault: 'plp-sort-default',
  vipUpgradeCtaCopy: 'vip-upgrade-cta-copy',
  showDropExclusiveProducts: 'show-drop-exclusive-products',
  checkoutVipBanner: 'checkout-vip-banner',
  showChatbot: 'show-chatbot',
  showEarlyAccessCountdown: 'show-early-access-countdown',
  /** Optional top promo strip; empty string hides banner */
  promoBannerText: 'promo-banner-text',
  /** Nav: show shop link (default true in code) */
  showProductCatalog: 'show-product-catalog',
  /** Nav: VIP signup AI page */
  showVipSignup: 'show-vip-signup',
} as const;

export const DEFAULT_CHECKOUT_VIP_BANNER = {
  headline: 'Unlock VIP Pricing',
  subtext: 'Members save up to 20% on every order',
  cta: 'Join VIP — $14.99/mo',
  show: true,
} as const;
