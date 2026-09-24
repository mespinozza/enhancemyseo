/**
 * The Anthropic model every route writes with.
 *
 * Anthropic retires dated snapshots, and a retired name fails as a 404 at request time
 * rather than at build or deploy time — the app keeps shipping and simply stops being
 * able to write. That is how article generation broke while the rest of the app, which
 * had already moved off the old pins, kept working. Naming the model in one place makes
 * the next retirement a one-line change instead of a hunt through call sites.
 */
export const CLAUDE_MODEL = 'claude-sonnet-5';
