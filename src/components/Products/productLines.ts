import type { Product } from './productData';
import type { ProductCategory } from '../../types/darktrainers';

/**
 * Product "lines" for the PLP grid: one card per distinct product photo.
 *
 * The catalog has more SKUs than it has photographs. Line extensions added with
 * the catalog expansion reuse their silhouette's image — what a real store does
 * for a colorway variant — which meant the grid showed the same shoe several
 * times over. Grouping fixes that without commissioning 20+ new images.
 *
 * The rule is deliberately "one card per distinct photo", not "one card per
 * silhouette":
 *
 *  - A SKU whose photo is unique renders as a normal product card, exactly as
 *    before. The three AC26 VOLT-HI colorways each have their own shot, so they
 *    stay three cards — which is correct, and how a store shows three colorways.
 *  - SKUs that share a photo collapse into one card showing the line name,
 *    how many models it holds, and a "from" price.
 *
 * So grouping only ever engages where there is an actual visual duplicate, and
 * never misrepresents a product that has its own picture.
 *
 * Members are declared explicitly below rather than derived from `imageUrl` at
 * runtime. Deriving would silently re-group the grid the moment an image path
 * changed; this way the grouping is a reviewed decision, and
 * `assertLineCoverage` catches a SKU that was added without being placed.
 */

interface LineDef {
  /** Stable key — also the React key and the basis of the card's identity. */
  key: string;
  /** Shown when the line holds more than one model. */
  name: string;
  memberIds: string[];
}

/**
 * Only groups that share a photo need declaring. Every other footwear SKU
 * becomes a single-member line automatically.
 */
const LINE_DEFS: LineDef[] = [
  { key: 'volt-hi', name: 'VOLT-HI', memberIds: ['volt-hi-ac26-magenta', 'volt-hi-city'] },
  {
    key: 'apex-low-ac26',
    name: "APEX LOW x AC26",
    memberIds: ['apex-low-ac26-monstar', 'apex-low-ac26-sequel'],
  },
  {
    key: 'phantom-hi-collab',
    name: 'PHANTOM HI',
    memberIds: ['phantom-hi-x-gravity-farms', 'phantom-hi-heritage'],
  },
  {
    key: 'volt-run',
    name: 'VOLT',
    memberIds: ['volt-1', 'volt-1-eclipse', 'volt-2-pacer', 'volt-hydro'],
  },
  { key: 'apex', name: 'APEX', memberIds: ['apex-low', 'apex-low-sail', 'apex-mid-oxide'] },
  {
    key: 'circuit',
    name: 'CIRCUIT',
    memberIds: ['circuit-mid', 'circuit-mid-pro', 'circuit-low-flex', 'circuit-strap'],
  },
  {
    key: 'phantom',
    name: 'PHANTOM',
    memberIds: ['phantom-hi', 'phantom-hi-elite', 'phantom-lo', 'phantom-post'],
  },
  {
    key: 'shadow-runner',
    name: 'SHADOW RUNNER',
    memberIds: ['shadow-runner', 'shadow-runner-trail', 'shadow-runner-lite'],
  },
  {
    key: 'gridlock',
    name: 'GRIDLOCK',
    memberIds: ['gridlock', 'gridlock-noir', 'gridlock-court-canvas'],
  },
  {
    key: 'vault',
    name: 'VAULT',
    memberIds: ['vault-proto', 'vault-proto-ii', 'vault-court-classic'],
  },
  {
    key: 'pulse',
    name: 'PULSE',
    memberIds: ['pulse-tr', 'pulse-tr-2', 'pulse-tr-studio', 'pulse-trail-tr'],
  },
];

/** Every SKU that belongs to a declared multi-model line. */
const GROUPED_IDS = new Set(LINE_DEFS.flatMap((line) => line.memberIds));

export interface ProductLine {
  key: string;
  /** Line name for a multi-model card; the product's own name for a single. */
  name: string;
  /** Only set on a single-model card, where the SKU's own subtitle still applies. */
  subtitle?: string;
  category: ProductCategory;
  imageUrl: string;
  /** Visible members, in catalog order. Never empty. */
  members: Product[];
  /** Where the card links, and whose price/purchasability the card reflects. */
  primary: Product;
  /** Lowest price among visible members. */
  priceFrom: number;
  /** Lowest member price among visible members. */
  memberPriceFrom: number;
  /** True when this is an ordinary one-SKU card. */
  isSingle: boolean;
}

function toLine(key: string, lineName: string | undefined, members: Product[]): ProductLine {
  // Cheapest visible member is the card's representative: it backs the "from"
  // price, so the card must link to the product that price refers to.
  const primary = members.reduce((cheapest, p) => (p.price < cheapest.price ? p : cheapest));
  const isSingle = members.length === 1;
  return {
    key,
    name: isSingle ? primary.name : (lineName ?? primary.name),
    subtitle: isSingle ? primary.subtitle : undefined,
    category: primary.category,
    imageUrl: primary.imageUrl,
    members,
    primary,
    priceFrom: Math.min(...members.map((p) => p.price)),
    memberPriceFrom: Math.min(...members.map((p) => p.memberPrice)),
    isSingle,
  };
}

/**
 * Group an already-filtered product list into grid cards.
 *
 * Takes the *visible* products — entitlement filtering happens before this, so
 * a hidden member simply isn't there, and a line whose every member is hidden
 * disappears from the grid rather than rendering an empty card.
 */
export function buildProductLines(visible: Product[]): ProductLine[] {
  const byId = new Map(visible.map((p) => [p.id, p]));
  const lines: ProductLine[] = [];
  const consumed = new Set<string>();

  for (const def of LINE_DEFS) {
    const members = def.memberIds
      .map((id) => byId.get(id))
      .filter((p): p is Product => Boolean(p));
    if (members.length === 0) continue;
    members.forEach((p) => consumed.add(p.id));
    lines.push(toLine(def.key, def.name, members));
  }

  // Anything not in a declared line keeps its own card, in catalog order.
  for (const product of visible) {
    if (consumed.has(product.id) || GROUPED_IDS.has(product.id)) continue;
    lines.push(toLine(product.id, undefined, [product]));
  }

  return lines;
}

/**
 * Dev-only guard: a SKU added to the catalog that reuses an existing photo but
 * was never placed in a line would silently reintroduce a duplicate image.
 * Returns the offending image paths, so a caller can surface them in dev.
 */
export function findDuplicateImages(visible: Product[]): string[] {
  const seen = new Map<string, number>();
  for (const line of buildProductLines(visible)) {
    seen.set(line.imageUrl, (seen.get(line.imageUrl) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([img]) => img);
}
