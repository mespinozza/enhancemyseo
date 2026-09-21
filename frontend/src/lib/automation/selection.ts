/**
 * Deciding what to write about, as pure functions.
 *
 * Kept out of the runner so the interesting logic — list rotation and the ranking and
 * de-duplication of Search Console queries — can be tested without Firebase, Google, or
 * a network. The runner supplies the data and applies the results.
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

/**
 * Highest-traffic queries that clear the threshold and have no article yet, best first.
 *
 * `covered` holds keywords already written for the brand, lowercased. Without that check
 * a traffic-driven automation would rewrite its single best query every time it ran,
 * since that query stays top of the list.
 */
export function rankGscCandidates(
  rows: QueryRow[],
  config: AutomationGscConfig,
  covered: Set<string>,
  count: number
): KeywordChoice[] {
  return rows
    .filter((row) => Boolean(row.query?.trim()))
    .filter((row) => metricOf(row, config.metric) >= config.minMetric)
    .filter((row) => !covered.has(row.query.trim().toLowerCase()))
    .sort((a, b) => metricOf(b, config.metric) - metricOf(a, config.metric))
    .slice(0, Math.max(0, count))
    .map((row) => ({
      keyword: row.query,
      reason:
        `Search Console: ${Math.round(metricOf(row, config.metric))} ${config.metric} ` +
        `in the last ${config.lookbackDays} days, average position ${row.position.toFixed(1)}`,
    }));
}
