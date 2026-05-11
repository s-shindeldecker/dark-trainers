import type { ProductCategory } from '../../types/darktrainers';

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  colorway: string;
  price: number;
  memberPrice: number;
  isDropExclusive: boolean;
  releaseDate: string;
  sizes: number[];
  imageUrl: string;
  description: string;
  tags: string[];
}

const B = 'DarkTrainers';

export const products: Product[] = [
  {
    id: 'phantom-hi-x-gravity-farms',
    name: 'DarkTrainers PHANTOM HI x Gravity Farms',
    brand: B,
    category: 'lifestyle',
    colorway: 'Cream / Forest / Gum',
    price: 220,
    memberPrice: 185,
    isDropExclusive: true,
    releaseDate: '2026-05-20',
    sizes: [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12],
    imageUrl: '/images/products/phantom-hi-x-gravity-farms.webp',
    description:
      'A one-time collab between DarkTrainers and Gravity Farms. Canvas upper, forest green toe cap, gum sole. 200 pairs. No restock.',
    tags: ['collab', 'limited', 'lifestyle', 'early-access'],
  },
  {
    id: 'volt-1',
    name: 'DarkTrainers VOLT-1',
    brand: B,
    category: 'running',
    colorway: 'Volt / Black / White',
    price: 185,
    memberPrice: 155,
    isDropExclusive: true,
    releaseDate: '2026-05-20',
    sizes: [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12],
    imageUrl: '/images/products/volt-1.webp',
    description:
      'Race-day energy return with a carbon-infused plate and volt hits for low-light visibility. Built for tempo days and race pace.',
    tags: ['Limited', 'Carbon plate', 'Early access'],
  },
  {
    id: 'apex-low',
    name: 'DarkTrainers APEX LOW',
    brand: B,
    category: 'lifestyle',
    colorway: 'Triple Black',
    price: 140,
    memberPrice: 119,
    isDropExclusive: false,
    releaseDate: '2026-04-01',
    sizes: [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12],
    imageUrl: '/images/products/apex-low.webp',
    description: 'Minimal court DNA with a sculpted midsole and premium leather upper. Your daily rotation, elevated.',
    tags: ['Daily', 'Leather'],
  },
  {
    id: 'circuit-mid',
    name: 'DarkTrainers CIRCUIT MID',
    brand: B,
    category: 'training',
    colorway: 'Cool Grey / Volt',
    price: 165,
    memberPrice: 138,
    isDropExclusive: false,
    releaseDate: '2026-03-10',
    sizes: [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12],
    imageUrl: '/images/products/circuit-mid.webp',
    description: 'Lockdown fit for lifts and agility drills. Mid-cut support without the bulk.',
    tags: ['Gym', 'Stability'],
  },
  {
    id: 'phantom-hi',
    name: 'DarkTrainers PHANTOM HI',
    brand: B,
    category: 'basketball',
    colorway: 'Black / Volt',
    price: 175,
    memberPrice: 148,
    isDropExclusive: false,
    releaseDate: '2026-02-14',
    sizes: [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12, 13],
    imageUrl: '/images/products/phantom-high.webp',
    description: 'Explosive first step, padded collar, outsole pattern tuned for hardwood grip.',
    tags: ['Hoops', 'Ankle support'],
  },
  {
    id: 'shadow-runner',
    name: 'DarkTrainers SHADOW RUNNER',
    brand: B,
    category: 'running',
    colorway: 'Charcoal / White',
    price: 155,
    memberPrice: 132,
    isDropExclusive: false,
    releaseDate: '2026-01-20',
    sizes: [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12],
    imageUrl: '/images/products/shadow-runner.webp',
    description: 'Daily miles with a breathable mesh upper and tuned cushioning for neutral gait.',
    tags: ['Road', 'Neutral'],
  },
  {
    id: 'gridlock',
    name: 'DarkTrainers GRIDLOCK',
    brand: B,
    category: 'lifestyle',
    colorway: 'White / Black',
    price: 130,
    memberPrice: 110,
    isDropExclusive: false,
    releaseDate: '2025-11-05',
    sizes: [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12],
    imageUrl: '/images/products/gridlock.webp',
    description: 'Technical overlays and a crisp white base — pairs with everything in your rotation.',
    tags: ['Classic', 'Unisex'],
  },
  {
    id: 'vault-proto',
    name: 'DarkTrainers VAULT PROTO',
    brand: B,
    category: 'basketball',
    colorway: 'Volt / Anthracite',
    price: 195,
    memberPrice: 165,
    isDropExclusive: true,
    releaseDate: '2026-06-01',
    sizes: [8, 8.5, 9, 9.5, 10, 10.5, 11, 12],
    imageUrl: '/images/products/vault-proto.webp',
    description: 'Prototype cushioning stack and translucent outsole. VIP early window before public drop.',
    tags: ['Prototype', 'VIP drop'],
  },
  {
    id: 'pulse-tr',
    name: 'DarkTrainers PULSE TR',
    brand: B,
    category: 'training',
    colorway: 'Black / Cool White',
    price: 145,
    memberPrice: 122,
    isDropExclusive: false,
    releaseDate: '2026-03-28',
    sizes: [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12],
    imageUrl: '/images/products/pulse-tr.webp',
    description: 'Versatile trainer for HIIT and short runs. Low-profile stability cage.',
    tags: ['HIIT', 'Versatile'],
  },
  {
    id: 'apex-low-x-control-freak',                    // kebab-case, matches image filename
    name: 'DarkTrainers Apex Low X Control Freak',
    brand: B,
    category: 'running',                   // running | basketball | lifestyle | training
    colorway: 'Black / Neon',
    price: 190,                            // standard price
    memberPrice: 165,                      // VIP price (~15-20% off)
    isDropExclusive: true,               // true = VIP early access only
    releaseDate: '2026-05-22',
    sizes: [7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12],
    imageUrl: '/images/products/apex-low-x-control-freak.webp',
    description: 'I\'m about to lose control and I think I like it.  Tame the freak within with the new Control Freak Apex Low limited editiion drops.',
    tags: ['collab', 'limited', 'lifestyle', 'early-access']
  }
];

export function getProductById(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}
