import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

interface PageEdge {
  node: {
    id: string;
    title: string;
    handle: string;
    bodySummary: string;
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

    // GraphQL query for page search with pagination
    const graphqlQuery = `
      query searchPages($query: String!, $first: Int!, $after: String) {
        pages(first: $first, query: $query, after: $after) {
          edges {
            node {
              id
              title
              handle
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
        { error: 'Failed to search pages' },
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
    const pages = data.data.pages.edges.map((edge: PageEdge) => ({
      id: edge.node.id,
      title: edge.node.title,
      handle: edge.node.handle,
      url: `${shopifyStoreUrl}/pages/${edge.node.handle}`
    }));

    return NextResponse.json({
      pages,
      hasNextPage: data.data.pages.pageInfo.hasNextPage,
      endCursor: data.data.pages.pageInfo.endCursor,
      total: data.data.pages.edges.length,
      searchTerm
    });

  } catch (error) {
    console.error('Error in page search:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 