import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';

/**
 * Per-account UI preferences, stored on the user document so they follow the account
 * across browsers and devices rather than living in one browser's local storage.
 */

const PINNED_NAV_FIELD = 'pinnedNav';

/** Returns null when there is nothing stored, which is distinct from an empty list. */
export const getPinnedNav = async (uid: string): Promise<string[] | null> => {
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) return null;

  const value = snapshot.data()?.[PINNED_NAV_FIELD];
  if (!Array.isArray(value)) return null;

  return value.filter((entry): entry is string => typeof entry === 'string');
};

export const setPinnedNav = async (uid: string, hrefs: string[]): Promise<void> => {
  // Merged so this never disturbs subscription fields on the same document.
  await setDoc(doc(db, 'users', uid), { [PINNED_NAV_FIELD]: hrefs }, { merge: true });
};

/**
 * Local mirror of the stored value, keyed by uid. This exists so the sidebar can paint
 * pins immediately instead of flashing empty while Firestore responds, and so two
 * accounts sharing a browser never see each other's pins.
 */
const cacheKey = (uid: string) => `dashboard:pinnedNav:${uid}`;

export const readCachedPinnedNav = (uid: string): string[] => {
  try {
    const stored = window.localStorage.getItem(cacheKey(uid));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
};

export const writeCachedPinnedNav = (uid: string, hrefs: string[]): void => {
  try {
    window.localStorage.setItem(cacheKey(uid), JSON.stringify(hrefs));
  } catch {
    // Caching is an optimization; the Firestore copy is authoritative.
  }
};
