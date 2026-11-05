import { NextRequest, NextResponse } from 'next/server';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldPath, Timestamp, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/results/api-auth';
import { serverSideUsageUtils } from '@/lib/server-usage-utils';
import { AUTOMATIONS_COLLECTION, AUTOMATION_RUNS_COLLECTION } from '@/lib/automation/types';
import { SHOPIFY_CONNECTIONS_COLLECTION } from '@/lib/shopify/oauth';
import { GSC_CONNECTIONS_COLLECTION } from '@/lib/gsc/client';
import {
  PAID_PLANS,
  asPlan,
  buildCustomerRow,
  dailySeries,
  parseUsageId,
  toIso,
} from '@/lib/admin/customers-server';
import {
  ASSIGNABLE_PLANS,
  PLAN_LABELS,
  type CustomerDetail,
  type Plan,
} from '@/lib/admin/customers';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ uid: string }> };

const ADMIN_ACTIONS_COLLECTION = 'adminActions';
const RECENT_LIMIT = 25;

function newestFirst<T extends { at: string | null }>(items: T[]): T[] {
  return items.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
}

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const { uid } = await params;

  try {
    initializeFirebaseAdmin();
    const firestore = getFirestore();
    const month = serverSideUsageUtils.getCurrentMonth();

    const record: UserRecord | undefined = await getAuth()
      .getUser(uid)
      .catch(() => undefined);
    const userSnap = await firestore.collection('users').doc(uid).get();
    if (!record && !userSnap.exists) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Owner-filtered queries without orderBy, so no composite indexes are needed;
    // sorting happens here. Field lists are explicit so article bodies, and the tokens
    // on connection documents, are never read.
    const [usageSnap, brandsSnap, automationsSnap, runsSnap, blogsSnap, shopifySnap, gscSnap, actionsSnap] =
      await Promise.all([
        firestore
          .collection('usage')
          .where(FieldPath.documentId(), '>=', `${uid}_`)
          .where(FieldPath.documentId(), '<', `${uid}_~`)
          .get(),
        firestore
          .collection('brandProfiles')
          .where('userId', '==', uid)
          .select('brandName', 'websiteUrl', 'shopifyStoreUrl')
          .get(),
        firestore
          .collection(AUTOMATIONS_COLLECTION)
          .where('userId', '==', uid)
          .select('name', 'enabled', 'trigger', 'articlesPerRun', 'lastRunAt', 'nextRunAt')
          .get(),
        firestore
          .collection(AUTOMATION_RUNS_COLLECTION)
          .where('userId', '==', uid)
          .select('automationName', 'status', 'keyword', 'articleTitle', 'error', 'warning', 'startedAt')
          .get(),
        firestore
          .collection('blogs')
          .where('userId', '==', uid)
          .select('title', 'keyword', 'status', 'createdBy', 'createdAt', 'aiCostUsd')
          .get(),
        firestore
          .collection(SHOPIFY_CONNECTIONS_COLLECTION)
          .where('ownerUid', '==', uid)
          .select('shopDomain', 'connectedAt')
          .get(),
        firestore
          .collection(GSC_CONNECTIONS_COLLECTION)
          .where('ownerUid', '==', uid)
          .select('googleEmail', 'connectedAt')
          .get(),
        firestore
          .collection(ADMIN_ACTIONS_COLLECTION)
          .where('targetUid', '==', uid)
          .get(),
      ]);

    const usageDocs = usageSnap.docs
      .map((doc) => ({ parsed: parseUsageId(doc.id), data: doc.data() }))
      .filter(
        (entry): entry is { parsed: { uid: string; month: string }; data: DocumentData } =>
          entry.parsed?.uid === uid,
      );
    const thisMonth = usageDocs.find((entry) => entry.parsed.month === month)?.data ?? {};
    const automations: DocumentData[] = automationsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const customer = buildCustomerRow({
      uid,
      record,
      data: userSnap.data() ?? {},
      usage: thisMonth,
      articlesTotal: usageDocs.reduce((sum, entry) => sum + (Number(entry.data.articles) || 0), 0),
      aiCostTotal: usageDocs.reduce((sum, entry) => sum + (Number(entry.data.aiCostUsd) || 0), 0),
      brands: brandsSnap.size,
      automations: automations.length,
      activeAutomations: automations.filter((automation) => automation.enabled).length,
      shopifyConnected: !shopifySnap.empty,
      searchConsoleConnected: !gscSnap.empty,
    });

    const userData = userSnap.data() ?? {};
    const detail: CustomerDetail = {
      customer,
      stripeCustomerId: typeof userData.stripeCustomerId === 'string' ? userData.stripeCustomerId : null,
      hasStripeSubscription: Boolean(userData.subscriptionId),
      brands: brandsSnap.docs.map((doc) => ({
        id: doc.id,
        name: doc.get('brandName') || 'Untitled brand',
        website: doc.get('websiteUrl') || doc.get('shopifyStoreUrl') || null,
      })),
      connections: [
        ...shopifySnap.docs.map((doc) => ({
          kind: 'shopify' as const,
          label: String(doc.get('shopDomain') ?? 'Shopify store'),
          connectedAt: toIso(doc.get('connectedAt')),
        })),
        ...gscSnap.docs.map((doc) => ({
          kind: 'gsc' as const,
          label: String(doc.get('googleEmail') ?? 'Search Console'),
          connectedAt: toIso(doc.get('connectedAt')),
        })),
      ],
      automations: automations.map((automation: DocumentData) => ({
        id: automation.id,
        name: automation.name || 'Untitled automation',
        enabled: Boolean(automation.enabled),
        trigger: String(automation.trigger ?? ''),
        articlesPerRun: Number(automation.articlesPerRun) || 0,
        lastRunAt: toIso(automation.lastRunAt),
        nextRunAt: toIso(automation.nextRunAt),
      })),
      articles: blogsSnap.docs
        .map((doc) => ({
          id: doc.id,
          title: doc.get('title') || 'Untitled',
          keyword: doc.get('keyword') ?? null,
          status: doc.get('status') ?? null,
          createdBy: doc.get('createdBy') ?? null,
          createdAt: toIso(doc.get('createdAt')),
          aiCostUsd: typeof doc.get('aiCostUsd') === 'number' ? doc.get('aiCostUsd') : null,
        }))
        .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
        .slice(0, RECENT_LIMIT),
      runs: runsSnap.docs
        .map((doc) => ({
          id: doc.id,
          automationName: doc.get('automationName') || '',
          status: doc.get('status') || '',
          keyword: doc.get('keyword') || '',
          articleTitle: doc.get('articleTitle') ?? null,
          error: doc.get('error') ?? null,
          warning: doc.get('warning') ?? null,
          startedAt: toIso(doc.get('startedAt')),
        }))
        .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
        .slice(0, RECENT_LIMIT),
      usage: usageDocs
        .map((entry) => ({
          month: entry.parsed.month,
          articles: Number(entry.data.articles) || 0,
          keywords: Number(entry.data.keywords) || 0,
          aiCostUsd: Number(entry.data.aiCostUsd) || 0,
          aiRequests: Number(entry.data.aiRequests) || 0,
        }))
        .sort((a, b) => b.month.localeCompare(a.month)),
      dailyCost: dailySeries([thisMonth]),
      actions: newestFirst(
        actionsSnap.docs.map((doc) => ({
          id: doc.id,
          action: doc.get('action') || '',
          detail: doc.get('detail') || '',
          adminEmail: doc.get('adminEmail') ?? null,
          at: toIso(doc.get('at')),
        })),
      ).slice(0, RECENT_LIMIT),
    };

    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to load customer:', error);
    return NextResponse.json({ error: 'Failed to load customer' }, { status: 500 });
  }
}

type ActionBody = { action: 'setPlan'; plan: Plan } | { action: 'resetUsage' };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const { uid } = await params;

  let body: ActionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  initializeFirebaseAdmin();
  const firestore = getFirestore();
  const userRef = firestore.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const current = asPlan(userSnap.get('subscription_status'));

  if (current === 'admin') {
    return NextResponse.json({ error: "Admin accounts can't be changed here" }, { status: 400 });
  }

  let detail: string;

  if (body.action === 'setPlan') {
    if (!ASSIGNABLE_PLANS.includes(body.plan)) {
      return NextResponse.json({ error: 'Unknown plan' }, { status: 400 });
    }
    if (body.plan === current) {
      return NextResponse.json({ error: `Already on ${PLAN_LABELS[current]}` }, { status: 400 });
    }
    const record = await getAuth()
      .getUser(uid)
      .catch(() => undefined);
    if (!record && !userSnap.exists) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const nowPaid = PAID_PLANS.has(body.plan);
    await userRef.set(
      {
        uid,
        ...(record?.email && !userSnap.exists ? { email: record.email } : {}),
        subscription_status: body.plan,
        // Same rule as the client used to apply: the date starts a paid plan and is
        // cleared on free. Moving between paid plans keeps the original date.
        ...(body.plan === 'free'
          ? { subscriptionDate: null }
          : !PAID_PLANS.has(current) && nowPaid
            ? { subscriptionDate: Timestamp.now() }
            : {}),
        planSetByAdmin: body.plan !== 'free',
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    detail = `${PLAN_LABELS[current]} → ${PLAN_LABELS[body.plan]}`;
  } else if (body.action === 'resetUsage') {
    const month = serverSideUsageUtils.getCurrentMonth();
    await firestore
      .collection('usage')
      .doc(`${uid}_${month}`)
      .set({ articles: 0, keywords: 0, thumbnails: 0, usageResetAt: Timestamp.now() }, { merge: true });
    detail = `Reset ${month} article and keyword counts`;
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  // No `userId` field: the generic Firestore rule would hand matching documents to
  // that user's browser.
  await firestore.collection(ADMIN_ACTIONS_COLLECTION).add({
    targetUid: uid,
    adminUid: auth.caller.uid,
    adminEmail: auth.caller.email,
    action: body.action,
    detail,
    at: Timestamp.now(),
  });

  return NextResponse.json({ ok: true, detail });
}
