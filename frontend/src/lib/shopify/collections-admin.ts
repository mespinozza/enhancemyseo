/**
 * Reading and writing a store's collections: what exists (with smart collection rules, so
 * new ideas can be checked against them), and creating, publishing and removing new ones.
 */
import type { CollectionRule } from '@/lib/collections/types';

const API_VERSION = '2025-01';

/** Creating a collection needs write_products; showing it on the storefront needs write_publications. */
export const COLLECTION_SCOPES = ['write_products', 'write_publications'];

async function graphql<T>(shopDomain: string, token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`https://${shopDomain}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: T; errors?: { message?: string }[] | string };
  if (!response.ok || !payload.data || payload.errors) {
    const detail = Array.isArray(payload.errors) ? payload.errors.map((e) => e.message).join('; ') : String(payload.errors ?? '');
    throw new Error(`Shopify ${response.status}: ${detail.slice(0, 200)}`);
  }
  return payload.data;
}

export async function grantedScopes(shopDomain: string, token: string): Promise<string[]> {
  const data = await graphql<{ currentAppInstallation: { accessScopes: { handle: string }[] } }>(
    shopDomain,
    token,
    '{ currentAppInstallation { accessScopes { handle } } }',
  );
  return data.currentAppInstallation.accessScopes.map((s) => s.handle);
}

/** Required scopes the token lacks. A write scope implies its read scope, not the reverse. */
export function missingScopes(granted: string[], required = COLLECTION_SCOPES): string[] {
  const have = new Set(granted);
  return required.filter((scope) => !have.has(scope));
}

export interface ExistingCollection {
  title: string;
  handle: string;
  rules: CollectionRule[] | null;
  disjunctive: boolean;
}

export async function existingCollections(shopDomain: string, token: string): Promise<ExistingCollection[]> {
  type Node = {
    title: string;
    handle: string;
    ruleSet: { appliedDisjunctively: boolean; rules: { column: string; relation: string; condition: string }[] } | null;
  };
  const items: ExistingCollection[] = [];
  let after: string | null = null;
  for (let page = 0; page < 8; page += 1) {
    const data: { collections: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Node[] } } = await graphql(
      shopDomain,
      token,
      `query($after: String) { collections(first: 250, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { title handle ruleSet { appliedDisjunctively rules { column relation condition } } }
      } }`,
      { after },
    );
    for (const node of data.collections.nodes) {
      items.push({
        title: node.title,
        handle: node.handle,
        rules: node.ruleSet ? (node.ruleSet.rules as CollectionRule[]) : null,
        disjunctive: node.ruleSet?.appliedDisjunctively ?? false,
      });
    }
    if (!data.collections.pageInfo.hasNextPage) break;
    after = data.collections.pageInfo.endCursor;
  }
  return items;
}

const publicationCache = new Map<string, string | null>();

/** The Online Store sales channel, which is what makes a collection page visible. */
async function onlineStorePublication(shopDomain: string, token: string): Promise<string | null> {
  if (publicationCache.has(shopDomain)) return publicationCache.get(shopDomain) ?? null;
  const data = await graphql<{ publications: { nodes: { id: string; name: string }[] } }>(
    shopDomain,
    token,
    '{ publications(first: 25) { nodes { id name } } }',
  );
  const id = data.publications.nodes.find((p) => /online store/i.test(p.name))?.id ?? null;
  publicationCache.set(shopDomain, id);
  return id;
}

export interface NewCollection {
  title: string;
  handle: string;
  descriptionHtml: string;
  seoTitle: string;
  seoDescription: string;
  rules: CollectionRule[];
  disjunctive: boolean;
}

/** Creates a smart collection and publishes it to the Online Store. */
export async function createSmartCollection(
  shopDomain: string,
  token: string,
  input: NewCollection,
): Promise<{ id: string; handle: string; published: boolean }> {
  const data = await graphql<{
    collectionCreate: { collection: { id: string; handle: string } | null; userErrors: { message: string }[] };
  }>(
    shopDomain,
    token,
    `mutation($input: CollectionInput!) { collectionCreate(input: $input) { collection { id handle } userErrors { message } } }`,
    {
      input: {
        title: input.title,
        handle: input.handle,
        descriptionHtml: input.descriptionHtml,
        seo: { title: input.seoTitle, description: input.seoDescription },
        sortOrder: 'BEST_SELLING',
        ruleSet: { appliedDisjunctively: input.disjunctive, rules: input.rules },
      },
    },
  );
  const created = data.collectionCreate.collection;
  if (!created) throw new Error(data.collectionCreate.userErrors.map((e) => e.message).join('; ') || 'Shopify did not create it');

  const publicationId = await onlineStorePublication(shopDomain, token).catch(() => null);
  let published = false;
  if (publicationId) {
    const result = await graphql<{ publishablePublish: { userErrors: { message: string }[] } }>(
      shopDomain,
      token,
      `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { message } } }`,
      { id: created.id, input: [{ publicationId }] },
    ).catch(() => null);
    published = Boolean(result && !result.publishablePublish.userErrors.length);
  }
  return { ...created, published };
}

export async function deleteCollection(shopDomain: string, token: string, id: string): Promise<void> {
  const data = await graphql<{ collectionDelete: { userErrors: { message: string }[] } }>(
    shopDomain,
    token,
    'mutation($id: ID!) { collectionDelete(input: { id: $id }) { userErrors { message } } }',
    { id },
  );
  const errors = data.collectionDelete.userErrors;
  // Already deleted in Shopify counts as removed.
  if (errors.length && !errors.some((e) => /not exist|not found/i.test(e.message))) {
    throw new Error(errors.map((e) => e.message).join('; '));
  }
}
