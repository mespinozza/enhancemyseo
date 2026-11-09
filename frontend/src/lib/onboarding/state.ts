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
 * Whether to offer the tutorial. Accounts from before it existed have no state, so
 * "has never made a brand or an article" stands in for "new" rather than a sign-up date.
 */
export async function shouldOfferOnboarding(uid: string): Promise<boolean> {
  const state = await getOnboarding(uid);
  if (state) return state.status === 'in_progress';
  const [brands, blogs] = await Promise.all([
    brandProfileOperations.getAll(uid).catch(() => []),
    blogOperations.getRecent(uid, 1).catch(() => []),
  ]);
  return brands.length === 0 && blogs.length === 0;
}
