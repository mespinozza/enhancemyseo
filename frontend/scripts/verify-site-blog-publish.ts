/**
 * Checks the "publish automation output to the EnhanceMySEO blog" path.
 *
 * The slug and meta-description helpers are checked in isolation. The publish step
 * itself is checked against the live project, because the thing worth proving is that
 * a real article document ends up with the fields /blog and /blog/[slug] need. It
 * picks an existing unpublished automation article, publishes it, reads it back, and
 * restores every field it touched — so the blog is left exactly as it was found.
 *
 *   npm run verify:site-blog
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { launch } from 'puppeteer-core';

import {
  publishToSiteBlog,
  toMetaDescription,
  toSlug,
  type GeneratedArticle,
} from '../src/lib/automation/runner';
import type { Automation } from '../src/lib/automation/types';
import type { BrandProfile } from '../src/types/brand';

const DEFAULT_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let failures = 0;

function check(description: string, passed: boolean, detail?: string) {
  if (passed) {
    console.log(`  ok   ${description}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${description}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------ pure bits -- */

function checkSlugs() {
  console.log('\nslugs');
  check('lowercases and hyphenates', toSlug('Best Forklift Parts') === 'best-forklift-parts');
  check('drops punctuation', toSlug("A Buyer's Guide: 2026!") === 'a-buyers-guide-2026');
  check('collapses runs of spaces', toSlug('too   many    spaces') === 'too-many-spaces');
  check('trims a trailing hyphen', !toSlug('Trailing punctuation ...').endsWith('-'));
  check('stays within 80 characters', toSlug('word '.repeat(60)).length <= 80);
  check('is empty when nothing survives', toSlug('!!! ???') === '');
}

function checkMetaDescriptions() {
  console.log('\nmeta descriptions');
  check(
    'strips tags',
    toMetaDescription('<h1>Title</h1><p>Some <b>bold</b> copy.</p>') === 'Title Some bold copy.'
  );
  check(
    'drops script bodies',
    !toMetaDescription('<script>alert(1)</script><p>Copy.</p>').includes('alert')
  );
  check('decodes the entities the editor emits', toMetaDescription('<p>A&nbsp;&amp;&nbsp;B</p>') === 'A & B');

  const long = toMetaDescription(`<p>${'sentence words '.repeat(40)}</p>`);
  check('truncates long copy', long.length <= 156, `${long.length} characters`);
  check('truncates on a word boundary', long.endsWith('…') && !long.includes(' …'));
}

/* ---------------------------------------------------------------- live check -- */

function connect(): Firestore {
  if (getApps().length === 0) {
    // Next loads .env for the app; a bare script has to ask for it.
    process.loadEnvFile('.env');
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

/**
 * Loads the public pages in a real browser while the article is published.
 *
 * Both /blog and /blog/[slug] are client components that read Firestore from the
 * browser, so the server HTML contains only a loading state. Fetching it would prove
 * nothing; the page has to actually run. Skipped when nothing is serving.
 */
async function checkRenders(slug: string, title: string) {
  const origin = process.env.VERIFY_ORIGIN || 'http://localhost:3001';

  try {
    await fetch(`${origin}/blog`);
  } catch {
    console.log(`\n  (skipped the page checks: nothing serving ${origin})`);
    return;
  }

  console.log('\nthe public pages, in a browser');
  const browser = await launch({
    executablePath: process.env.CHROME_PATH || DEFAULT_CHROME,
    headless: true,
    args: ['--no-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // networkidle0 never settles here: the Firebase SDK holds a connection open.
    await page.goto(`${origin}/blog`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const linked = await page
      .waitForSelector(`a[href="/blog/${slug}"]`, { timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    check('the blog index links to it', linked);

    await page.goto(`${origin}/blog/${slug}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForFunction('!document.body.innerText.includes("Loading...")', {
      timeout: 45_000,
    });

    const text = await page.evaluate(() => document.body.innerText);
    check('the post page shows the title', text.includes(title));
    check('the post page is not a 404', !text.includes('could not be found'));
  } finally {
    await browser.close();
  }
}

async function checkPublish(db: Firestore) {
  console.log('\npublishing a real article');

  const adminSnap = await db
    .collection('users')
    .where('subscription_status', '==', 'admin')
    .limit(1)
    .get();

  if (adminSnap.empty) {
    check('an admin account exists to publish as', false);
    return;
  }
  const adminUid = adminSnap.docs[0].id;

  // An article this automation feature would itself have produced, rather than a
  // hand-written post, so the starting shape matches the real case.
  const candidates = await db
    .collection('blogs')
    .where('userId', '==', adminUid)
    .where('createdBy', '==', 'automation')
    .limit(5)
    .get();

  const target = candidates.docs.find((doc) => doc.data().published !== true);
  if (!target) {
    check('an unpublished automation article exists to test with', false);
    return;
  }

  const before = target.data();
  const article: GeneratedArticle = {
    blogId: target.id,
    title: before.title || 'Untitled',
    content: before.content || '<p>Body copy.</p>',
    hasGenerationIssues: false,
  };

  const automation = {
    id: 'verify-script',
    userId: adminUid,
    publishToSiteBlog: true,
    siteBlogStatus: 'published',
  } as unknown as Automation;
  const brand = { brandName: 'EnhanceMySEO' } as BrandProfile;

  let path: string | null = null;
  try {
    path = await publishToSiteBlog(db, automation, brand, article);
  } catch (error) {
    check('publishing succeeds', false, error instanceof Error ? error.message : String(error));
    return;
  }

  try {
    const after = (await db.collection('blogs').doc(target.id).get()).data() ?? {};

    check('returns the public path', path === `/blog/${after.slug}`, String(path));
    check('marks the article published', after.published === true);
    check('sets a slug', typeof after.slug === 'string' && after.slug.length > 0, after.slug);
    check('sets a publish date', after.publishDate instanceof Timestamp);
    check(
      'sets a meta description',
      typeof after.metaDescription === 'string' && after.metaDescription.length > 0
    );
    check('leaves the body untouched', after.content === before.content);

    // The listing query is `published == true`, so this is what decides whether the
    // post actually shows up rather than merely carrying the right fields.
    const listed = await db
      .collection('blogs')
      .where('published', '==', true)
      .where('slug', '==', after.slug)
      .limit(1)
      .get();
    check('appears in the public listing query', !listed.empty);

    // Nothing else may share the slug, since /blog/[slug] resolves on it alone.
    const bySlug = await db.collection('blogs').where('slug', '==', after.slug).get();
    check('holds the slug on its own', bySlug.size === 1, `${bySlug.size} documents`);

    await checkRenders(String(after.slug), String(after.title));

    console.log('\nthe admin check');
    const stranger = { ...automation, userId: 'no-such-account' } as unknown as Automation;
    let refused = false;
    try {
      await publishToSiteBlog(db, stranger, brand, article);
    } catch {
      refused = true;
    }
    check('refuses an automation owned by a non-admin', refused);

    const draft = { ...automation, siteBlogStatus: 'draft' } as unknown as Automation;
    await publishToSiteBlog(db, draft, brand, article);
    const asDraft = (await db.collection('blogs').doc(target.id).get()).data() ?? {};
    check('a draft automation does not go live', asDraft.published === false);
  } finally {
    // Put the document back the way it was, including removing fields that were absent.
    const restore: Record<string, unknown> = {};
    for (const field of [
      'slug',
      'published',
      'publishDate',
      'metaDescription',
      'authorName',
      'showDate',
      'showAuthor',
      'showViews',
      'updatedAt',
    ]) {
      restore[field] = field in before ? before[field] : FieldValue.delete();
    }
    await db.collection('blogs').doc(target.id).update(restore);
    console.log(`\n  (restored blogs/${target.id})`);
  }
}

async function main() {
  checkSlugs();
  checkMetaDescriptions();
  await checkPublish(connect());

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
