import type Stripe from 'stripe';

export type BillingInterval = 'day' | 'week' | 'month' | 'year';

export interface BillingFields {
  stripePriceId: string | null;
  billingInterval: BillingInterval | null;
  /** List price per billing period, in dollars. */
  priceAmount: number | null;
  /** The same price as a monthly figure, in dollars, so plans billed yearly compare. */
  mrr: number;
}

const MONTHS_PER: Record<BillingInterval, number> = {
  day: 1 / 30,
  week: 7 / 30,
  month: 1,
  year: 12,
};

/**
 * Billing details as stored on a user document. Based on the list price, so coupons
 * and one-off discounts are not reflected in the monthly figure.
 */
export function billingFromSubscription(subscription: Stripe.Subscription): BillingFields {
  const item = subscription.items.data[0];
  const price = item?.price;
  if (!price) return { stripePriceId: null, billingInterval: null, priceAmount: null, mrr: 0 };

  const interval = price.recurring?.interval ?? null;
  const priceAmount = ((price.unit_amount ?? 0) * (item.quantity ?? 1)) / 100;
  const months = interval ? MONTHS_PER[interval] * (price.recurring?.interval_count ?? 1) : 0;
  const active = subscription.status === 'active' || subscription.status === 'past_due';

  return {
    stripePriceId: price.id,
    billingInterval: interval,
    priceAmount,
    mrr: active && months ? Math.round((priceAmount / months) * 100) / 100 : 0,
  };
}

export const CLEARED_BILLING: BillingFields = {
  stripePriceId: null,
  billingInterval: null,
  priceAmount: null,
  mrr: 0,
};
