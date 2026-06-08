import type { IdentifiedUserProfile, ProductCategory } from '../types/darktrainers';

const FIRST_NAMES = [
  'Jordan',
  'Alex',
  'Taylor',
  'Morgan',
  'Casey',
  'Riley',
  'Sam',
  'Quinn',
  'Avery',
  'Drew',
];

const LAST_NAMES = [
  'Mitchell',
  'Rivera',
  'Brooks',
  'Hayes',
  'Foster',
  'Reed',
  'Coleman',
  'Nguyen',
  'Patel',
  'Kim',
];

const US_STATES = ['CA', 'NY', 'TX', 'FL', 'IL', 'WA', 'CO', 'GA', 'MA', 'AZ'];

const CATEGORIES: ProductCategory[] = ['running', 'basketball', 'lifestyle', 'training'];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `user-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function randomMemberSince(minDaysAgo: number, maxYearsAgo: number): string {
  const now = Date.now();
  const minMs = minDaysAgo * 86_400_000;
  const maxMs = maxYearsAgo * 365.25 * 86_400_000;
  const offset = minMs + Math.random() * (maxMs - minMs);
  return new Date(now - offset).toISOString().slice(0, 10);
}

function randomSpend(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function buildNameEmail(): { name: string; email: string } {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const suffix = Math.floor(Math.random() * 900 + 100);
  return {
    name: `${first} ${last}`,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${suffix}@example.com`,
  };
}

export function generateRandomStandardUser(): IdentifiedUserProfile {
  const { name, email } = buildNameEmail();
  return {
    anonymous: false,
    key: randomUuid(),
    name,
    email,
    country: 'US',
    state: pick(US_STATES),
    memberTier: 'standard',
    memberSince: randomMemberSince(30, 2),
    lifetimeSpend: randomSpend(40, 520),
    preferredCategory: pick(CATEGORIES),
    earlyAccessEnabled: false,
  };
}

export function generateRandomVipUser(): IdentifiedUserProfile {
  const { name, email } = buildNameEmail();
  return {
    anonymous: false,
    key: randomUuid(),
    name,
    email,
    country: 'US',
    state: pick(US_STATES),
    memberTier: 'vip',
    memberSince: randomMemberSince(90, 4),
    lifetimeSpend: randomSpend(800, 4500),
    preferredCategory: pick(CATEGORIES),
    earlyAccessEnabled: true,
  };
}
