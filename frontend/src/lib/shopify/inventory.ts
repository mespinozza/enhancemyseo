/**
 * What a store already has, for planning keywords around it: products (with vendors and
 * types), collections, pages and blog articles. Each part is fetched on its own, so a
 * store that refuses one (missing scope, old API) still yields the rest.
 */

const API_VERSION = '2025-01';
const MAX_PRODUCTS = 750;

export interface StoreInventory {
  /** Every active product in the store; `products` holds only the first MAX_PRODUCTS. */
  totalProducts: number;
  products: { title: string; vendor: string; productType: string; tags: string[] }[];
  collections: { title: string; handle: string; products: number }[];
  pages: { title: string; handle: string }[];
  articles: { title: string; handle: string; blog: string; blogHandle: string }[];
  vendors: { name: string; products: number }[];
  productTypes: { name: string; products: number }[];
  /** Parts Shopify would not return, for telling the user. */
  missing: string[];
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

type Page<N> = { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: N[] };

async function paged<N>(
  shopDomain: string,
  token: string,
  field: string,
  selection: string,
  max: number,
  args = '',
): Promise<N[]> {
  const items: N[] = [];
  let after: string | null = null;
  while (items.length < max) {
    const data: Record<string, Page<N>> = await graphql(
      shopDomain,
      token,
      `query($after: String) { ${field}(first: 250, after: $after${args}) { pageInfo { hasNextPage endCursor } nodes { ${selection} } } }`,
      { after },
    );
    const page: Page<N> = data[field];
    items.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
  }
  return items.slice(0, max);
}

function tally(values: string[]): { name: string; products: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    const name = value.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts, ([name, products]) => ({ name, products })).sort((a, b) => b.products - a.products);
}

/**
 * Every vendor or product type with its true product count. The product sample is capped,
 * so counting from it would miss whole vendors on a large store.
 */
async function facetCounts(shopDomain: string, token: string, facet: 'productVendors' | 'productTypes'): Promise<{ name: string; products: number }[]> {
  const data = await graphql<Record<string, { nodes: string[] }>>(shopDomain, token, `{ ${facet}(first: 250) { nodes } }`);
  const names = data[facet].nodes.filter((name) => name.trim());
  const field = facet === 'productVendors' ? 'vendor' : 'product_type';
  const counted: { name: string; products: number }[] = [];
  // Each count costs 10 query points; 40 per request stays well inside Shopify's budget.
  for (let start = 0; start < names.length; start += 40) {
    const batch = names.slice(start, start + 40);
    const fields = batch
      .map((name, i) => `c${i}: productsCount(query: ${JSON.stringify(`${field}:"${name.replace(/["\\]/g, '\\$&')}" status:active`)}, limit: null) { count }`)
      .join(' ');
    const counts = await graphql<Record<string, { count: number }>>(shopDomain, token, `{ ${fields} }`);
    batch.forEach((name, i) => counted.push({ name, products: counts[`c${i}`]?.count ?? 0 }));
  }
  return counted.filter((c) => c.products > 0).sort((a, b) => b.products - a.products);
}

export async function fetchStoreInventory(shopDomain: string, token: string): Promise<StoreInventory> {
  const missing: string[] = [];
  const attempt = async <T,>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      console.warn(`[inventory] ${label} unavailable:`, error instanceof Error ? error.message : error);
      missing.push(label);
      return fallback;
    }
  };

  const [products, collections, pages, articles, totalProducts, vendors, productTypes] = await Promise.all([
    attempt(
      'products',
      () =>
        paged<{ title: string; vendor: string; productType: string; tags: string[] }>(
          shopDomain,
          token,
          'products',
          'title vendor productType tags',
          MAX_PRODUCTS,
          ', query: "status:active"',
        ),
      [],
    ),
    attempt(
      'collections',
      async () =>
        (
          await paged<{ title: string; handle: string; productsCount?: { count: number } }>(
            shopDomain,
            token,
            'collections',
            'title handle productsCount { count }',
            500,
          )
        ).map((c) => ({ title: c.title, handle: c.handle, products: c.productsCount?.count ?? 0 })),
      [],
    ),
    attempt('pages', () => paged<{ title: string; handle: string }>(shopDomain, token, 'pages', 'title handle', 250), []),
    attempt(
      'blog articles',
      async () =>
        (
          await paged<{ title: string; handle: string; blog?: { title: string; handle: string } }>(
            shopDomain,
            token,
            'articles',
            'title handle blog { title handle }',
            1000,
          )
        ).map((a) => ({ title: a.title, handle: a.handle, blog: a.blog?.title ?? '', blogHandle: a.blog?.handle ?? '' })),
      [],
    ),
    graphql<{ productsCount: { count: number } }>(shopDomain, token, '{ productsCount(query: "status:active", limit: null) { count } }')
      .then((data) => data.productsCount.count)
      .catch(() => null),
    facetCounts(shopDomain, token, 'productVendors').catch(() => null),
    facetCounts(shopDomain, token, 'productTypes').catch(() => null),
  ]);

  return {
    totalProducts: totalProducts ?? products.length,
    products,
    collections,
    pages,
    articles,
    // Older API versions lack the facet queries; the sample is the fallback.
    vendors: vendors ?? tally(products.map((p) => p.vendor)),
    productTypes: productTypes ?? tally(products.map((p) => p.productType)),
    missing,
  };
}
