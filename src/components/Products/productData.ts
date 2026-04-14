import type { Product } from './ProductCard';

export const products: Product[] = [
  {
    id: 'basic',
    name: 'Basic Bites',
    tagline: 'Great nutrition, simple plan',
    price: '$29',
    interval: 'per month',
    features: [
      'Fresh meals delivered weekly',
      'Choose from 3 recipes',
      'Free shipping on all orders',
      'Flexible skip or cancel anytime',
    ],
  },
  {
    id: 'premium',
    name: 'Premium Paws',
    tagline: 'Our most popular plan',
    price: '$49',
    interval: 'per month',
    features: [
      'Everything in Basic Bites',
      'Choose from 8 rotating recipes',
      'Custom portion sizing',
      'Priority delivery windows',
      'Vet nutritionist support',
    ],
    highlighted: true,
  },
  {
    id: 'deluxe',
    name: 'Deluxe Den',
    tagline: 'The ultimate pet dining experience',
    price: '$79',
    interval: 'per month',
    features: [
      'Everything in Premium Paws',
      'Unlimited recipe selection',
      'Allergy-friendly custom meals',
      'Monthly treat box included',
      'Dedicated account manager',
      'Early access to new recipes',
    ],
  },
];
