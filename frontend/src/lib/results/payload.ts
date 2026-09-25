import {
  CaseStudyMetrics,
  CaseStudyScreenshot,
  MAX_CASE_STUDY_SCREENSHOTS,
  MONTH_PATTERN,
  slugify,
} from './types';

/**
 * Shapes an untrusted request body into exactly the fields a case study document may
 * contain. Spreading the body into Firestore would let a caller set ownerUid, publishedAt
 * or anything else the server is supposed to control.
 */
function str(value: unknown, max = 400): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

export function parseMetrics(raw: unknown): CaseStudyMetrics {
  const source = (raw ?? {}) as Record<string, unknown>;
  return {
    clicksBefore: numOrNull(source.clicksBefore),
    clicksAfter: numOrNull(source.clicksAfter),
    impressionsBefore: numOrNull(source.impressionsBefore),
    impressionsAfter: numOrNull(source.impressionsAfter),
    periodLabel: str(source.periodLabel, 80),
    articlesPublished: numOrNull(source.articlesPublished),
    keywordsOnPageOne: numOrNull(source.keywordsOnPageOne),
  };
}

function parseScreenshots(raw: unknown): CaseStudyScreenshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_CASE_STUDY_SCREENSHOTS)
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      return { url: str(record.url, 1_000), caption: str(record.caption, 200) };
    })
    .filter((shot) => shot.url.startsWith('http') || shot.url.startsWith('/'));
}

export interface ParsedCaseStudy {
  values: Record<string, unknown>;
  errors: string[];
}

export function parseCaseStudyBody(raw: unknown): ParsedCaseStudy {
  const body = (raw ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  const title = str(body.title, 160);
  const storeName = str(body.storeName, 120);
  const summary = str(body.summary, 400);
  const slug = slugify(str(body.slug, 160) || title);

  // Anything that is not a well-formed 'YYYY-MM' is dropped rather than stored, so the
  // display helpers never have to guess at a half-typed date.
  const month = (value: unknown) => {
    const text = str(value, 7);
    return MONTH_PATTERN.test(text) ? text : '';
  };
  const startDate = month(body.startDate);
  const endDate = month(body.endDate);

  if (!title) errors.push('A title is required.');
  if (!storeName) errors.push('A store name is required.');
  if (!summary) errors.push('A short summary is required.');
  if (!slug) errors.push('A URL slug is required.');
  if (endDate && !startDate) {
    errors.push('An end date needs a start date to go with it.');
  }
  if (startDate && endDate && endDate < startDate) {
    errors.push('The end date comes before the start date.');
  }

  return {
    errors,
    values: {
      title,
      slug,
      storeName,
      storeUrl: str(body.storeUrl, 300),
      industry: str(body.industry, 80),
      logoUrl: str(body.logoUrl, 1_000),
      summary,
      body: typeof body.body === 'string' ? body.body.slice(0, 50_000) : '',
      startDate,
      endDate,
      quote: str(body.quote, 600),
      quoteAuthor: str(body.quoteAuthor, 120),
      quoteRole: str(body.quoteRole, 120),
      metrics: parseMetrics(body.metrics),
      screenshots: parseScreenshots(body.screenshots),
      verified: body.verified === true,
      featured: body.featured === true,
      published: body.published === true,
    },
  };
}
