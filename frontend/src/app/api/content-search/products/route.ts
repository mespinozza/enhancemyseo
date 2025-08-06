import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

interface VariantEdge {
  node: {
    id: string;
    price: string;
  };
}

interface ProductEdge {
  node: {
    id: string;
    title: string;
    handle: string;
    vendor: string;
    variants: {
      edges: VariantEdge[];
    };
  };
}

export async function POST(request: NextRequest) {
  try {
    // Authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let verifiedUser;
    
    try {
      verifiedUser = await getAuth().verifyIdToken(idToken);
      if (!verifiedUser.uid) {
        throw new Error('Invalid token');
      }
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { shopifyStoreUrl, shopifyAccessToken, searchTerm, cursor } = body;

    if (!shopifyStoreUrl || !shopifyAccessToken || !searchTerm) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const shopDomain = shopifyStoreUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // GraphQL query for product search with pagination
    const graphqlQuery = `
      query searchProducts($query: String!, $first: Int!, $after: String) {
        products(first: $first, query: $query, after: $after) {
          edges {
            node {
              id
              title
              handle
              vendor
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    const variables = {
      query: `title:*${searchTerm}*`,
      first: 20,
      after: cursor || null
    };

    const response = await fetch(`https://${shopDomain}/admin/api/2023-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: graphqlQuery,
        variables
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Shopify API error (${response.status}):`, errorText);
      return NextResponse.json(
        { error: 'Failed to search products' },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      return NextResponse.json(
        { error: 'GraphQL query failed' },
        { status: 400 }
      );
    }

    // Transform the response to match our interface
    const products = data.data.products.edges.map((edge: ProductEdge) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      vendor: edge.node.vendor,
      price: edge.node.variants.edges[0]?.node.price || '0.00',
      variants: edge.node.variants.edges.map((v: VariantEdge) => ({
        id: v.node.id,
        price: v.node.price
      }))
    }));

    return NextResponse.json({
      products,
      hasNextPage: data.data.products.pageInfo.hasNextPage,
      endCursor: data.data.products.pageInfo.endCursor,
      total: data.data.products.edges.length,
      searchTerm
    });

  } catch (error) {
    console.error('Error in product search:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 