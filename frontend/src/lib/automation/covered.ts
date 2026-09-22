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

export async function coveredKeywords(
  db: Firestore,
  userId: string,
  brandId: string
): Promise<Set<string>> {
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
  return keywords;
}
