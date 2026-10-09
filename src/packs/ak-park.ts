import type { Pack } from './types';

/**
 * PLACEHOLDER PACK — shape review only.
 *
 * Every item and query below is invented filler so the structure can be
 * reviewed. Replace all of it with the real data before using this pack.
 */
export const akPark: Pack = {
  key: 'ak-park',
  displayName: 'PLACEHOLDER Animal Park',
  domainDescription:
    'PLACEHOLDER: a themed animal park with rides, walking trails, animal habitats, dining, and live shows.',
  items: [
    {
      id: 'placeholder-savanna-ride',
      name: 'PLACEHOLDER Savanna Ride',
      kind: 'attraction',
      area: 'PLACEHOLDER Area A',
      aliases: ['placeholder truck ride'],
      species: ['giraffe', 'zebra'],
      description: 'PLACEHOLDER: an open-vehicle ride through a grassland habitat.',
      attributes: ['outdoor', 'kid-friendly'],
      hoursNote: 'PLACEHOLDER: runs during park hours.',
    },
    {
      id: 'placeholder-forest-trail',
      name: 'PLACEHOLDER Forest Trail',
      kind: 'trail',
      area: 'PLACEHOLDER Area B',
      aliases: [],
      species: ['gorilla'],
      description: 'PLACEHOLDER: a self-guided walking path past a primate habitat.',
      attributes: ['outdoor', 'walking'],
      hoursNote: 'PLACEHOLDER: closes one hour before the park.',
    },
    {
      id: 'placeholder-grill',
      name: 'PLACEHOLDER Grill',
      kind: 'dining',
      area: 'PLACEHOLDER Area A',
      aliases: ['placeholder bbq'],
      species: [],
      description: 'PLACEHOLDER: a counter-service spot serving grilled food.',
      attributes: ['indoor-seating', 'quick-service'],
      hoursNote: 'PLACEHOLDER: lunch and dinner.',
    },
  ],
  queries: [
    {
      id: 'placeholder-q-exact',
      text: 'PLACEHOLDER Savanna Ride',
      category: 'exact-name',
      expectedItemIds: ['placeholder-savanna-ride'],
      shouldDecline: false,
    },
    {
      id: 'placeholder-q-species',
      text: 'where can I see gorillas',
      category: 'species',
      expectedItemIds: ['placeholder-forest-trail'],
      shouldDecline: false,
    },
    {
      id: 'placeholder-q-false-premise',
      text: 'what time does the roller coaster over the volcano open',
      category: 'false-premise',
      expectedItemIds: [],
      shouldDecline: true,
      note: 'PLACEHOLDER: no such item exists, so the right answer is to decline.',
    },
  ],
};
