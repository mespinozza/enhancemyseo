/**
 * The tutorial's first article, which free accounts get on top of their monthly allowance.
 *
 * One per account, ever. The claim lives in a server-only document rather than on the user
 * doc, because users can update their own profile and could otherwise reset it. It is
 * reserved before generation starts and only marked used once an article is delivered,
 * so a failed run gives the bonus back instead of burning it.
 */
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

const COLLECTION = 'onboardingBonus';

/**
 * A reservation older than this belongs to a run that died without reaching its
 * `finally` (a redeploy mid-generation), so it can be claimed again.
 */
const STALE_RESERVATION_MS = 15 * 60_000;

/** True when this call now holds the bonus; false when it was used or is in flight. */
export async function reserveOnboardingBonus(db: Firestore, uid: string): Promise<boolean> {
  const ref = db.collection(COLLECTION).doc(uid);
  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists) {
      const data = snapshot.data() ?? {};
      if (data.status === 'used') return false;
      const reservedAt = data.reservedAt?.toMillis?.() ?? 0;
      if (Date.now() - reservedAt < STALE_RESERVATION_MS) return false;
    }
    tx.set(ref, { ownerUid: uid, status: 'reserved', reservedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

export async function consumeOnboardingBonus(
  db: Firestore,
  uid: string,
  blogId: string
): Promise<void> {
  await db.collection(COLLECTION).doc(uid).set(
    { ownerUid: uid, status: 'used', usedAt: FieldValue.serverTimestamp(), blogId },
    { merge: true }
  );
}

/** Gives an unused reservation back. A bonus that was already used is left alone. */
export async function releaseOnboardingBonus(db: Firestore, uid: string): Promise<void> {
  const ref = db.collection(COLLECTION).doc(uid);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists && snapshot.data()?.status === 'reserved') tx.delete(ref);
  });
}

export async function hasOnboardingBonus(db: Firestore, uid: string): Promise<boolean> {
  const snapshot = await db.collection(COLLECTION).doc(uid).get();
  return !snapshot.exists || snapshot.data()?.status !== 'used';
}
