/**
 * Headless automation runner. Server-only: imports the Firebase Admin SDK and must
 * never be pulled into a client bundle.
 *
 * Generation is reached by calling the existing `/api/generate-article` route over
 * loopback rather than by importing it. That route is ~7,000 lines and carries the
 * usage metering, concurrency guard, Shopify content selection and fact-check loop;
 * re-implementing or extracting it for headless use would risk all of that. The cost is
 * one loopback request per article. Because the call is to 127.0.0.1 it never touches
 * Railway's edge proxy, so the 5-minute idle and 15-minute hard request limits do not
 * apply to it.
 */
import { getAuth } from 'firebase-admin/auth';
import {
  getFirestore,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import type { BrandProfile } from '@/lib/firebase/firestore';
import {
  AUTOMATIONS_COLLECTION,
  AUTOMATION_RUNS_COLLECTION,
  MAX_ARTICLES_PER_RUN,
  STALE_CLAIM_MS,
  type Automation,
  type AutomationRunStatus,
} from './types';
import { computeNextRun, monthKey } from './schedule';
import {
  rankGscCandidates,
  rankGscPageCandidates,
  rotateTopics,
  type KeywordChoice,
} from './selection';
import { coveredKeywords, forgetCoveredKeywords } from './covered';
import { deriveKeyword } from './keyword';
import { getConnection, isGscConfigured, topPageQueries, topQueries } from '@/lib/gsc/client';

const FIREBASE_WEB_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyC8SaduwnXf05zyvldhXeDL-MmQf4W8DTs';

const MAX_ERROR_LENGTH = 600;

export interface RunOutcome {
  automationId: string;
  automationName: string;
  status: AutomationRunStatus;
  keyword: string;
  /** Why this topic was picked, so history explains itself. */
  triggerReason?: string;
  blogId?: string | null;
  /** Public path on the EnhanceMySEO blog, when the article was published there. */
  siteBlogPath?: string | null;
  error?: string | null;
  warning?: string | null;
}

function adminDb(): Firestore {
  initializeFirebaseAdmin();
  return getFirestore();
}

/**
 * Where to reach this same service. Loopback by default; `AUTOMATION_SELF_URL` exists
 * for the case where the cron and web processes are split across Railway services.
 */
function internalBaseUrl(): string {
  const override = process.env.AUTOMATION_SELF_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (override) return override.replace(/\/$/, '');

  // `npm start` binds to PORT, which Railway sets. `npm run dev` binds to 3001.
  const fallbackPort = process.env.NODE_ENV === 'development' ? 3001 : 3000;
  return `http://127.0.0.1:${process.env.PORT || fallbackPort}`;
}

function describeError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

/**
 * An ID token for a user who is not present. Admin SDK mints a custom token, which the
 * Identity Toolkit REST endpoint exchanges for the ID token that `/api/generate-article`
 * expects in its Authorization header.
 */
async function mintIdToken(uid: string): Promise<string> {
  initializeFirebaseAdmin();
  const customToken = await getAuth().createCustomToken(uid);

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_WEB_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not mint an ID token for the automation owner: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { idToken?: string };
  if (!payload.idToken) {
    throw new Error('Identity Toolkit returned no ID token');
  }
  return payload.idToken;
}

/** Thrown when a run cannot proceed for a reason the user needs to read and act on. */
class SkipRun extends Error {}

async function chooseGscKeywords(
  db: Firestore,
  automation: Automation,
  count: number
): Promise<KeywordChoice[]> {
  const config = automation.gsc;
  if (!config?.siteUrl) {
    throw new SkipRun('No Search Console property is selected for this automation.');
  }

  if (!isGscConfigured()) {
    throw new SkipRun('Search Console is not configured on this deployment.');
  }

  const connection = await getConnection(automation.userId, automation.brandId);
  if (!connection) {
    throw new SkipRun('Search Console is not connected for this brand. Reconnect it and try again.');
  }

  const byPage = config.dimension === 'page';
  const covered = await coveredKeywords(db, automation.userId, automation.brandId);
  const options = { lookbackDays: config.lookbackDays };

  let choices: KeywordChoice[];
  if (byPage) {
    const rows = await topPageQueries(connection, config.siteUrl, options);
    if (rows.length === 0) {
      throw new SkipRun(
        `Search Console returned no page data for the last ${config.lookbackDays} days.`
      );
    }
    choices = rankGscPageCandidates(rows, config, covered, count);
  } else {
    const rows = await topQueries(connection, config.siteUrl, options);
    if (rows.length === 0) {
      throw new SkipRun(
        `Search Console returned no query data for the last ${config.lookbackDays} days.`
      );
    }
    choices = rankGscCandidates(rows, config, covered, count);
  }

  if (choices.length === 0) {
    throw new SkipRun(
      byPage
        ? `No page cleared ${config.minMetric} ${config.metric} in the last ${config.lookbackDays} days with a top search term that has no article yet.`
        : `No Search Console query cleared ${config.minMetric} ${config.metric} without an article already written for it.`
    );
  }

  return choices;
}

/**
 * Increments the per-automation monthly counter and reports whether the article is
 * within the cap. Counted after a successful generation, so failed attempts do not
 * consume the allowance.
 */
async function recordArticleAgainstCap(db: Firestore, automationId: string): Promise<void> {
  const ref = db.collection(AUTOMATIONS_COLLECTION).doc(automationId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Automation | undefined;
    if (!data) return;

    const month = monthKey();
    const current = data.monthUsage?.month === month ? data.monthUsage.count : 0;
    tx.update(ref, { monthUsage: { month, count: current + 1 } });
  });
}

function remainingThisMonth(automation: Automation): number {
  const month = monthKey();
  const used = automation.monthUsage?.month === month ? automation.monthUsage.count : 0;
  return Math.max(0, automation.monthlyArticleCap - used);
}

async function loadBrand(db: Firestore, automation: Automation): Promise<BrandProfile> {
  const snap = await db.collection('brandProfiles').doc(automation.brandId).get();
  if (!snap.exists) {
    throw new Error('The brand profile for this automation no longer exists');
  }
  const brand = { id: snap.id, ...snap.data() } as BrandProfile;
  if (brand.userId !== automation.userId) {
    throw new Error('The brand profile for this automation belongs to another account');
  }
  return brand;
}

export interface GeneratedArticle {
  blogId: string;
  title: string;
  content: string;
  hasGenerationIssues: boolean;
}

async function generateArticle(
  db: Firestore,
  automation: Automation,
  brand: BrandProfile,
  keyword: string,
  idToken: string
): Promise<GeneratedArticle> {
  const fallbackTitle = `${keyword} - ${automation.contentType}`;

  // Mirrors the shape the articles dashboard creates, so automated articles appear in
  // history and open in the editor exactly like hand-generated ones.
  const blogRef = await db.collection('blogs').add({
    title: fallbackTitle,
    content: '',
    userId: automation.userId,
    brandId: automation.brandId,
    status: 'draft',
    keyword,
    contentType: automation.contentType,
    toneOfVoice: automation.toneOfVoice || '',
    instructions: automation.instructions || '',
    generationSettings: {
      usePerplexity: false,
      articleFraming: automation.contentType,
    },
    createdBy: 'automation',
    automationId: automation.id,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // This keyword is now taken, so drop the cached set the preview reads from.
  forgetCoveredKeywords(automation.userId, automation.brandId);

  const response = await fetch(`${internalBaseUrl()}/api/generate-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      blogId: blogRef.id,
      keyword,
      brandName: brand.brandName,
      businessType: brand.businessType,
      contentType: automation.contentType,
      toneOfVoice: automation.toneOfVoice || '',
      instructions: automation.instructions || '',
      brandGuidelines: brand.brandGuidelines || '',
      contentSelection: automation.contentSelection,
      // Shopify credentials are resolved server-side from the brand.
      brandId: automation.brandId,
      websiteUrl: brand.websiteUrl || '',
      brandColor: brand.brandColor || '#000000',
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    // The blog placeholder is removed so a failed run leaves no empty article behind.
    await blogRef.delete().catch(() => undefined);

    const summary = payload.error || `Generation failed with status ${response.status}`;
    // The route reports a generic sentence and puts the cause in `detail`; the run record
    // is the only place the user can see it, so keep both.
    const reason = payload.detail ? `${summary}: ${payload.detail}` : summary;
    const error = new Error(reason);
    if (response.status === 429) {
      error.name = 'UsageLimitError';
    }
    throw error;
  }

  const payload = (await response.json()) as {
    title?: string;
    content?: string;
    hasGenerationIssues?: boolean;
  };

  const title = payload.title || fallbackTitle;
  const content = payload.content || '';

  await blogRef.update({ title, content, updatedAt: Timestamp.now() });

  return {
    blogId: blogRef.id,
    title,
    content,
    hasGenerationIssues: Boolean(payload.hasGenerationIssues),
  };
}

async function pushToShopify(
  automation: Automation,
  brand: BrandProfile,
  article: GeneratedArticle,
  idToken: string
): Promise<void> {
  // Only the store URL is checked here. A token may not exist at all: stores on a Dev
  // Dashboard app get one minted per request, which the push route handles.
  if (!brand.shopifyStoreUrl) {
    throw new Error('Auto-push is on but the brand profile has no Shopify store URL');
  }

  const response = await fetch(`${internalBaseUrl()}/api/shopify/push-article`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      brandId: automation.brandId,
      blogId: automation.shopifyBlogId,
      article: {
        title: article.title,
        content: article.content,
        status: automation.shopifyStatus,
        // Without this Shopify bylines the article as "Shopify API", which is the
        // access token's app rather than anyone the reader should see.
        author: brand.shopifyAuthor || brand.brandName,
      },
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `Shopify push failed with status ${response.status}`);
  }
}

/* --------------------------------------------------- the EnhanceMySEO blog ----- */

/**
 * Automation documents are written straight from the browser, so the flag on the
 * config proves nothing: anyone can set a boolean on a document they own. The public
 * blog lists every published article regardless of author, which makes publishing to
 * it an administrator's action, checked here against the account rather than the
 * config.
 */
async function ownerIsAdmin(db: Firestore, userId: string): Promise<boolean> {
  const snap = await db.collection('users').doc(userId).get();
  return snap.exists && snap.data()?.subscription_status === 'admin';
}

/** Title to URL slug, matching what the blog editor produces by hand. */
export function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/-$/, '');
}

/** A slug nothing else is using, since /blog/[slug] resolves by this field alone. */
async function uniqueSlug(db: Firestore, title: string, blogId: string): Promise<string> {
  const base = toSlug(title) || `post-${blogId.slice(0, 8)}`;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await db.collection('blogs').where('slug', '==', candidate).limit(1).get();
    if (clash.empty || clash.docs[0].id === blogId) return candidate;
  }

  // Ten near-identical titles is implausible, but a suffix is better than a collision.
  return `${base}-${blogId.slice(0, 6)}`;
}

/** First readable sentence or two of the article, for the meta description. */
export function toMetaDescription(html: string): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= 155) return text;
  const cut = text.slice(0, 155);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Publishes a generated article onto the EnhanceMySEO blog.
 *
 * Unlike the Shopify path there is nothing to push: the article already lives in the
 * `blogs` collection, and /blog reads from that same place. This fills in the fields
 * the public pages need and that the generator does not set.
 */
export async function publishToSiteBlog(
  db: Firestore,
  automation: Automation,
  brand: BrandProfile,
  article: GeneratedArticle
): Promise<string> {
  if (!(await ownerIsAdmin(db, automation.userId))) {
    throw new Error('Publishing to the EnhanceMySEO blog is only available to administrators');
  }

  const slug = await uniqueSlug(db, article.title, article.blogId);
  const live = automation.siteBlogStatus === 'published';

  await db
    .collection('blogs')
    .doc(article.blogId)
    .update({
      slug,
      published: live,
      publishDate: Timestamp.now(),
      metaDescription: toMetaDescription(article.content),
      // The post page only counts a view when authorId is set, and the blog CMS at
      // /blogs expects it, so an automated post has to carry the same fields a
      // hand-written one does. viewCount is deliberately left alone: every reader of
      // it defaults to 0, and writing a 0 here would reset the count if an article is
      // ever republished.
      authorId: automation.userId,
      authorName: brand.brandName || 'EnhanceMySEO',
      showDate: true,
      showAuthor: false,
      showViews: false,
      updatedAt: Timestamp.now(),
    });

  return `/blog/${slug}`;
}

/**
 * Creates the run document before the work starts, as `running`.
 *
 * Generation takes minutes, so a record written only on completion leaves the user with
 * no evidence their click did anything — which invites them to press Run now again and
 * queue duplicate work.
 */
async function openRun(
  db: Firestore,
  automation: Automation,
  keyword: string,
  startedAt: Timestamp
): Promise<DocumentReference> {
  return db.collection(AUTOMATION_RUNS_COLLECTION).add({
    userId: automation.userId,
    automationId: automation.id,
    automationName: automation.name,
    status: 'running' satisfies AutomationRunStatus,
    trigger: automation.trigger,
    keyword,
    triggerReason: '',
    blogId: null,
    articleTitle: null,
    pushedToShopify: false,
    publishedToSiteBlog: false,
    siteBlogPath: null,
    error: null,
    warning: null,
    startedAt,
    finishedAt: null,
  });
}

async function closeRun(
  ref: DocumentReference,
  outcome: Omit<RunOutcome, 'automationId' | 'automationName'> & {
    pushedToShopify: boolean;
    publishedToSiteBlog?: boolean;
  }
): Promise<void> {
  await ref.update({
    status: outcome.status,
    keyword: outcome.keyword,
    triggerReason: outcome.triggerReason || '',
    blogId: outcome.blogId ?? null,
    pushedToShopify: outcome.pushedToShopify,
    publishedToSiteBlog: outcome.publishedToSiteBlog ?? false,
    siteBlogPath: outcome.siteBlogPath ?? null,
    error: outcome.error ?? null,
    warning: outcome.warning ?? null,
    finishedAt: Timestamp.now(),
  });
}

/**
 * Search Console already supplies real search terms, so deriving a keyword only applies
 * to topic lists. Automations created before the setting existed are treated as on.
 */
function usesDerivedKeywords(automation: Automation): boolean {
  return automation.trigger === 'topicList' && automation.deriveKeywords !== false;
}

/**
 * The keyword to write about, and the sentence history shows for why.
 *
 * `written` is null when the automation writes its topics verbatim.
 */
async function resolveKeyword(
  brand: BrandProfile,
  choice: KeywordChoice,
  written: Set<string> | null
): Promise<{ keyword: string; reason: string }> {
  if (!written) {
    return { keyword: choice.keyword, reason: choice.reason || '' };
  }

  const derived = await deriveKeyword({
    topic: choice.keyword,
    brandName: brand.brandName,
    businessType: brand.businessType,
    exclusions: written,
  });

  if (!derived.derived) {
    return {
      keyword: derived.keyword || choice.keyword,
      reason: `${choice.reason}. Wrote the topic as-is because ${derived.note}.`,
    };
  }

  return {
    keyword: derived.keyword,
    reason: `${choice.reason}, rewritten for buyer intent from "${choice.keyword}".`,
  };
}

/**
 * Runs one automation to completion, writing a run record per article attempted.
 * Never throws: every failure becomes a recorded run so the user can see what happened.
 */
export async function runAutomation(automation: Automation): Promise<RunOutcome[]> {
  const db = adminDb();
  const outcomes: RunOutcome[] = [];

  // Opened up front so the dashboard has something to show immediately. Each branch below
  // closes it, and the article loop reuses it for the first article.
  const startedAt = Timestamp.now();
  let openRef = await openRun(db, automation, '', startedAt);

  const record = async (
    partial: Omit<RunOutcome, 'automationId' | 'automationName'> & {
      pushedToShopify?: boolean;
      publishedToSiteBlog?: boolean;
    }
  ) => {
    const outcome: RunOutcome = {
      automationId: automation.id as string,
      automationName: automation.name,
      ...partial,
    };
    outcomes.push(outcome);
    await closeRun(openRef, { ...partial, pushedToShopify: partial.pushedToShopify ?? false });
  };

  const allowance = remainingThisMonth(automation);
  if (allowance === 0) {
    await record({
      status: 'skipped',
      keyword: '',
      error: `This automation has reached its cap of ${automation.monthlyArticleCap} articles for the month.`,
    });
    return outcomes;
  }

  const requested = Math.min(automation.articlesPerRun, MAX_ARTICLES_PER_RUN, allowance);

  let choices: KeywordChoice[];
  try {
    choices =
      automation.trigger === 'gscTraffic'
        ? await chooseGscKeywords(db, automation, requested)
        : rotateTopics(automation.topics, automation.topicCursor, requested);
  } catch (error) {
    // A SkipRun is a decision, not a fault: the automation is fine, there was just
    // nothing worth writing. Anything else is a genuine failure.
    await record({
      status: error instanceof SkipRun ? 'skipped' : 'failed',
      keyword: '',
      error: describeError(error),
    });
    return outcomes;
  }

  if (choices.length === 0) {
    await record({
      status: 'skipped',
      keyword: '',
      error: 'This automation has no topics to write about.',
    });
    return outcomes;
  }

  let brand: BrandProfile;
  let idToken: string;
  try {
    brand = await loadBrand(db, automation);
    idToken = await mintIdToken(automation.userId);
  } catch (error) {
    await record({ status: 'failed', keyword: '', error: describeError(error) });
    return outcomes;
  }

  // Copied rather than used in place: entries are added as this run writes them, and
  // the set returned here is shared with the preview's cache.
  const written = usesDerivedKeywords(automation)
    ? new Set(await coveredKeywords(db, automation.userId, automation.brandId))
    : null;

  for (const [index, choice] of choices.entries()) {
    const chosen = await resolveKeyword(brand, choice, written);

    // The first article reuses the record opened above; later ones get their own.
    if (index > 0) {
      openRef = await openRun(db, automation, chosen.keyword, Timestamp.now());
    } else {
      await openRef.update({ keyword: chosen.keyword, triggerReason: chosen.reason });
    }

    // So the next article in this same run cannot land on the keyword just taken.
    written?.add(chosen.keyword.toLowerCase());

    try {
      const article = await generateArticle(db, automation, brand, chosen.keyword, idToken);
      await recordArticleAgainstCap(db, automation.id as string);

      let pushed = false;
      let sitePath: string | null = null;
      let warning: string | null = null;

      if (article.hasGenerationIssues) {
        // The fact-check loop flagged something. Publishing that unreviewed is worse
        // than leaving it in the dashboard, so every destination is withheld for this
        // article regardless of what the automation asked for.
        warning =
          automation.autoPushToShopify || automation.publishToSiteBlog
            ? 'Fact-check flagged this article, so it was not published. Review it first.'
            : 'Fact-check flagged this article. Review it before publishing.';
      } else {
        if (automation.autoPushToShopify) {
          try {
            await pushToShopify(automation, brand, article, idToken);
            pushed = true;
          } catch (error) {
            warning = `Article saved but the Shopify push failed: ${describeError(error)}`;
          }
        }

        if (automation.publishToSiteBlog) {
          try {
            sitePath = await publishToSiteBlog(db, automation, brand, article);
          } catch (error) {
            const reason = `Article saved but publishing to the blog failed: ${describeError(error)}`;
            warning = warning ? `${warning} ${reason}` : reason;
          }
        }
      }

      if (choice.nextCursor !== undefined) {
        await db
          .collection(AUTOMATIONS_COLLECTION)
          .doc(automation.id as string)
          .update({ topicCursor: choice.nextCursor });
      }

      await record({
        status: 'succeeded',
        keyword: chosen.keyword,
        triggerReason: chosen.reason,
        blogId: article.blogId,
        warning,
        pushedToShopify: pushed,
        publishedToSiteBlog: sitePath !== null,
        siteBlogPath: sitePath,
      });
    } catch (error) {
      const isUsageLimit = error instanceof Error && error.name === 'UsageLimitError';
      await record({
        status: isUsageLimit ? 'skipped' : 'failed',
        keyword: chosen.keyword,
        triggerReason: chosen.reason,
        error: describeError(error),
      });

      // A tier limit will not clear within this run, so stop rather than burn attempts.
      if (isUsageLimit) break;
    }
  }

  return outcomes;
}

/**
 * Takes ownership of one due automation. Claiming also advances `nextRunAt`, so a crash
 * mid-generation costs the user that slot instead of retrying immediately and spending
 * Claude and Perplexity credits in a loop.
 */
async function claimAutomation(db: Firestore, automationId: string): Promise<Automation | null> {
  const ref = db.collection(AUTOMATIONS_COLLECTION).doc(automationId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;

    const automation = { id: snap.id, ...snap.data() } as Automation;
    if (!automation.enabled) return null;

    const now = Date.now();
    if (!automation.nextRunAt || automation.nextRunAt.toMillis() > now) return null;

    const claimedMs = automation.claimedAt ? automation.claimedAt.toMillis() : 0;
    if (claimedMs && now - claimedMs < STALE_CLAIM_MS) return null;

    tx.update(ref, {
      claimedAt: Timestamp.fromMillis(now),
      nextRunAt: Timestamp.fromDate(computeNextRun(automation.schedule, new Date(now))),
    });

    return automation;
  });
}

async function releaseClaim(db: Firestore, automationId: string): Promise<void> {
  await db
    .collection(AUTOMATIONS_COLLECTION)
    .doc(automationId)
    .update({ claimedAt: null, lastRunAt: Timestamp.now() })
    .catch(() => undefined);
}

/**
 * Clears claims left behind by a process that died mid-run, so the automation is not
 * locked out forever. Its `nextRunAt` was already advanced at claim time, so clearing
 * the claim simply lets the next scheduled slot proceed.
 */
export async function reapStaleClaims(): Promise<number> {
  const db = adminDb();
  const cutoff = Timestamp.fromMillis(Date.now() - STALE_CLAIM_MS);

  const stale = await db
    .collection(AUTOMATIONS_COLLECTION)
    .where('claimedAt', '<=', cutoff)
    .limit(25)
    .get();

  let reaped = 0;
  for (const doc of stale.docs) {
    await doc.ref.update({ claimedAt: null }).catch(() => undefined);
    reaped += 1;
  }
  return reaped;
}

export interface TickSummary {
  claimed: number;
  reaped: number;
  outcomes: RunOutcome[];
}

/**
 * Finds due automations, claims them, and runs them serially. Generation is heavy, and
 * `/api/generate-article` enforces its own per-user concurrency limit, so running these
 * one at a time avoids tripping it.
 */
export async function processDueAutomations(limit = 10): Promise<TickSummary> {
  const db = adminDb();
  const reaped = await reapStaleClaims();

  const due = await db
    .collection(AUTOMATIONS_COLLECTION)
    .where('enabled', '==', true)
    .where('nextRunAt', '<=', Timestamp.now())
    .limit(limit)
    .get();

  const summary: TickSummary = { claimed: 0, reaped, outcomes: [] };

  for (const doc of due.docs) {
    const automation = await claimAutomation(db, doc.id);
    if (!automation) continue;

    summary.claimed += 1;
    try {
      const outcomes = await runAutomation(automation);
      summary.outcomes.push(...outcomes);
    } finally {
      await releaseClaim(db, doc.id);
    }
  }

  return summary;
}

export class AutomationAccessError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AutomationAccessError';
  }
}

/**
 * Validates and claims an automation for a user-triggered run. Separate from the run
 * itself so the Run now endpoint can reject a bad request with a real status code before
 * it responds, then do the slow part in the background.
 */
export async function claimForManualRun(userId: string, automationId: string): Promise<Automation> {
  const db = adminDb();
  const snap = await db.collection(AUTOMATIONS_COLLECTION).doc(automationId).get();

  if (!snap.exists) {
    throw new AutomationAccessError('That automation no longer exists', 404);
  }

  const automation = { id: snap.id, ...snap.data() } as Automation;
  if (automation.userId !== userId) {
    throw new AutomationAccessError('That automation belongs to another account', 403);
  }

  const claimedMs = automation.claimedAt ? automation.claimedAt.toMillis() : 0;
  if (claimedMs && Date.now() - claimedMs < STALE_CLAIM_MS) {
    throw new AutomationAccessError('This automation is already running', 409);
  }

  await db.collection(AUTOMATIONS_COLLECTION).doc(automationId).update({ claimedAt: Timestamp.now() });

  return automation;
}

export async function finishManualRun(automationId: string): Promise<void> {
  await releaseClaim(adminDb(), automationId);
}
