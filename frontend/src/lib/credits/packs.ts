/**
 * One-time credit packs sold through Stripe. Credits are spent only once the month's plan
 * allowance is used up, and they don't expire. The price IDs are the live Stripe prices.
 */
export type CreditKind = 'articles' | 'images';

export interface CreditPack {
  id: 'articles_10' | 'articles_25' | 'images_20';
  kind: CreditKind;
  credits: number;
  priceUsd: number;
  label: string;
  productId: string;
  priceId: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'articles_10',
    kind: 'articles',
    credits: 10,
    priceUsd: 20,
    label: '10 extra articles',
    productId: 'prod_VbX9ERUiX2Ylzf',
    priceId: 'price_1UaK5ODAs3fJVx012RT9yHOH',
  },
  {
    id: 'articles_25',
    kind: 'articles',
    credits: 25,
    priceUsd: 45,
    label: '25 extra articles',
    productId: 'prod_VbXANZqKwMW6VW',
    priceId: 'price_1UaK6ODAs3fJVx01qTIVEiXc',
  },
  {
    id: 'images_20',
    kind: 'images',
    credits: 20,
    priceUsd: 10,
    label: '20 extra thumbnail photos',
    productId: 'prod_VbXBfqIXyp3k5S',
    priceId: 'price_1UaK6sDAs3fJVx01YZWGDVzi',
  },
];

export const packById = (id: unknown) => CREDIT_PACKS.find((pack) => pack.id === id) ?? null;

/** Plans that can buy packs. Free accounts are pointed at a plan instead. */
export const CREDIT_TIERS: readonly string[] = ['kickstart', 'seo_takeover', 'agency', 'admin'];

export interface CreditBalance {
  articles: number;
  images: number;
}
