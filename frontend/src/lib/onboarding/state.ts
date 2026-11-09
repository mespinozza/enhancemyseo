/**
 * Where a customer is in the first-article tutorial, kept on their user document so it
 * follows them across devices and survives the Shopify and Google sign-in redirects.
 */
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

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
  /** Epoch ms of the last skip, which only holds for a while if nothing gets written. */
  skippedAtMs?: number;
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
 * sign-in whatever the account's history, and dismissing it lasts only until the next login.
 * Harmless if a user sets it on themselves; the free article is enforced server-side.
 */
export async function isOnboardingPreview(uid: string): Promise<boolean> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.data()?.onboardingPreview === true;
}

const previewDismissKey = (uid: string) => `onboarding:previewDismissed:${uid}`;

/** Keyed on the sign-in time, so "remind me later" lasts until the next login. */
export function isDismissedThisSignIn(uid: string, signInTime: string | undefined): boolean {
  try {
    return Boolean(signInTime) && window.localStorage.getItem(previewDismissKey(uid)) === signInTime;
  } catch {
    return false;
  }
}

export function dismissForThisSignIn(uid: string, signInTime: string | undefined): void {
  try {
    if (signInTime) window.localStorage.setItem(previewDismissKey(uid), signInTime);
  } catch {
    // non-critical
  }
}

/** How long "I already know how to use the tool" holds while the account still has no article. */
const SKIP_COOLDOWN_MS = 7 * 24 * 60 * 60_000;

/**
 * Whether to offer the tutorial: to any account that has never generated an article,
 * whether or not it has a brand. Skipping holds for a week; after that an account that
 * still has nothing written is offered it again.
 */
export async function shouldOfferOnboarding(uid: string): Promise<boolean> {
  if (await isOnboardingPreview(uid)) return true;

  // Queried directly rather than through the shared helper, which returns an empty list on
  // error: a failed read must not put the tutorial in front of an active customer.
  let hasArticle: boolean;
  try {
    const snapshot = await getDocs(query(collection(db, 'blogs'), where('userId', '==', uid), limit(1)));
    hasArticle = !snapshot.empty;
  } catch {
    return false;
  }
  if (hasArticle) return false;

  const state = await getOnboarding(uid);
  if (state?.status === 'completed') return false;
  if (state?.status === 'skipped') {
    return Date.now() - (state.skippedAtMs ?? 0) > SKIP_COOLDOWN_MS;
  }
  return true;
}
