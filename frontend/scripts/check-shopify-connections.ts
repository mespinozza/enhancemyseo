/**
 * Health check for every brand's Shopify connection.
 *
 * "Connected" in the UI only means a token was stored at some point. This proves the
 * link end to end instead: it calls Shopify with the stored token and reports what came
 * back, which is the only thing that distinguishes a working connection from one that
 * was revoked, uninstalled, or pointed at the wrong store.
 *
 * Read-only. The only Shopify calls are a shop lookup and a blog listing, both GETs.
 *
 *   npm run check:shopify
 */
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const API_VERSION = '2024-01';

interface Row {
  brand: string;
  brandId: string;
  storeUrl: string | null;
  clientId: string;
  secretConfigured: boolean;
  connection: 'none' | 'oauth';
  connectionStore: string | null;
  scope: string | null;
  legacyToken: boolean;
  verdict: string;
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
}

/** SHOPIFY_APP_SECRETS, the same shape the app reads. */
function configuredClientIds(): Set<string> {
  const ids = new Set<string>();
  if (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET) {
    ids.add(process.env.SHOPIFY_CLIENT_ID);
  }
  try {
    const parsed = JSON.parse(process.env.SHOPIFY_APP_SECRETS || '{}') as Record<string, string>;
    for (const [id, secret] of Object.entries(parsed)) {
      if (secret) ids.add(id);
    }
  } catch {
    console.log('  ! SHOPIFY_APP_SECRETS is not valid JSON, so it was ignored\n');
  }
  return ids;
}

/** Asks Shopify who the token belongs to and whether it can reach the blog. */
async function probe(
  shopDomain: string,
  token: string
): Promise<{ ok: boolean; detail: string }> {
  const shopResponse = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/shop.json`, {
    headers: { 'X-Shopify-Access-Token': token },
  });

  if (shopResponse.status === 401 || shopResponse.status === 403) {
    return {
      ok: false,
      detail: `Shopify rejected the token (${shopResponse.status}). The app was probably uninstalled or the token revoked — reconnect.`,
    };
  }
  if (!shopResponse.ok) {
    return { ok: false, detail: `shop.json returned ${shopResponse.status}` };
  }

  const shop = (await shopResponse.json()) as { shop?: { name?: string; myshopify_domain?: string } };

  // write_content is the scope articles are pushed with, so the blog listing is the
  // call that actually matters. A token can be valid and still lack it.
  const blogResponse = await fetch(
    `https://${shopDomain}/admin/api/${API_VERSION}/blogs.json?limit=1`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );

  if (!blogResponse.ok) {
    return {
      ok: false,
      detail: `reached "${shop.shop?.name}" but blogs.json returned ${blogResponse.status}, so articles cannot be pushed`,
    };
  }

  const blogs = (await blogResponse.json()) as { blogs?: unknown[] };
  return {
    ok: true,
    detail: `reached "${shop.shop?.name}", ${blogs.blogs?.length ? 'blog access confirmed' : 'blog access confirmed (no blogs yet)'}`,
  };
}

async function main() {
  process.loadEnvFile('.env');

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  const db = getFirestore();

  const knownIds = configuredClientIds();
  console.log(
    `Apps this environment holds a secret for: ${knownIds.size ? [...knownIds].join(', ') : 'none'}\n`
  );

  const brands = await db.collection('brandProfiles').get();
  const rows: Row[] = [];

  for (const doc of brands.docs) {
    const brand = doc.data();
    if (!brand.shopifyStoreUrl) continue;

    const storeUrl = normalize(brand.shopifyStoreUrl);
    const clientId = (brand.shopifyClientId as string | undefined)?.trim() || '';
    const effectiveId = clientId || process.env.SHOPIFY_CLIENT_ID || '';
    const connectionDoc = await db.collection('shopifyConnections').doc(doc.id).get();
    const connection = connectionDoc.exists ? connectionDoc.data() : null;

    const row: Row = {
      brand: brand.brandName,
      brandId: doc.id,
      storeUrl,
      clientId: clientId || '(default)',
      secretConfigured: knownIds.has(effectiveId),
      connection: connection ? 'oauth' : 'none',
      connectionStore: connection?.shopDomain ?? null,
      scope: connection?.scope ?? null,
      legacyToken: Boolean((brand.shopifyAccessToken as string | undefined)?.trim()),
      verdict: '',
    };

    if (!row.secretConfigured) {
      row.verdict = clientId
        ? `no secret for ${clientId} in SHOPIFY_APP_SECRETS, so connecting will fail`
        : 'no default app configured in this environment';
    } else if (!connection) {
      row.verdict = 'never connected — use Connect Shopify on the brand profile';
    } else if (connection.shopDomain !== storeUrl) {
      row.verdict = `connected to ${connection.shopDomain} but the profile says ${storeUrl}; the connection wins, so one of them is wrong`;
    } else if (!String(connection.scope || '').includes('write_content')) {
      row.verdict = `granted only "${connection.scope}" — articles need write_content, so reconnect`;
    } else {
      const result = await probe(connection.shopDomain, connection.accessToken);
      row.verdict = result.ok ? `working: ${result.detail}` : `BROKEN: ${result.detail}`;
    }

    rows.push(row);
  }

  for (const row of rows) {
    const healthy = row.verdict.startsWith('working');
    console.log(`${healthy ? 'OK  ' : '--  '} ${row.brand}`);
    console.log(`       store        ${row.storeUrl}`);
    console.log(`       app          ${row.clientId}${row.secretConfigured ? '' : '  (no secret here)'}`);
    console.log(
      `       connection   ${row.connection}${row.scope ? ` · ${row.scope}` : ''}${
        row.legacyToken ? ' · a legacy token is also saved and ignored' : ''
      }`
    );
    console.log(`       ${row.verdict}\n`);
  }

  const broken = rows.filter((row) => !row.verdict.startsWith('working'));
  console.log(
    broken.length === 0
      ? `All ${rows.length} store(s) reachable.`
      : `${broken.length} of ${rows.length} store(s) need attention.`
  );
  process.exit(0);
}

void main();
