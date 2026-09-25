import 'server-only';

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import {
  CaseStudy,
  CaseStudyMetrics,
  CaseStudyScreenshot,
  EMPTY_METRICS,
  MONTH_PATTERN,
  ResultSubmission,
  SubmissionStatus,
} from './types';

export const CASE_STUDIES = 'caseStudies';
export const SUBMISSIONS = 'resultSubmissions';

function db() {
  initializeFirebaseAdmin();
  return getFirestore();
}

/**
 * Firestore hands back Timestamps, and a Timestamp cannot cross the server/client
 * boundary in a React payload. Every date leaves this module as an ISO string.
 */
function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normaliseMetrics(raw: unknown): CaseStudyMetrics {
  const source = (raw ?? {}) as Record<string, unknown>;
  return {
    clicksBefore: toNumberOrNull(source.clicksBefore),
    clicksAfter: toNumberOrNull(source.clicksAfter),
    impressionsBefore: toNumberOrNull(source.impressionsBefore),
    impressionsAfter: toNumberOrNull(source.impressionsAfter),
    periodLabel: typeof source.periodLabel === 'string' ? source.periodLabel : '',
    articlesPublished: toNumberOrNull(source.articlesPublished),
    keywordsOnPageOne: toNumberOrNull(source.keywordsOnPageOne),
  };
}

function normaliseScreenshots(raw: unknown): CaseStudyScreenshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (typeof entry === 'string') return { url: entry, caption: '' };
      const record = (entry ?? {}) as Record<string, unknown>;
      return {
        url: typeof record.url === 'string' ? record.url : '',
        caption: typeof record.caption === 'string' ? record.caption : '',
      };
    })
    .filter((shot) => shot.url !== '');
}

function toCaseStudy(id: string, data: Record<string, unknown>): CaseStudy {
  const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : '');
  return {
    id,
    slug: text('slug'),
    title: text('title'),
    storeName: text('storeName'),
    storeUrl: text('storeUrl'),
    industry: text('industry'),
    logoUrl: text('logoUrl'),
    summary: text('summary'),
    body: text('body'),
    startDate: MONTH_PATTERN.test(text('startDate')) ? text('startDate') : '',
    endDate: MONTH_PATTERN.test(text('endDate')) ? text('endDate') : '',
    quote: text('quote'),
    quoteAuthor: text('quoteAuthor'),
    quoteRole: text('quoteRole'),
    metrics: normaliseMetrics(data.metrics),
    screenshots: normaliseScreenshots(data.screenshots),
    verified: data.verified === true,
    featured: data.featured === true,
    published: data.published === true,
    publishedAt: toIso(data.publishedAt),
    ownerUid: text('ownerUid'),
    createdAt: toIso(data.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(data.updatedAt) ?? new Date(0).toISOString(),
  };
}

function bySortOrder(a: CaseStudy, b: CaseStudy): number {
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  return (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);
}

/**
 * Sorting and the published filter happen here rather than in the query. The collection
 * is small, and a composite where+orderBy would need an index that has to be deployed
 * before the page works.
 */
export async function listPublishedCaseStudies(): Promise<CaseStudy[]> {
  const snapshot = await db().collection(CASE_STUDIES).get();
  return snapshot.docs
    .map((doc) => toCaseStudy(doc.id, doc.data()))
    .filter((study) => study.published)
    .sort(bySortOrder);
}

export async function listAllCaseStudies(): Promise<CaseStudy[]> {
  const snapshot = await db().collection(CASE_STUDIES).get();
  return snapshot.docs.map((doc) => toCaseStudy(doc.id, doc.data())).sort(bySortOrder);
}

export async function getCaseStudyBySlug(slug: string): Promise<CaseStudy | null> {
  const snapshot = await db().collection(CASE_STUDIES).where('slug', '==', slug).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return toCaseStudy(doc.id, doc.data());
}

export async function getCaseStudyById(id: string): Promise<CaseStudy | null> {
  const doc = await db().collection(CASE_STUDIES).doc(id).get();
  if (!doc.exists) return null;
  return toCaseStudy(doc.id, doc.data() as Record<string, unknown>);
}

/** True when no other document already uses this slug. */
export async function isSlugAvailable(slug: string, exceptId?: string): Promise<boolean> {
  const snapshot = await db().collection(CASE_STUDIES).where('slug', '==', slug).get();
  return snapshot.docs.every((doc) => doc.id === exceptId);
}

export async function createCaseStudy(
  ownerUid: string,
  data: Record<string, unknown>
): Promise<string> {
  const now = Timestamp.now();
  const ref = await db()
    .collection(CASE_STUDIES)
    .add({
      ...data,
      ownerUid,
      createdAt: now,
      updatedAt: now,
      publishedAt: data.published === true ? now : null,
    });
  return ref.id;
}

export async function updateCaseStudy(id: string, data: Record<string, unknown>): Promise<void> {
  const ref = db().collection(CASE_STUDIES).doc(id);
  const existing = await ref.get();
  if (!existing.exists) throw new Error('Case study not found');

  const wasPublished = existing.data()?.published === true;
  const nowPublished = data.published === true;

  await ref.update({
    ...data,
    updatedAt: Timestamp.now(),
    // Stamp the publish date the first time it goes live and keep it thereafter, so
    // unpublishing and republishing does not rewrite history.
    ...(nowPublished && !wasPublished ? { publishedAt: Timestamp.now() } : {}),
  });
}

export async function deleteCaseStudy(id: string): Promise<void> {
  await db().collection(CASE_STUDIES).doc(id).delete();
}

function toSubmission(id: string, data: Record<string, unknown>): ResultSubmission {
  const text = (key: string) => (typeof data[key] === 'string' ? (data[key] as string) : '');
  const status = text('status');
  return {
    id,
    ownerUid: text('ownerUid'),
    email: text('email'),
    name: text('name'),
    storeName: text('storeName'),
    storeUrl: text('storeUrl'),
    message: text('message'),
    metrics: normaliseMetrics(data.metrics),
    screenshots: Array.isArray(data.screenshots)
      ? (data.screenshots as unknown[]).filter((url): url is string => typeof url === 'string')
      : [],
    status: (['new', 'reviewing', 'published', 'archived'] as const).includes(
      status as SubmissionStatus
    )
      ? (status as SubmissionStatus)
      : 'new',
    createdAt: toIso(data.createdAt) ?? new Date(0).toISOString(),
  };
}

export async function createSubmission(data: Record<string, unknown>): Promise<string> {
  const ref = await db()
    .collection(SUBMISSIONS)
    .add({ ...data, status: 'new', createdAt: Timestamp.now() });
  return ref.id;
}

export async function listSubmissions(): Promise<ResultSubmission[]> {
  const snapshot = await db().collection(SUBMISSIONS).get();
  return snapshot.docs
    .map((doc) => toSubmission(doc.id, doc.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateSubmissionStatus(
  id: string,
  status: SubmissionStatus
): Promise<void> {
  await db().collection(SUBMISSIONS).doc(id).update({ status });
}

export async function deleteSubmission(id: string): Promise<void> {
  await db().collection(SUBMISSIONS).doc(id).delete();
}

/** How many submissions are still waiting on a decision, for the admin nav badge. */
export async function countNewSubmissions(): Promise<number> {
  const snapshot = await db().collection(SUBMISSIONS).where('status', '==', 'new').get();
  return snapshot.size;
}

export { EMPTY_METRICS };
