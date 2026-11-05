import { NextRequest, NextResponse } from 'next/server';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/results/api-auth';
import { serverSideUsageUtils } from '@/lib/server-usage-utils';
import { AUTOMATIONS_COLLECTION } from '@/lib/automation/types';
import { SHOPIFY_CONNECTIONS_COLLECTION } from '@/lib/shopify/oauth';
import { GSC_CONNECTIONS_COLLECTION } from '@/lib/gsc/client';
import {
  PAID_PLANS,
  PLANS,
  backfillBilling,
  buildCustomerRow,
  dailySeries,
  parseUsageId,
} from '@/lib/admin/customers-server';
import type { CustomerRow, CustomersResponse, PlanSummary } from '@/lib/admin/customers';

export const dynamic = 'force-dynamic';

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
      const parsed = parseUsageId(doc.id);
      if (!parsed) continue;
      const data = doc.data();
      if (parsed.month === month) usageThisMonth.set(parsed.uid, data);
      const total = totals.get(parsed.uid) ?? { articles: 0, cost: 0 };
      total.articles += Number(data.articles) || 0;
      total.cost += Number(data.aiCostUsd) || 0;
      totals.set(parsed.uid, total);
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

    const customers: CustomerRow[] = [...uids].map((uid) =>
      buildCustomerRow({
        uid,
        record: authById.get(uid),
        data: userDocs.get(uid) ?? {},
        usage: usageThisMonth.get(uid) ?? {},
        articlesTotal: totals.get(uid)?.articles ?? 0,
        aiCostTotal: totals.get(uid)?.cost ?? 0,
        brands: brandCounts.get(uid) ?? 0,
        automations: automationCounts.get(uid) ?? 0,
        activeAutomations: activeAutomationCounts.get(uid) ?? 0,
        shopifyConnected: shopifyOwners.has(uid),
        searchConsoleConnected: gscOwners.has(uid),
      }),
    );

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
        dailyCost: dailySeries([...usageThisMonth.values()]),
      },
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to load customers:', error);
    return NextResponse.json({ error: 'Failed to load customers' }, { status: 500 });
  }
}
