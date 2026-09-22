/**
 * Deciding what to write about, as pure functions.
 *
 * Kept out of the runner so the interesting logic — list rotation and the ranking and
 * de-duplication of Search Console traffic — can be tested without Firebase, Google, or
 * a network. The runner supplies the data and applies the results, and the preview
 * endpoint shows the same ranking back to the user before anything runs.
 */
import type { AutomationGscConfig } from './types';

export interface KeywordChoice {
  keyword: string;
  reason: string;
  /** Written back so a topic list advances across runs. Absent for other triggers. */
  nextCursor?: number;
}

export interface QueryRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

/** One search term on one landing page, as Search Console reports pages. */
export interface PageQueryRow extends QueryRow {
  page: string;
}

/**
 * A ranked thing an automation could write about, with the reasons it might not.
 *
 * Ineligible entries are kept rather than dropped so the preview can show a user why
 * their property produced fewer candidates than they expected — a threshold set too
 * high looks identical to an empty property otherwise.
 */
export interface GscCandidate {
  /** What the article would actually be written about. */
  keyword: string;
  /** Set only when ranking by page. */
  page?: string;
  clicks: number;
  impressions: number;
  position: number;
  /** The value of whichever metric the automation ranks on. */
  metricValue: number;
  /** An article already exists for this keyword on this brand. */
  covered: boolean;
  belowThreshold: boolean;
  /**
   * A higher-ranked page already claimed this search term. Two pages competing for the
   * same term is common, and without this a single run would write it twice.
   */
  duplicate?: boolean;
  reason: string;
}

/**
 * Walks a topic list from `cursor`, wrapping at the end. Asking for more topics than the
 * list holds repeats it rather than returning fewer, so a three-per-run automation with
 * two topics still produces three articles.
 */
export function rotateTopics(topics: string[], cursor: number, count: number): KeywordChoice[] {
  const cleaned = topics.map((topic) => topic.trim()).filter(Boolean);
  if (cleaned.length === 0 || count <= 0) return [];

  const choices: KeywordChoice[] = [];
  let position = Number.isInteger(cursor) ? cursor : 0;

  for (let taken = 0; taken < count; taken += 1) {
    const index = ((position % cleaned.length) + cleaned.length) % cleaned.length;
    position = index + 1;
    choices.push({
      keyword: cleaned[index],
      reason: `Topic ${index + 1} of ${cleaned.length} in the list`,
      nextCursor: position % cleaned.length,
    });
  }

  return choices;
}

export function metricOf(row: QueryRow, metric: AutomationGscConfig['metric']): number {
  return metric === 'impressions' ? row.impressions : row.clicks;
}

/** Path only, so a preview line stays readable. Falls back to the raw value. */
export function shortenPage(page: string): string {
  try {
    const url = new URL(page);
    return url.pathname === '/' ? url.hostname : url.pathname;
  } catch {
    return page;
  }
}

/**
 * Every query the property saw, best first, flagged with whether it is usable.
 *
 * `covered` holds keywords already written for the brand, lowercased. Without that check
 * a traffic-driven automation would rewrite its single best query every time it ran,
 * since that query stays top of the list.
 */
export function collectQueryCandidates(
  rows: QueryRow[],
  config: AutomationGscConfig,
  covered: Set<string>
): GscCandidate[] {
  return rows
    .filter((row) => Boolean(row.query?.trim()))
    .map((row) => {
      const metricValue = metricOf(row, config.metric);
      return {
        keyword: row.query.trim(),
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
        metricValue,
        covered: covered.has(row.query.trim().toLowerCase()),
        belowThreshold: metricValue < config.minMetric,
        reason:
          `Search Console: ${Math.round(metricValue)} ${config.metric} ` +
          `in the last ${config.lookbackDays} days, average position ${row.position.toFixed(1)}`,
      };
    })
    .sort((a, b) => b.metricValue - a.metricValue);
}

/**
 * Landing pages totalled up, best first, each carrying the term it ranks best for.
 *
 * The article is still written about a search term, because that is what the generator
 * takes; ranking by page only changes which term wins. A page's traffic is the sum of
 * its rows, and its position is weighted by impressions so one obscure query sitting at
 * rank 90 cannot drag a strong page's average down.
 */
export function collectPageCandidates(
  rows: PageQueryRow[],
  config: AutomationGscConfig,
  covered: Set<string>
): GscCandidate[] {
  interface Bucket {
    page: string;
    clicks: number;
    impressions: number;
    weightedPosition: number;
    weight: number;
    topQuery: string;
    topMetric: number;
    topPosition: number;
  }

  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    if (!row.page?.trim() || !row.query?.trim()) continue;

    const page = row.page.trim();
    const query = row.query.trim();
    const rowMetric = metricOf(row, config.metric);
    // An all-zero page would otherwise divide by zero when averaging position.
    const weight = row.impressions > 0 ? row.impressions : 1;

    const bucket = buckets.get(page) || {
      page,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      weight: 0,
      topQuery: query,
      topMetric: -1,
      topPosition: row.position,
    };

    bucket.clicks += row.clicks;
    bucket.impressions += row.impressions;
    bucket.weightedPosition += row.position * weight;
    bucket.weight += weight;

    if (rowMetric > bucket.topMetric) {
      bucket.topQuery = query;
      bucket.topMetric = rowMetric;
      bucket.topPosition = row.position;
    }

    buckets.set(page, bucket);
  }

  // Ranked before the duplicate check, so the page with the most traffic is the one that
  // keeps a contested term.
  const ranked = Array.from(buckets.values()).sort((a, b) => {
    const metricFor = (bucket: Bucket) =>
      config.metric === 'impressions' ? bucket.impressions : bucket.clicks;
    return metricFor(b) - metricFor(a);
  });

  const claimed = new Set<string>();

  return ranked.map((bucket) => {
    const metricValue = config.metric === 'impressions' ? bucket.impressions : bucket.clicks;
    const position = bucket.weight > 0 ? bucket.weightedPosition / bucket.weight : 0;
    const keywordKey = bucket.topQuery.toLowerCase();
    const duplicate = claimed.has(keywordKey);
    claimed.add(keywordKey);

    return {
      keyword: bucket.topQuery,
      page: bucket.page,
      clicks: bucket.clicks,
      impressions: bucket.impressions,
      position,
      metricValue,
      covered: covered.has(keywordKey),
      belowThreshold: metricValue < config.minMetric,
      duplicate,
      reason:
        `Search Console: ${shortenPage(bucket.page)} drew ${Math.round(metricValue)} ` +
        `${config.metric} in the last ${config.lookbackDays} days, ranking best for ` +
        `"${bucket.topQuery}" at position ${bucket.topPosition.toFixed(1)}`,
    };
  });
}

/** Candidates an automation may actually write, in the order it would take them. */
export function eligibleCandidates(candidates: GscCandidate[]): GscCandidate[] {
  return candidates.filter(
    (candidate) => !candidate.covered && !candidate.belowThreshold && !candidate.duplicate
  );
}

function toChoices(candidates: GscCandidate[], count: number): KeywordChoice[] {
  return candidates.slice(0, Math.max(0, count)).map((candidate) => ({
    keyword: candidate.keyword,
    reason: candidate.reason,
  }));
}

/** Highest-traffic queries that clear the threshold and have no article yet, best first. */
export function rankGscCandidates(
  rows: QueryRow[],
  config: AutomationGscConfig,
  covered: Set<string>,
  count: number
): KeywordChoice[] {
  return toChoices(eligibleCandidates(collectQueryCandidates(rows, config, covered)), count);
}

/** The same, ranked by landing page instead of by term. */
export function rankGscPageCandidates(
  rows: PageQueryRow[],
  config: AutomationGscConfig,
  covered: Set<string>,
  count: number
): KeywordChoice[] {
  return toChoices(eligibleCandidates(collectPageCandidates(rows, config, covered)), count);
}
