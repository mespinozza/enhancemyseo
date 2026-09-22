/**
 * Recognising Firestore's daily free-tier limit.
 *
 * When a project exhausts its allowance, every read and write fails with a gRPC
 * RESOURCE_EXHAUSTED error. Its raw text ("8 RESOURCE_EXHAUSTED: Quota exceeded.")
 * surfaces through whichever feature happened to make the call, so it reads as a bug in
 * Shopify or Search Console rather than a project-wide stop with a known end time.
 */

export const QUOTA_EXHAUSTED_MESSAGE =
  'The database has hit its daily limit, so nothing can be loaded or saved until it ' +
  'resets at midnight Pacific. This affects the whole app, not just this page.';

export function isQuotaExhausted(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  // The Admin SDK reports the gRPC status as a number, the browser SDK as its name.
  const code = (error as { code?: unknown }).code;
  if (code === 8 || code === 'resource-exhausted') return true;

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('RESOURCE_EXHAUSTED');
}
