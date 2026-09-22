import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import {
  resolveShopifyCredentials,
  shopifyCredentialResponse,
} from '@/lib/shopify/credentials';

// Initialize Firebase Admin
initializeFirebaseAdmin();

interface ShopifyBlogsRequest {
  /** Preferred: credentials are looked up server-side from the brand profile. */
  brandId?: string;
  shopifyStoreUrl?: string;
  shopifyAccessToken?: string;
}

export async function POST(request: Request) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(token);
    
    if (!decodedToken.uid) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Parse request body
    const body: ShopifyBlogsRequest = await request.json();

    let shopDomain: string;
    let shopifyAccessToken: string;
    try {
      const credentials = await resolveShopifyCredentials(decodedToken.uid, body);
      shopDomain = credentials.shopDomain;
      shopifyAccessToken = credentials.accessToken;
    } catch (error) {
      const { error: message, status } = shopifyCredentialResponse(error);
      return NextResponse.json({ error: message }, { status });
    }

    // Fetch blogs from Shopify
    const blogsResponse = await fetch(`https://${shopDomain}/admin/api/2023-10/blogs.json`, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!blogsResponse.ok) {
      const errorText = await blogsResponse.text();
      console.error('Failed to fetch blogs:', errorText);
      return NextResponse.json(
        { error: 'Failed to access Shopify store. Please check your store URL and access token.' },
        { status: 400 }
      );
    }

    const blogsData = await blogsResponse.json();
    
    return NextResponse.json({
      success: true,
      blogs: blogsData.blogs || []
    });

  } catch (error) {
    console.error('Error fetching blogs from Shopify:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
} 