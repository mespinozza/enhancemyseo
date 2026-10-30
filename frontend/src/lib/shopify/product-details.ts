/**
 * The product details an article writer needs to choose well: what a product is, who
 * makes it, and whether it can be bought. Search results carry only titles, so these
 * are fetched for the final shortlist in one request.
 */

export interface ProductDetails {
  vendor?: string;
  productType?: string;
  description?: string;
  /** Any variant available for sale; that covers untracked inventory and overselling. */
  inStock: boolean;
}

const DETAILS_QUERY = `
  query productDetails($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        vendor
        productType
        description(truncateAt: 220)
        variants(first: 20) { edges { node { availableForSale } } }
      }
    }
  }
`;

interface DetailsNode {
  id?: string;
  vendor?: string;
  productType?: string;
  description?: string;
  variants?: { edges?: { node?: { availableForSale?: boolean } }[] };
}

/**
 * Keyed by product GID. Returns an empty map on any failure: details make the choice
 * better, and an article is still worth writing without them.
 */
export async function fetchProductDetails(
  shopDomain: string,
  accessToken: string,
  ids: string[]
): Promise<Map<string, ProductDetails>> {
  const details = new Map<string, ProductDetails>();
  const gids = [...new Set(ids.filter((id) => id.startsWith('gid://shopify/Product/')))].slice(0, 50);
  if (!gids.length) return details;

  try {
    const response = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: DETAILS_QUERY, variables: { ids: gids } }),
    });
    if (!response.ok) return details;
    const payload = (await response.json()) as { data?: { nodes?: (DetailsNode | null)[] } };
    for (const node of payload.data?.nodes ?? []) {
      if (!node?.id) continue;
      const variants = node.variants?.edges ?? [];
      details.set(node.id, {
        vendor: node.vendor || undefined,
        productType: node.productType || undefined,
        description:
          node.description?.replace(/\s+/g, ' ').replace(/\bProduct Description:?\s*/i, '').trim() || undefined,
        inStock: variants.some((edge) => edge.node?.availableForSale === true),
      });
    }
  } catch (error) {
    console.warn('Product details lookup failed:', error instanceof Error ? error.message : error);
  }
  return details;
}
