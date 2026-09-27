import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './config';

// ─── Favorite Brand Profiles ──────────────────────────────────────────────────

const FAVORITE_BRANDS_FIELD = 'favoriteBrandIds';
const MAX_FAVORITE_BRANDS = 3;

export const getFavoriteBrands = async (uid: string): Promise<string[]> => {
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) return [];
  const value = snapshot.data()?.[FAVORITE_BRANDS_FIELD];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').slice(0, MAX_FAVORITE_BRANDS);
};

export const setFavoriteBrands = async (uid: string, brandIds: string[]): Promise<void> => {
  const capped = brandIds.slice(0, MAX_FAVORITE_BRANDS);
  await setDoc(doc(db, 'users', uid), { [FAVORITE_BRANDS_FIELD]: capped }, { merge: true });
};

const favCacheKey = (uid: string) => `dashboard:favoriteBrands:${uid}`;

export const readCachedFavoriteBrands = (uid: string): string[] => {
  try {
    const stored = window.localStorage.getItem(favCacheKey(uid));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

export const writeCachedFavoriteBrands = (uid: string, brandIds: string[]): void => {
  try {
    window.localStorage.setItem(favCacheKey(uid), JSON.stringify(brandIds));
  } catch {
    // non-critical
  }
};

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
