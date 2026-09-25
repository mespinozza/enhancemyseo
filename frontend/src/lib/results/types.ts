/**
 * Case studies are the public proof on /results. They are authored by an admin and,
 * because they make performance claims on a customer's behalf, every field that a
 * visitor sees is either typed in by the admin or backed by an uploaded screenshot.
 *
 * Customer-supplied numbers arrive as ResultSubmission and stay unpublished until an
 * admin turns one into a CaseStudy by hand.
 */

export interface CaseStudyMetrics {
  clicksBefore: number | null;
  clicksAfter: number | null;
  impressionsBefore: number | null;
  impressionsAfter: number | null;
  /** Free text, e.g. "first 6 months" — how long the numbers cover. */
  periodLabel: string;
  articlesPublished: number | null;
  keywordsOnPageOne: number | null;
}

export interface CaseStudyScreenshot {
  url: string;
  caption: string;
}

export interface CaseStudy {
  id: string;
  slug: string;
  title: string;
  storeName: string;
  storeUrl: string;
  industry: string;
  logoUrl: string;
  /** One or two sentences for the listing card. */
  summary: string;
  /** Long-form HTML, admin authored, rendered with dangerouslySetInnerHTML. */
  body: string;
  /**
   * When the engagement started and ended, as 'YYYY-MM'. Month precision on purpose:
   * a day would imply a contract date we do not actually track. An empty endDate means
   * the work is ongoing, which is what makes a store an active client.
   */
  startDate: string;
  endDate: string;
  quote: string;
  quoteAuthor: string;
  quoteRole: string;
  metrics: CaseStudyMetrics;
  screenshots: CaseStudyScreenshot[];
  /** Admin has personally seen the Search Console data behind these numbers. */
  verified: boolean;
  featured: boolean;
  published: boolean;
  publishedAt: string | null;
  ownerUid: string;
  createdAt: string;
  updatedAt: string;
}

export type SubmissionStatus = 'new' | 'reviewing' | 'published' | 'archived';

export interface ResultSubmission {
  id: string;
  ownerUid: string;
  email: string;
  name: string;
  storeName: string;
  storeUrl: string;
  message: string;
  metrics: CaseStudyMetrics;
  screenshots: string[];
  status: SubmissionStatus;
  createdAt: string;
}

export const EMPTY_METRICS: CaseStudyMetrics = {
  clicksBefore: null,
  clicksAfter: null,
  impressionsBefore: null,
  impressionsAfter: null,
  periodLabel: '',
  articlesPublished: null,
  keywordsOnPageOne: null,
};

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Formats 'YYYY-MM' without going through Date, which would shift the month across a
 * timezone boundary and render January as the previous December.
 */
export function formatMonth(value: string): string {
  if (!MONTH_PATTERN.test(value)) return '';
  const [year, month] = value.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** A store we are still working with: it has a start date and no end date. */
export function isActiveClient(study: Pick<CaseStudy, 'startDate' | 'endDate'>): boolean {
  return MONTH_PATTERN.test(study.startDate) && !MONTH_PATTERN.test(study.endDate);
}

/** "Apr 2025 – Present", or null when no start date has been recorded. */
export function engagementLabel(
  study: Pick<CaseStudy, 'startDate' | 'endDate'>
): string | null {
  const start = formatMonth(study.startDate);
  if (!start) return null;
  const end = formatMonth(study.endDate);
  return `${start} – ${end || 'Present'}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Growth as a percentage, or null when there is nothing honest to show: a missing
 * number, or a "before" of zero, where the percentage would be infinite.
 */
export function growthPercent(before: number | null, after: number | null): number | null {
  if (before === null || after === null || before <= 0) return null;
  return Math.round(((after - before) / before) * 100);
}

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}K`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

/** Totals across every published case study, for the numbers in the page header. */
export function aggregateTotals(studies: CaseStudy[]) {
  return studies.reduce(
    (totals, study) => ({
      clicks: totals.clicks + (study.metrics.clicksAfter ?? 0),
      impressions: totals.impressions + (study.metrics.impressionsAfter ?? 0),
      articles: totals.articles + (study.metrics.articlesPublished ?? 0),
      stores: totals.stores + 1,
      active: totals.active + (isActiveClient(study) ? 1 : 0),
    }),
    { clicks: 0, impressions: 0, articles: 0, stores: 0, active: 0 }
  );
}
