/**
 * Blog dates come back from Firestore as Timestamps, not Dates.
 *
 * `new Date(timestamp)` produces an Invalid Date rather than throwing, so the pages
 * that did that showed "Invalid Date" in the CMS and, worse, fell back to the current
 * date in the article JSON-LD — telling search engines every post was published today.
 *
 * Accepts anything the field has ever held: a Timestamp, a Date, the plain
 * `{ seconds, nanoseconds }` shape a Timestamp serialises to, or a parseable
 * string/number. Returns null when there is no usable date, so callers decide what to
 * show rather than being handed a silently wrong one.
 */
export function toDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'object') {
    const candidate = value as { toDate?: () => Date; seconds?: number };
    if (typeof candidate.toDate === 'function') {
      const date = candidate.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    if (typeof candidate.seconds === 'number') {
      return new Date(candidate.seconds * 1000);
    }
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

/** Formatted date, or `fallback` when the value is missing or unusable. */
export function formatDate(
  value: unknown,
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
  fallback = 'Unknown'
): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString('en-US', options) : fallback;
}
