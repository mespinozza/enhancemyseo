/**
 * Every active product in a store, with just the fields smart collection rules test:
 * title, vendor, type, tags and price. Read with a bulk operation, because paging a
 * 20,000-product store 250 at a time would take minutes and most of the query budget.
 */

const API_VERSION = '2025-01';
const CATALOG_TTL_MS = 30 * 60 * 1000;
const POLL_MS = 1500;
const MAX_WAIT_MS = 150_000;

export interface CatalogProduct {
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  /** Lowest variant price, in the store's currency. */
  price: number;
  image: string | null;
}

async function graphql<T>(shopDomain: string, token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: T; errors?: unknown };
  if (!response.ok || !payload.data || payload.errors) {
    throw new Error(`Shopify ${response.status}: ${JSON.stringify(payload.errors ?? '').slice(0, 200)}`);
  }
  return payload.data;
}

const BULK_QUERY = `{
  products(query: "status:active") {
    edges { node { title handle vendor productType tags featuredImage { url } priceRangeV2 { minVariantPrice { amount } } } }
  }
}`;

type BulkStatus = { id: string; status: string; url: string | null; errorCode: string | null };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runBulk(shopDomain: string, token: string): Promise<string | null> {
  // Only one bulk query can run per app and store, so an earlier one is waited out.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const started = await graphql<{
      bulkOperationRunQuery: { bulkOperation: { id: string } | null; userErrors: { message: string }[] };
    }>(shopDomain, token, `mutation($q: String!) { bulkOperationRunQuery(query: $q) { bulkOperation { id } userErrors { message } } }`, {
      q: BULK_QUERY,
    });
    const id = started.bulkOperationRunQuery.bulkOperation?.id;
    if (id) return poll(shopDomain, token, id);
    const reason = started.bulkOperationRunQuery.userErrors.map((e) => e.message).join('; ');
    if (!/already in progress/i.test(reason) || attempt > 0) throw new Error(`Shopify would not read the catalogue: ${reason}`);
    const current = await graphql<{ currentBulkOperation: BulkStatus | null }>(
      shopDomain,
      token,
      '{ currentBulkOperation { id status url errorCode } }',
    );
    if (current.currentBulkOperation) await poll(shopDomain, token, current.currentBulkOperation.id).catch(() => null);
  }
  return null;
}

async function poll(shopDomain: string, token: string, id: string): Promise<string | null> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const { node } = await graphql<{ node: BulkStatus | null }>(
      shopDomain,
      token,
      'query($id: ID!) { node(id: $id) { ... on BulkOperation { id status url errorCode } } }',
      { id },
    );
    if (node?.status === 'COMPLETED') return node.url;
    if (node && ['FAILED', 'CANCELED', 'EXPIRED'].includes(node.status)) {
      throw new Error(`Shopify could not read the catalogue (${node.errorCode ?? node.status})`);
    }
    await sleep(POLL_MS);
  }
  throw new Error('Shopify took too long to read the catalogue. Try again in a minute.');
}

async function download(url: string | null): Promise<CatalogProduct[]> {
  // A store with no active products finishes with no file at all.
  if (!url) return [];
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download the catalogue (${response.status})`);
  const products: CatalogProduct[] = [];
  for (const line of (await response.text()).split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {
      title: string;
      handle: string;
      vendor?: string;
      productType?: string;
      tags?: string[];
      featuredImage?: { url: string } | null;
      priceRangeV2?: { minVariantPrice?: { amount?: string } };
    };
    products.push({
      title: row.title,
      handle: row.handle,
      vendor: row.vendor ?? '',
      productType: row.productType ?? '',
      tags: row.tags ?? [],
      price: Number(row.priceRangeV2?.minVariantPrice?.amount ?? 0) || 0,
      image: row.featuredImage?.url ?? null,
    });
  }
  return products;
}

const cache = new Map<string, { at: number; products: Promise<CatalogProduct[]> }>();

/** The whole catalogue, shared by concurrent callers and reused for half an hour. */
export function fetchCatalog(shopDomain: string, token: string, fresh = false): Promise<CatalogProduct[]> {
  const cached = cache.get(shopDomain);
  if (!fresh && cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.products;
  const products = runBulk(shopDomain, token).then(download);
  cache.set(shopDomain, { at: Date.now(), products });
  products.catch(() => cache.delete(shopDomain));
  return products;
}
