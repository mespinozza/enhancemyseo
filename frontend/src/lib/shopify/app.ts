/**
 * Which Shopify app a brand connects through.
 *
 * Shopify limits a custom-distribution app to a single store, so serving more than one
 * merchant means more than one app. A brand profile names the app by its client ID,
 * which is public and appears in the install URL anyway; the matching secret is resolved
 * here, server-side, and never leaves it.
 *
 * Secrets live in the environment rather than alongside the client ID on the brand
 * profile, because the browser reads brand profiles. A client secret mints access tokens
 * for every store that installed the app and forges callback signatures, so putting one
 * on a profile would publish it.
 *
 * Adding a merchant:
 *   1. Create a custom-distribution app bound to their store in the Dev Dashboard.
 *   2. Add `"<clientId>": "<secret>"` to SHOPIFY_APP_SECRETS.
 *   3. Put the client ID on their brand profile.
 *
 * A brand with no client ID uses SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET, so brands
 * connected before any of this keep working untouched.
 */
export interface ShopifyApp {
  clientId: string;
  clientSecret: string;
}

export class ShopifyAppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopifyAppError';
  }
}

/** SHOPIFY_APP_SECRETS, a JSON object of client ID to client secret. */
function secretsFromEnv(): Record<string, string> {
  const raw = process.env.SHOPIFY_APP_SECRETS;
  if (!raw?.trim()) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entries = Object.entries(parsed).filter(
      ([clientId, secret]) => clientId && typeof secret === 'string' && secret.length > 0
    );
    return Object.fromEntries(entries) as Record<string, string>;
  } catch {
    // Deliberately not thrown: a malformed variable must not take down the default app
    // along with itself, and the error names the variable rather than showing its value.
    console.error('[shopify] SHOPIFY_APP_SECRETS is not valid JSON, so it was ignored');
    return {};
  }
}

/** The app used by brands that do not name one. */
export function defaultShopifyApp(): ShopifyApp | null {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Every app this deployment holds a secret for. */
export function knownShopifyApps(): ShopifyApp[] {
  const apps = new Map<string, ShopifyApp>();

  const fallback = defaultShopifyApp();
  if (fallback) apps.set(fallback.clientId, fallback);

  for (const [clientId, clientSecret] of Object.entries(secretsFromEnv())) {
    apps.set(clientId, { clientId, clientSecret });
  }

  return [...apps.values()];
}

/** Whether this deployment can run the OAuth flow at all. */
export function isShopifyAppConfigured(): boolean {
  return knownShopifyApps().length > 0;
}

/**
 * The app a brand connects through.
 *
 * @param clientId From the brand profile. Omitted means the default app.
 * @throws ShopifyAppError when the deployment holds no secret for it, which is a
 * configuration mistake with a specific fix rather than something to fail vaguely on.
 */
export function shopifyAppFor(clientId?: string | null): ShopifyApp {
  const wanted = clientId?.trim();

  if (!wanted) {
    const fallback = defaultShopifyApp();
    if (!fallback) {
      throw new ShopifyAppError('The Shopify app is not configured on this deployment yet');
    }
    return fallback;
  }

  const app = knownShopifyApps().find((candidate) => candidate.clientId === wanted);
  if (!app) {
    throw new ShopifyAppError(
      `No client secret is configured for Shopify app ${wanted}. ` +
        'Add it to SHOPIFY_APP_SECRETS on this deployment.'
    );
  }

  return app;
}
