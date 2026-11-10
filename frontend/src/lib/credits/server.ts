import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { serverSideUsageUtils } from '@/lib/server-usage-utils';
import { USAGE_LIMITS } from '@/lib/usage-limits';
import type { CreditBalance, CreditKind, CreditPack } from './packs';

/**
 * Purchased credits, one document per account. Neither collection carries a `userId`
 * field, so the generic owner rule never lets the browser read or write them; balances
 * reach the browser through /api/credits.
 */
const CREDITS = 'usageCredits';
const PURCHASES = 'creditPurchases';

function db() {
  initializeFirebaseAdmin();
  return getFirestore();
}

export async function getCredits(uid: string): Promise<CreditBalance> {
  const snap = await db().collection(CREDITS).doc(uid).get();
  return { articles: Number(snap.get('articles') ?? 0), images: Number(snap.get('images') ?? 0) };
}

/** Adds a paid pack once per Checkout session, however many times Stripe sends the event. */
export async function grantPack(sessionId: string, uid: string, pack: CreditPack, amountPaid: number | null): Promise<boolean> {
  const firestore = db();
  const purchase = firestore.collection(PURCHASES).doc(sessionId);
  const balance = firestore.collection(CREDITS).doc(uid);
  return firestore.runTransaction(async (tx) => {
    if ((await tx.get(purchase)).exists) return false;
    tx.create(purchase, {
      ownerUid: uid,
      pack: pack.id,
      kind: pack.kind,
      credits: pack.credits,
      amountPaid,
      at: Timestamp.now(),
    });
    tx.set(balance, { [pack.kind]: FieldValue.increment(pack.credits), updatedAt: Timestamp.now() }, { merge: true });
    return true;
  });
}

/** Takes one purchased credit if there is one. */
export async function reserveCredit(uid: string, kind: CreditKind): Promise<boolean> {
  const firestore = db();
  const ref = firestore.collection(CREDITS).doc(uid);
  return firestore.runTransaction(async (tx) => {
    const left = Number((await tx.get(ref)).get(kind) ?? 0);
    if (left < 1) return false;
    tx.update(ref, { [kind]: FieldValue.increment(-1), updatedAt: Timestamp.now() });
    return true;
  });
}

export async function refundCredit(uid: string, kind: CreditKind): Promise<void> {
  await db()
    .collection(CREDITS)
    .doc(uid)
    .set({ [kind]: FieldValue.increment(1), updatedAt: Timestamp.now() }, { merge: true });
}

/** Counted on the month's usage document, apart from the plan allowance, for reporting. */
export async function recordCreditUse(uid: string, kind: CreditKind): Promise<void> {
  await db()
    .collection('usage')
    .doc(`${uid}_${serverSideUsageUtils.getCurrentMonth()}`)
    .set({ [kind === 'articles' ? 'creditArticles' : 'creditImages']: FieldValue.increment(1) }, { merge: true });
}

/* ---------------------------------------------------------- thumbnail photos ----- */

export interface ImageCharge {
  uid: string;
  source: 'plan' | 'credit';
}

/**
 * Takes one photo generation before it starts: from the month's allowance while there is
 * some left, then from purchased credits. Null when both are used up.
 */
export async function reserveImage(uid: string, tier: string): Promise<ImageCharge | null> {
  const limit = USAGE_LIMITS[tier]?.thumbnails ?? 0;
  const firestore = db();
  const usage = firestore.collection('usage').doc(`${uid}_${serverSideUsageUtils.getCurrentMonth()}`);
  const fromPlan = await firestore.runTransaction(async (tx) => {
    const used = Number((await tx.get(usage)).get('thumbnails') ?? 0);
    if (limit !== 'unlimited' && used >= limit) return false;
    tx.set(usage, { thumbnails: FieldValue.increment(1), lastThumbnailGeneration: Timestamp.now() }, { merge: true });
    return true;
  });
  if (fromPlan) return { uid, source: 'plan' };
  if (await reserveCredit(uid, 'images')) {
    await recordCreditUse(uid, 'images').catch(() => undefined);
    return { uid, source: 'credit' };
  }
  return null;
}

/** Gives back a reserved photo generation when it failed. */
export async function refundImage(charge: ImageCharge | null): Promise<void> {
  if (!charge) return;
  if (charge.source === 'credit') return refundCredit(charge.uid, 'images');
  await db()
    .collection('usage')
    .doc(`${charge.uid}_${serverSideUsageUtils.getCurrentMonth()}`)
    .set({ thumbnails: FieldValue.increment(-1) }, { merge: true });
}

export const IMAGE_LIMIT_MESSAGE =
  "You've used this month's thumbnail photos. Buy 20 more for $10, or they reset next month. Editing text, colours and style is always free.";
