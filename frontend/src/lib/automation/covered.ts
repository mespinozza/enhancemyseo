/**
 * Which keywords a brand already has articles for.
 *
 * Server-only: reads through the Admin SDK. Shared by the runner, which uses it to stop
 * a traffic-driven automation rewriting its best query every week, and by the preview
 * endpoint, which has to show the same answer or the preview would promise articles the
 * run then skips.
 */
import type { Firestore } from 'firebase-admin/firestore';

/** Bounded because this is a de-duplication aid, not an audit of every article. */
const MAX_ARTICLES_SCANNED = 1000;

interface CachedSet {
  keywords: Set<string>;
  readAt: number;
}

const cache = new Map<string, CachedSet>();

function cacheKey(userId: string, brandId: string): string {
  return `${userId}:${brandId}`;
}

export interface CoveredOptions {
  /**
   * Accept a set read up to this many milliseconds ago. Omit it to force a fresh read,
   * which is what an actual run must do: the whole point there is to not publish a
   * duplicate, and that answer has to be current. The preview passes a value because it
   * re-runs on every settings tweak, and a keyword that stops being covered mid-session
   * is worth far less than the thousand reads each rescan costs.
   */
  maxAgeMs?: number;
}

export async function coveredKeywords(
  db: Firestore,
  userId: string,
  brandId: string,
  options: CoveredOptions = {}
): Promise<Set<string>> {
  const key = cacheKey(userId, brandId);

  if (options.maxAgeMs !== undefined) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.readAt <= options.maxAgeMs) {
      return cached.keywords;
    }
  }

  const snapshot = await db
    .collection('blogs')
    .where('userId', '==', userId)
    .where('brandId', '==', brandId)
    .limit(MAX_ARTICLES_SCANNED)
    .get();

  const keywords = new Set<string>();
  for (const doc of snapshot.docs) {
    const keyword = (doc.data().keyword as string | undefined)?.trim().toLowerCase();
    if (keyword) keywords.add(keyword);
  }

  cache.set(key, { keywords, readAt: Date.now() });
  return keywords;
}

/** Called after writing an article, so the next preview does not offer it again. */
export function forgetCoveredKeywords(userId: string, brandId: string): void {
  cache.delete(cacheKey(userId, brandId));
}
