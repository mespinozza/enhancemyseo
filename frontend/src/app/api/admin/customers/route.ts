import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/results/api-auth';
import { serverSideUsageUtils } from '@/lib/server-usage-utils';
import { USAGE_LIMITS } from '@/lib/usage-limits';
import { billingFromSubscription } from '@/lib/stripe/billing';
import { AUTOMATIONS_COLLECTION } from '@/lib/automation/types';
import { SHOPIFY_CONNECTIONS_COLLECTION } from '@/lib/shopify/oauth';
import { GSC_CONNECTIONS_COLLECTION } from '@/lib/gsc/client';
import type {
  CustomerRow,
  CustomersResponse,
  Plan,
  PlanSummary,
} from '@/lib/admin/customers';

export const dynamic = 'force-dynamic';

const PLANS: Plan[] = ['free', 'kickstart', 'seo_takeover', 'agency', 'admin'];
const PAID_PLANS = new Set<Plan>(['kickstart', 'seo_takeover', 'agency']);
/** Stripe lookups per request, so one page load can't stall on a long backfill. */
const BACKFILL_LIMIT = 25;

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

function asPlan(value: unknown): Plan {
  return PLANS.includes(value as Plan) ? (value as Plan) : 'free';
}

async function listAllAuthUsers(): Promise<UserRecord[]> {
  const users: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

function countBy(docs: DocumentData[], field: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const data of docs) {
    const key = data[field];
    if (typeof key === 'string') counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Fills in the price and billing interval for subscribers who signed up before the
 * webhook started storing them, and writes them back so each user is looked up once.
 */
async function backfillBilling(userDocs: Map<string, DocumentData>): Promise<number> {
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

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  try {
    initializeFirebaseAdmin();
    const firestore = getFirestore();
    const month = serverSideUsageUtils.getCurrentMonth();

    const [authUsers, usersSnap, usageSnap, brandsSnap, automationsSnap, shopifySnap, gscSnap] =
      await Promise.all([
        listAllAuthUsers(),
        firestore.collection('users').get(),
        firestore.collection('usage').get(),
        firestore.collection('brandProfiles').select('userId').get(),
        firestore.collection(AUTOMATIONS_COLLECTION).select('userId', 'enabled').get(),
        // Only the owner field: these documents hold store and Google tokens.
        firestore.collection(SHOPIFY_CONNECTIONS_COLLECTION).select('ownerUid').get(),
        firestore.collection(GSC_CONNECTIONS_COLLECTION).select('ownerUid').get(),
      ]);

    const userDocs = new Map(usersSnap.docs.map((doc) => [doc.id, doc.data()]));
    const billingUnknown = await backfillBilling(userDocs);

    const usageThisMonth = new Map<string, DocumentData>();
    const totals = new Map<string, { articles: number; cost: number }>();
    for (const doc of usageSnap.docs) {
      const separator = doc.id.lastIndexOf('_');
      if (separator < 0) continue;
      const uid = doc.id.slice(0, separator);
      const data = doc.data();
      if (doc.id.slice(separator + 1) === month) usageThisMonth.set(uid, data);
      const total = totals.get(uid) ?? { articles: 0, cost: 0 };
      total.articles += Number(data.articles) || 0;
      total.cost += Number(data.aiCostUsd) || 0;
      totals.set(uid, total);
    }

    const brandCounts = countBy(brandsSnap.docs.map((doc) => doc.data()), 'userId');
    const automationData = automationsSnap.docs.map((doc) => doc.data());
    const automationCounts = countBy(automationData, 'userId');
    const activeAutomationCounts = countBy(
      automationData.filter((data) => data.enabled),
      'userId',
    );
    const shopifyOwners = new Set(shopifySnap.docs.map((doc) => doc.get('ownerUid')));
    const gscOwners = new Set(gscSnap.docs.map((doc) => doc.get('ownerUid')));

    const authById = new Map(authUsers.map((user) => [user.uid, user]));
    const uids = new Set([...authById.keys(), ...userDocs.keys()]);

    const customers: CustomerRow[] = [...uids].map((uid) => {
      const record = authById.get(uid);
      const data = userDocs.get(uid) ?? {};
      const usage = usageThisMonth.get(uid) ?? {};
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
        emailVerified: record?.emailVerified ?? false,
        billingInterval: data.billingInterval ?? null,
        mrr: PAID_PLANS.has(plan) ? Number(data.mrr) || 0 : 0,
        cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
        renewsAt: toIso(data.currentPeriodEnd),
        articlesThisMonth: Number(usage.articles) || 0,
        articlesTotal: totals.get(uid)?.articles ?? 0,
        articleLimit: typeof limit === 'number' || limit === 'unlimited' ? limit : 0,
        keywordsThisMonth: Number(usage.keywords) || 0,
        aiCostThisMonth: Number(usage.aiCostUsd) || 0,
        aiCostTotal: totals.get(uid)?.cost ?? 0,
        brands: brandCounts.get(uid) ?? 0,
        automations: automationCounts.get(uid) ?? 0,
        activeAutomations: activeAutomationCounts.get(uid) ?? 0,
        shopifyConnected: shopifyOwners.has(uid),
        searchConsoleConnected: gscOwners.has(uid),
      };
    });

    customers.sort((a, b) => (b.joinedAt ?? '').localeCompare(a.joinedAt ?? ''));

    const byPlan: PlanSummary[] = PLANS.map((plan) => {
      const group = customers.filter((customer) => customer.plan === plan);
      return {
        plan,
        customers: group.length,
        mrr: group.reduce((sum, customer) => sum + customer.mrr, 0),
        articlesThisMonth: group.reduce((sum, customer) => sum + customer.articlesThisMonth, 0),
        aiCostThisMonth: group.reduce((sum, customer) => sum + customer.aiCostThisMonth, 0),
      };
    });

    const paying = customers.filter((customer) => PAID_PLANS.has(customer.plan));
    const nonAdmin = customers.filter((customer) => customer.plan !== 'admin');

    const now = new Date();
    const months: string[] = [];
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    const signupsByMonth = months.map((key) => {
      const joined = nonAdmin.filter((customer) => customer.joinedAt?.startsWith(key));
      return {
        month: key,
        signups: joined.length,
        paid: joined.filter((customer) => PAID_PLANS.has(customer.plan)).length,
      };
    });

    const response: CustomersResponse = {
      month,
      billingUnknown,
      customers,
      summary: {
        totalUsers: nonAdmin.length,
        payingCustomers: paying.length,
        mrr: paying.reduce((sum, customer) => sum + customer.mrr, 0),
        conversionRate: nonAdmin.length ? paying.length / nonAdmin.length : 0,
        pendingCancellations: paying.filter((customer) => customer.cancelAtPeriodEnd).length,
        activeThisMonth: nonAdmin.filter(
          (customer) =>
            customer.articlesThisMonth > 0 || customer.lastSignInAt?.startsWith(month),
        ).length,
        newThisMonth: signupsByMonth[signupsByMonth.length - 1].signups,
        articlesThisMonth: customers.reduce((sum, customer) => sum + customer.articlesThisMonth, 0),
        aiCostThisMonth: customers.reduce((sum, customer) => sum + customer.aiCostThisMonth, 0),
        byPlan,
        signupsByMonth,
      },
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to load customers:', error);
    return NextResponse.json({ error: 'Failed to load customers' }, { status: 500 });
  }
}
