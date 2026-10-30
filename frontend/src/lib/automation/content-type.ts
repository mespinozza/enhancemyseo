/**
 * Choosing a content type for each automated article from the ones the user allowed.
 *
 * Variety is the point (different formats reach different searches), but not at the
 * cost of fit: "how to clean an ice machine" should be a How To whenever that is
 * allowed, and a keyword naming no two sides cannot be a Versus. Within what fits, the
 * pick is random and avoids the types used most recently.
 */
import { CONTENT_BLUEPRINTS, comparisonSubjects } from '@/lib/article/enhanced/blueprints';

/** How many recent picks are remembered, to keep the next ones varied. */
export const RECENT_CONTENT_TYPES = 4;

const KNOWN = new Set(CONTENT_BLUEPRINTS.map((b) => b.value));

/**
 * The content types a keyword asks for, best first, from how it is phrased. Empty
 * when the keyword could be written any number of ways.
 */
export function keywordContentTypes(keyword: string): string[] {
  const k = keyword.toLowerCase().trim();
  if (/\b(vs\.?|versus)\b/.test(k)) return comparisonSubjects(keyword) ? ['versus', 'comparisons'] : ['comparisons'];
  if (/^(how (to|do|can|should)|steps? to|ways to|diy)\b/.test(k)) return ['how-to'];
  if (/\b(history|evolution|origins?|invented)\b/.test(k)) return ['history'];
  if (/\b(pros and cons|advantages|disadvantages|worth it|benefits and drawbacks)\b/.test(k)) return ['pros-cons'];
  if (/\breviews?\b/.test(k)) return ['product-reviews'];
  if (/^(top \d+|\d+ )|\b(best|top)\b/.test(k)) return ['listicle', 'product-reviews', 'comparisons'];
  if (/\b(compare|comparison|alternatives?|differences? between)\b/.test(k)) return ['comparisons'];
  if (/^(what|why|when|which|who|is|are|does|do|can)\b/.test(k)) return ['informational'];
  return [];
}

/** Whether a content type can be written well for this keyword at all. */
export function fitsKeyword(contentType: string, keyword: string): boolean {
  const asked = keywordContentTypes(keyword);
  switch (contentType) {
    // Needs two named sides; without them the writer would have to guess what to compare.
    case 'versus':
      return comparisonSubjects(keyword) !== null;
    // A buying or task keyword does not have a history worth telling.
    case 'history':
      return asked.length === 0 || asked.includes('history');
    // A versus keyword is about two specific options, not a list.
    case 'listicle':
      return !asked.includes('versus');
    default:
      return true;
  }
}

/**
 * The content type for one article. `allowed` is what the automation lets it use;
 * `recent` is the latest picks, newest first. `random` is injectable for tests.
 */
export function pickContentType(
  keyword: string,
  allowed: string[],
  recent: string[] = [],
  random: () => number = Math.random
): string {
  const pool = [...new Set(allowed.filter((type) => KNOWN.has(type)))];
  if (pool.length === 0) return 'default';
  if (pool.length === 1) return pool[0];

  // What the keyword asks for wins; when it asks for several ("best ..."), any of them.
  const asked = keywordContentTypes(keyword).filter((type) => pool.includes(type));
  const fitting = pool.filter((type) => fitsKeyword(type, keyword));
  const candidates = asked.length
    ? asked
    : fitting.length
      ? fitting
      : pool.includes('default')
        ? ['default']
        : pool;

  // Least recently used first: a type not used lately beats one used last run.
  const age = (type: string) => {
    const index = recent.indexOf(type);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };
  const oldest = Math.max(...candidates.map(age));
  const freshest = candidates.filter((type) => age(type) === oldest);
  return freshest[Math.min(freshest.length - 1, Math.floor(random() * freshest.length))];
}

/** The automation's allowed types: the list when it has one, else its single type. */
export function allowedContentTypes(automation: { contentTypes?: string[]; contentType?: string }): string[] {
  const list = (automation.contentTypes ?? []).filter((type) => KNOWN.has(type));
  if (list.length) return list;
  return automation.contentType ? [automation.contentType] : ['default'];
}
