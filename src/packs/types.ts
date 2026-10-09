/**
 * Content packs for the AI search lab.
 *
 * A pack is a self-contained domain — its own catalog of items plus a labeled
 * query set for evaluating search against that catalog. Packs are deliberately
 * independent of the storefront's Product catalog: nothing here imports from
 * src/components/Products.
 */

export type PackItemKind =
  | 'attraction'
  | 'trail'
  | 'animal-habitat'
  | 'dining'
  | 'show'
  | 'service';

export interface PackItem {
  id: string;
  name: string;
  kind: PackItemKind;
  /** The area of the venue the item sits in. */
  area: string;
  /** Nicknames and alternate names a visitor might search by. */
  aliases: string[];
  /** Animal species featured, if any. Empty for items without animals. */
  species: string[];
  /** Short description, written in our own words — never copied from a source. */
  description: string;
  /** Searchable traits, e.g. 'indoor', 'kid-friendly', 'wheelchair-accessible'. */
  attributes: string[];
  /** Free-text note on hours or availability. */
  hoursNote: string;
}

export type LabeledQueryCategory =
  | 'exact-name'
  | 'nickname'
  | 'species'
  | 'descriptive'
  | 'constraint'
  | 'false-premise'
  | 'time-sensitive';

export interface LabeledQuery {
  id: string;
  text: string;
  category: LabeledQueryCategory;
  /** Item ids a correct answer should return. Empty when `shouldDecline`. */
  expectedItemIds: string[];
  /** True when the correct behavior is to decline rather than return items. */
  shouldDecline: boolean;
  note?: string;
}

export interface Pack {
  key: string;
  displayName: string;
  /** Plain-language description of the domain, used in prompts. */
  domainDescription: string;
  items: PackItem[];
  queries: LabeledQuery[];
}
