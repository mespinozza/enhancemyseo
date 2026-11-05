import Stripe from 'stripe';
import type { UserRecord } from 'firebase-admin/auth';
import { getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { USAGE_LIMITS } from '@/lib/usage-limits';
import { billingFromSubscription } from '@/lib/stripe/billing';
import type { CustomerRow, DailyCost, Plan } from './customers';

export const PLANS: Plan[] = ['free', 'kickstart', 'seo_takeover', 'agency', 'admin'];
export const PAID_PLANS = new Set<Plan>(['kickstart', 'seo_takeover', 'agency']);

export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

export function asPlan(value: unknown): Plan {
  return PLANS.includes(value as Plan) ? (value as Plan) : 'free';
}

/** Splits a `usage` document ID, `{uid}_{YYYY-MM}`, into its parts. */
export function parseUsageId(id: string): { uid: string; month: string } | null {
  const separator = id.lastIndexOf('_');
  if (separator < 0) return null;
  return { uid: id.slice(0, separator), month: id.slice(separator + 1) };
}

/** One entry per day of the current month up to today, from usage docs' daily totals. */
export function dailySeries(usageDocs: DocumentData[]): DailyCost[] {
  const totals = new Map<string, number>();
  for (const data of usageDocs) {
    const daily = data.aiCostDaily as Record<string, number> | undefined;
    if (!daily) continue;
    for (const [day, cost] of Object.entries(daily)) {
      totals.set(day, (totals.get(day) ?? 0) + (Number(cost) || 0));
    }
  }
  const today = new Date().getDate();
  return Array.from({ length: today }, (_, index) => {
    const day = String(index + 1).padStart(2, '0');
    return { day, cost: totals.get(day) ?? 0 };
  });
}

export interface RowInputs {
  uid: string;
  record?: UserRecord;
  data: DocumentData;
  usage: DocumentData;
  articlesTotal: number;
  aiCostTotal: number;
  brands: number;
  automations: number;
  activeAutomations: number;
  shopifyConnected: boolean;
  searchConsoleConnected: boolean;
}

function acquisitionLabel(acquisition: unknown): string | null {
  if (!acquisition || typeof acquisition !== 'object') return null;
  const a = acquisition as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
  const source = text(a.utm_source) ?? (text(a.fbclid) ? 'facebook' : text(a.gclid) ? 'google' : null);
  const parts = [source, text(a.utm_campaign) ?? text(a.angle)].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : null;
}

export function buildCustomerRow(input: RowInputs): CustomerRow {
  const { uid, record, data, usage } = input;
  const plan = asPlan(data.subscription_status);
  const limit = USAGE_LIMITS[plan]?.articles ?? 0;

  return {
    uid,
    email: record?.email ?? data.email ?? null,
    name: record?.displayName ?? data.displayName ?? null,
    plan,
    joinedAt: record?.metadata.creationTime
      ? new Date(record.metadata.creationTime).toISOString()
      : toIso(data.createdAt),
    paidSince: PAID_PLANS.has(plan) ? toIso(data.subscriptionDate) : null,
    lastSignInAt: record?.metadata.lastSignInTime
      ? new Date(record.metadata.lastSignInTime).toISOString()
      : null,
    source: acquisitionLabel(data.acquisition),
    emailVerified: record?.emailVerified ?? false,
    billingInterval: data.billingInterval ?? null,
    mrr: PAID_PLANS.has(plan) ? Number(data.mrr) || 0 : 0,
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
    renewsAt: toIso(data.currentPeriodEnd),
    articlesThisMonth: Number(usage.articles) || 0,
    articlesTotal: input.articlesTotal,
    articleLimit: typeof limit === 'number' || limit === 'unlimited' ? limit : 0,
    keywordsThisMonth: Number(usage.keywords) || 0,
    aiCostThisMonth: Number(usage.aiCostUsd) || 0,
    aiCostTotal: input.aiCostTotal,
    brands: input.brands,
    automations: input.automations,
    activeAutomations: input.activeAutomations,
    shopifyConnected: input.shopifyConnected,
    searchConsoleConnected: input.searchConsoleConnected,
  };
}

/** Stripe lookups per request, so one page load can't stall on a long backfill. */
const BACKFILL_LIMIT = 25;

/**
 * Fills in the price and billing interval for subscribers who signed up before the
 * webhook started storing them, and writes them back so each user is looked up once.
 * Returns how many are still missing.
 */
export async function backfillBilling(userDocs: Map<string, DocumentData>): Promise<number> {
  const missing = [...userDocs.entries()].filter(
    ([, data]) =>
      typeof data.subscriptionId === 'string' &&
      data.subscriptionId &&
      data.stripePriceId === undefined &&
      PAID_PLANS.has(asPlan(data.subscription_status)),
  );
  if (missing.length === 0 || !process.env.STRIPE_SECRET_KEY) return missing.length;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
  const firestore = getFirestore();
  const batch = missing.slice(0, BACKFILL_LIMIT);

  await Promise.all(
    batch.map(async ([uid, data]) => {
      try {
        const subscription = await stripe.subscriptions.retrieve(data.subscriptionId);
        const billing = billingFromSubscription(subscription);
        await firestore.collection('users').doc(uid).set(billing, { merge: true });
        Object.assign(data, billing);
      } catch (error) {
        console.error(`Billing backfill failed for ${uid}:`, error);
      }
    }),
  );

  return missing.length - batch.length;
}
