/**
 * Where a customer is in the first-article tutorial, kept on their user document so it
 * follows them across devices and survives the Shopify and Google sign-in redirects.
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { blogOperations, brandProfileOperations } from '@/lib/firebase/firestore';

export type OnboardingStatus = 'in_progress' | 'skipped' | 'completed';

export interface OnboardingState {
  status: OnboardingStatus;
  step?: number;
  brandId?: string;
  /** Epoch ms, so time-to-first-article can be reported without a server round trip. */
  startedAtMs?: number;
  /** What the scan found, kept so the steps after a sign-in redirect still have it. */
  websiteUrl?: string | null;
  isShopify?: boolean;
  shopDomain?: string | null;
  kind?: 'ecommerce' | 'service';
  topics?: { keyword: string; why: string }[];
  keyword?: string;
  /** Set when step one sent the user to connect an account instead of typing a site. */
  connectVia?: 'shopify' | 'gsc' | null;
  blogId?: string;
}

const FIELD = 'onboarding';

export async function getOnboarding(uid: string): Promise<OnboardingState | null> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  const value = snapshot.data()?.[FIELD];
  return value && typeof value === 'object' && typeof value.status === 'string'
    ? (value as OnboardingState)
    : null;
}

export async function saveOnboarding(uid: string, patch: Partial<OnboardingState>): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    {
      [FIELD]: {
        ...patch,
        updatedAt: serverTimestamp(),
        ...(patch.status === 'completed' && { completedAt: serverTimestamp() }),
      },
    },
    { merge: true }
  );
}

/**
 * Testing switch, set by hand on a user document: the tutorial is offered at every
 * sign-in whatever the account's history, and dismissing it lasts only for the session.
 * Harmless if a user sets it on themselves; the free article is enforced server-side.
 */
export async function isOnboardingPreview(uid: string): Promise<boolean> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.data()?.onboardingPreview === true;
}

const previewDismissKey = (uid: string) => `onboarding:previewDismissed:${uid}`;

/** Keyed on the sign-in time, so a dismissal lasts until the next login. */
export function isPreviewDismissed(uid: string, signInTime: string | undefined): boolean {
  try {
    return Boolean(signInTime) && window.localStorage.getItem(previewDismissKey(uid)) === signInTime;
  } catch {
    return false;
  }
}

export function dismissPreview(uid: string, signInTime: string | undefined): void {
  try {
    if (signInTime) window.localStorage.setItem(previewDismissKey(uid), signInTime);
  } catch {
    // non-critical
  }
}

/**
 * Whether to offer the tutorial. Accounts from before it existed have no state, so
 * "has never made a brand or an article" stands in for "new" rather than a sign-up date.
 */
export async function shouldOfferOnboarding(uid: string): Promise<boolean> {
  if (await isOnboardingPreview(uid)) return true;
  const state = await getOnboarding(uid);
  if (state) return state.status === 'in_progress';
  const [brands, blogs] = await Promise.all([
    brandProfileOperations.getAll(uid).catch(() => []),
    blogOperations.getRecent(uid, 1).catch(() => []),
  ]);
  return brands.length === 0 && blogs.length === 0;
}
