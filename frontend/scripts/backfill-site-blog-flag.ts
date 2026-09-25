/**
 * Marks the existing EnhanceMySEO blog posts with `isSiteBlogPost`.
 *
 * The `blogs` collection holds both company blog posts and every article the
 * dashboard and the automations generate — over a thousand of the latter. Nothing
 * distinguished them, so the CMS at /blogs listed all of them. Going forward the
 * blog editor and the automation runner set the flag; this backfills what is already
 * there.
 *
 * A slug is the discriminator, because only the blog editor and the site-blog publish
 * path ever set one. Safe to re-run: it only writes documents that lack the flag.
 *
 *   npm run backfill:site-blog-flag
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

async function main() {
  process.loadEnvFile('.env');

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  const db = getFirestore();

  const all = await db.collection('blogs').get();
  const needsFlag = all.docs.filter((doc) => {
    const data = doc.data();
    return (
      typeof data.slug === 'string' && data.slug.length > 0 && data.isSiteBlogPost !== true
    );
  });

  console.log(`${all.size} blog documents, ${needsFlag.length} to mark.`);
  if (needsFlag.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Well under the 500-write batch limit at 22 documents, but chunked so this still
  // works if it is ever re-run against a larger collection.
  for (let start = 0; start < needsFlag.length; start += 400) {
    const batch = db.batch();
    for (const doc of needsFlag.slice(start, start + 400)) {
      batch.update(doc.ref, { isSiteBlogPost: true });
    }
    await batch.commit();
  }

  for (const doc of needsFlag) {
    console.log(`  marked ${doc.id}  ${doc.data().slug}`);
  }
  console.log(`\nMarked ${needsFlag.length} post(s).`);
}

void main();
