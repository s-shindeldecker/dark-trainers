export type MemberTier = 'standard' | 'vip';
export type ProductCategory = 'running' | 'basketball' | 'lifestyle' | 'training';

/** Identified user attributes sent to LaunchDarkly (Standard / VIP demo personas). */
export type IdentifiedUserProfile = {
  anonymous: false;
  key: string;
  name: string;
  email: string;
  country: string;
  state: string;
  memberTier: MemberTier;
  memberSince: string;
  lifetimeSpend: number;
  preferredCategory: ProductCategory;
  earlyAccessEnabled: boolean;
};

export type AnonymousUserProfile = {
  anonymous: true;
  key: string;
};

export type AppUser = AnonymousUserProfile | IdentifiedUserProfile;

export function isIdentifiedUser(user: AppUser): user is IdentifiedUserProfile {
  return user.anonymous === false;
}

export const STANDARD_DEMO_USER: IdentifiedUserProfile = {
  anonymous: false,
  key: 'user-standard-demo-001',
  name: 'Jordan Mitchell',
  email: 'jordan@example.com',
  country: 'US',
  state: 'CA',
  memberTier: 'standard',
  memberSince: '2024-01-15',
  lifetimeSpend: 285,
  preferredCategory: 'running',
  earlyAccessEnabled: false,
};

export const VIP_DEMO_USER: IdentifiedUserProfile = {
  anonymous: false,
  key: 'user-vip-demo-001',
  name: 'Alex Rivera',
  email: 'alex@example.com',
  country: 'US',
  state: 'NY',
  memberTier: 'vip',
  memberSince: '2022-03-15',
  lifetimeSpend: 1840,
  preferredCategory: 'basketball',
  earlyAccessEnabled: true,
};

export function newAnonymousKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `anon-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
