import type { Pack } from '../../src/packs/types.js';
import { akPark } from '../../src/packs/ak-park.js';

const PACKS: Record<string, Pack> = {
  [akPark.key]: akPark,
};

/** The pack registered under `key`, or undefined for an unknown key. */
export function getPack(key: string): Pack | undefined {
  return Object.hasOwn(PACKS, key) ? PACKS[key] : undefined;
}
