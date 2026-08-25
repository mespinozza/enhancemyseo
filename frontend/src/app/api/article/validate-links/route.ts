import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';

initializeFirebaseAdmin();

/**
 * Checks that the product/collection/page handles linked inside an article still
 * resolve in the store. Generated articles link by handle with no stored resource
 * ID, so a renamed or deleted resource is otherwise invisible until a reader
 * hits a 404.
 */

const MAX_HANDLES = 60;
const SAFE_HANDLE = /^[a-zA-Z0-9._~%-]+$/;

type Kind = 'product' | 'collection' | 'page';

interface RequestBody {
  shopifyStoreUrl?: string;
  shopifyAccessToken?: string;
  links?: Array<{ kind?: string; handle?: string }>;
}

interface ResolvedResource {
  handle: string;
  kind: Kind;
  exists: boolean;
  title?: string;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      const verified = await getAuth().verifyIdToken(authHeader.split('Bearer ')[1]);
      if (!verified.uid) throw new Error('Invalid token');
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = (await request.json()) as RequestBody;
    const { shopifyStoreUrl, shopifyAccessToken } = body;

    if (!shopifyStoreUrl || !shopifyAccessToken) {
      return NextResponse.json(
        { error: 'This article\u2019s brand has no Shopify connection configured.' },
        { status: 400 },
      );
    }

    const requested = (body.links ?? [])
      .map((link) => ({ kind: link.kind as Kind, handle: (link.handle ?? '').trim() }))
      .filter((link) => link.handle && SAFE_HANDLE.test(link.handle))
      .filter((link) => link.kind === 'product' || link.kind === 'collection' || link.kind === 'page');

    const unique = new Map<string, { kind: Kind; handle: string }>();
    for (const link of requested) {
      unique.set(`${link.kind}:${link.handle}`, link);
    }
    const targets = Array.from(unique.values()).slice(0, MAX_HANDLES);

    if (targets.length === 0) {
      return NextResponse.json({ resources: [] });
    }

    const shopDomain = shopifyStoreUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const needsPages = targets.some((target) => target.kind === 'page');

    // Aliased sub-queries let every handle resolve in a single round trip.
    const fragments = targets
      .filter((target) => target.kind !== 'page')
      .map((target, index) => {
        const root = target.kind === 'product' ? 'products' : 'collections';
        return `k${index}: ${root}(first: 1, query: "handle:${target.handle}") { edges { node { handle title } } }`;
      });

    if (needsPages) {
      fragments.push('pageList: pages(first: 250) { edges { node { handle title } } }');
    }

    const response = await fetch(`https://${shopDomain}/admin/api/2023-10/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: `query { ${fragments.join('\n')} }` }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error(`Shopify link validation failed (${response.status}):`, detail);
      return NextResponse.json({ error: 'Could not reach Shopify to verify links.' }, { status: 502 });
    }

    const payload = await response.json();
    if (payload.errors) {
      console.error('Shopify link validation GraphQL errors:', payload.errors);
      return NextResponse.json({ error: 'Shopify rejected the link verification query.' }, { status: 502 });
    }

    const data = payload.data ?? {};
    const pageHandles = new Map<string, string>();
    if (needsPages && data.pageList?.edges) {
      for (const edge of data.pageList.edges) {
        pageHandles.set(edge.node.handle, edge.node.title);
      }
    }

    const resources: ResolvedResource[] = [];
    let cursor = 0;
    for (const target of targets) {
      if (target.kind === 'page') {
        const title = pageHandles.get(target.handle);
        resources.push({ ...target, exists: title !== undefined, title });
        continue;
      }

      const node = data[`k${cursor++}`]?.edges?.[0]?.node;
      const matches = node?.handle === target.handle;
      resources.push({ ...target, exists: Boolean(matches), title: matches ? node.title : undefined });
    }

    return NextResponse.json({ resources });
  } catch (error) {
    console.error('Error validating article links:', error);
    return NextResponse.json({ error: 'Failed to validate links' }, { status: 500 });
  }
}
