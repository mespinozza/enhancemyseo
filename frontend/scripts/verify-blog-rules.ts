/**
 * Exercises the deployed Firestore rules for the `blogs` collection.
 *
 * Rules only apply to client SDK access, so this signs in as a real admin and a real
 * non-admin using custom tokens and makes actual reads and writes against the live
 * project. The Admin SDK bypasses rules entirely and is used only to set up and tear
 * down fixtures.
 *
 * What it is protecting: /blog lists every document where published is true, whoever
 * wrote it, and every customer's generated articles live in that same collection. If a
 * customer can set published on their own article, they can put it on our front page.
 *
 *   npm run verify:blog-rules
 */
import { cert, getApps as getAdminApps, initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

let failures = 0;

function check(description: string, passed: boolean, detail?: string) {
  if (passed) {
    console.log(`  ok   ${description}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Runs an operation and reports whether the rules permitted it. */
async function allowed(operation: () => Promise<unknown>): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/permission|insufficient/i.test(message)) return false;
    throw error;
  }
}

async function main() {
  process.loadEnvFile('.env');

  if (getAdminApps().length === 0) {
    initAdmin({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  const adminDb = getAdminFirestore();

  const adminUid = (
    await adminDb.collection('users').where('subscription_status', '==', 'admin').limit(1).get()
  ).docs[0]?.id;
  const otherUid = (await adminDb.collection('users').limit(30).get()).docs.find(
    (d) => d.data().subscription_status !== 'admin'
  )?.id;

  if (!adminUid || !otherUid) {
    console.log('Need one admin and one non-admin account to test with.');
    process.exit(1);
  }

  const client = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
  const auth = getAuth(client);
  const db = getFirestore(client);

  // A published post by the admin, standing in for anything already on the blog.
  const livePost = adminDb.collection('blogs').doc();
  await livePost.set({
    userId: adminUid,
    title: 'Rules fixture, published',
    content: '<p>x</p>',
    slug: `rules-fixture-${Date.now()}`,
    published: true,
    isSiteBlogPost: true,
  });

  // An unpublished article belonging to the admin, standing in for a private draft.
  const adminDraft = adminDb.collection('blogs').doc();
  await adminDraft.set({
    userId: adminUid,
    title: 'Rules fixture, admin draft',
    content: '<p>x</p>',
  });

  const created: string[] = [];

  try {
    console.log('\na customer (non-admin)');
    await signInWithCustomToken(auth, await getAdminAuth().createCustomToken(otherUid));

    const ownDraft = doc(collection(db, 'blogs'));
    check(
      'can save their own article',
      await allowed(() =>
        setDoc(ownDraft, { userId: otherUid, title: 'mine', content: '<p>x</p>' })
      )
    );
    created.push(ownDraft.id);

    check(
      'cannot create an article that is already published',
      !(await allowed(() =>
        setDoc(doc(collection(db, 'blogs')), {
          userId: otherUid,
          title: 'sneaky',
          content: '<p>x</p>',
          published: true,
        })
      ))
    );

    check(
      'cannot publish their own article',
      !(await allowed(() => updateDoc(ownDraft, { published: true })))
    );

    check(
      'can still edit their own article',
      await allowed(() => updateDoc(ownDraft, { title: 'mine, edited' }))
    );

    check(
      'cannot publish somebody else\u2019s article',
      !(await allowed(() => updateDoc(doc(db, 'blogs', adminDraft.id), { published: true })))
    );

    check(
      'cannot read somebody else\u2019s unpublished article',
      !(await allowed(() => getDoc(doc(db, 'blogs', adminDraft.id))))
    );

    check(
      'can read a published post, which is what /blog needs',
      await allowed(() => getDoc(doc(db, 'blogs', livePost.id)))
    );

    check(
      'can list their own articles, which the dashboard needs',
      await allowed(() =>
        getDocs(query(collection(db, 'blogs'), where('userId', '==', otherUid)))
      )
    );

    check(
      'cannot list the whole collection',
      !(await allowed(() => getDocs(collection(db, 'blogs'))))
    );

    console.log('\nan administrator');
    await signOut(auth);
    await signInWithCustomToken(auth, await getAdminAuth().createCustomToken(adminUid));

    const adminPost = doc(collection(db, 'blogs'));
    check(
      'can create a published post',
      await allowed(() =>
        setDoc(adminPost, {
          userId: adminUid,
          title: 'admin post',
          content: '<p>x</p>',
          slug: `rules-admin-${Date.now()}`,
          published: true,
          isSiteBlogPost: true,
        })
      )
    );
    created.push(adminPost.id);

    check(
      'can unpublish a post',
      await allowed(() => updateDoc(doc(db, 'blogs', livePost.id), { published: false }))
    );
    check(
      'can publish it again',
      await allowed(() => updateDoc(doc(db, 'blogs', livePost.id), { published: true }))
    );

    check(
      'can run the CMS listing query',
      await allowed(() =>
        getDocs(
          query(
            collection(db, 'blogs'),
            where('userId', '==', adminUid),
            where('isSiteBlogPost', '==', true)
          )
        )
      )
    );

    check(
      'can delete their own post',
      await allowed(() => deleteDoc(doc(db, 'blogs', adminPost.id)))
    );

    console.log('\na signed-out visitor');
    await signOut(auth);

    check(
      'can read a published post',
      await allowed(() => getDoc(doc(db, 'blogs', livePost.id)))
    );
    check(
      'can run the public listing query',
      await allowed(() =>
        getDocs(query(collection(db, 'blogs'), where('published', '==', true)))
      )
    );
    check(
      'cannot read an unpublished article',
      !(await allowed(() => getDoc(doc(db, 'blogs', adminDraft.id))))
    );
  } finally {
    await adminDb.recursiveDelete(livePost);
    await adminDb.recursiveDelete(adminDraft);
    for (const id of created) {
      await adminDb.collection('blogs').doc(id).delete();
    }
    console.log('\n  (fixtures removed)');
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
