export type MemberTier = 'standard' | 'vip';
export type ProductCategory = 'running' | 'basketball' | 'lifestyle' | 'training' | 'collectibles';

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
  // Illustrative only — mirrors a context attribute Alterra has not yet wired.
  // Carried on the LD `user` context so the About layout experiment can (later)
  // slice diagnostics like toggle behavior by resort. Not a real signal today.
  resort?: string;
  // Illustrative only — mirrors a context attribute Alterra has not yet wired.
  device?: string;
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
  resort: 'a-basin', // illustrative
  device: 'desktop', // illustrative
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
  resort: 'steamboat', // illustrative
  device: 'mobile', // illustrative
};

/**
 * Fixed demo roster with STABLE keys. The About layout experiment randomizes on
 * the `user` context, so a durable user key (= the visitor id / MGID analog) is
 * what makes an assignment persist: the same key always buckets to the same
 * variation, even across a "New Session" reload. Switching between these lets a
 * presenter show (a) different users landing in different buckets and (b) the
 * same user reliably returning to the same layout default. `user-*-demo-001`
 * reuse the single-persona demo users above so existing flows are unaffected.
 */
export const STANDARD_ROSTER: IdentifiedUserProfile[] = [
  STANDARD_DEMO_USER,
  {
    anonymous: false,
    key: 'user-standard-demo-002',
    name: 'Taylor Brooks',
    email: 'taylor@example.com',
    country: 'US',
    state: 'CO',
    memberTier: 'standard',
    memberSince: '2023-08-02',
    lifetimeSpend: 460,
    preferredCategory: 'lifestyle',
    earlyAccessEnabled: false,
    resort: 'steamboat', // illustrative
    device: 'mobile', // illustrative
  },
  {
    anonymous: false,
    key: 'user-standard-demo-003',
    name: 'Casey Reed',
    email: 'casey@example.com',
    country: 'US',
    state: 'WA',
    memberTier: 'standard',
    memberSince: '2024-05-20',
    lifetimeSpend: 130,
    preferredCategory: 'training',
    earlyAccessEnabled: false,
    resort: 'a-basin', // illustrative
    device: 'tablet', // illustrative
  },
];

export const VIP_ROSTER: IdentifiedUserProfile[] = [
  VIP_DEMO_USER,
  {
    anonymous: false,
    key: 'user-vip-demo-002',
    name: 'Morgan Hayes',
    email: 'morgan@example.com',
    country: 'US',
    state: 'IL',
    memberTier: 'vip',
    memberSince: '2021-11-10',
    lifetimeSpend: 3120,
    preferredCategory: 'lifestyle',
    earlyAccessEnabled: true,
    resort: 'a-basin', // illustrative
    device: 'desktop', // illustrative
  },
  {
    anonymous: false,
    key: 'user-vip-demo-003',
    name: 'Riley Foster',
    email: 'riley@example.com',
    country: 'US',
    state: 'TX',
    memberTier: 'vip',
    memberSince: '2022-07-19',
    lifetimeSpend: 2275,
    preferredCategory: 'running',
    earlyAccessEnabled: true,
    resort: 'steamboat', // illustrative
    device: 'mobile', // illustrative
  },
];

export function newAnonymousKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `anon-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
