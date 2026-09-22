import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import {
  resolveShopifyCredentials,
  shopifyCredentialResponse,
} from '@/lib/shopify/credentials';

// Interface for Shopify article structure
interface ShopifyArticle {
  id: string;
  title: string;
  content: string;
  summary?: string;
  author?: string;
  created_at: string;
  updated_at: string;
  tags?: string;
  status?: string;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Initialize Firebase Admin if not already initialized
    initializeFirebaseAdmin();
    const decodedToken = await getAuth().verifyIdToken(token);
    
    if (!decodedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();

    let cleanStoreUrl: string;
    let shopifyAccessToken: string;
    try {
      const credentials = await resolveShopifyCredentials(decodedToken.uid, body);
      cleanStoreUrl = credentials.shopDomain;
      shopifyAccessToken = credentials.accessToken;
    } catch (error) {
      const { error: message, status } = shopifyCredentialResponse(error);
      return NextResponse.json({ error: message }, { status });
    }

    // Fetch blogs first
    const blogsResponse = await fetch(`https://${cleanStoreUrl}/admin/api/2023-10/blogs.json`, {
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!blogsResponse.ok) {
      const errorText = await blogsResponse.text();
      console.error('Failed to fetch blogs:', errorText);
      return NextResponse.json({ 
        error: 'Failed to fetch blogs from Shopify store' 
      }, { status: 400 });
    }

    const blogsData = await blogsResponse.json();
    const blogs = blogsData.blogs || [];

    if (blogs.length === 0) {
      return NextResponse.json({ 
        articles: [],
        message: 'No blogs found in your Shopify store'
      });
    }

    // Fetch articles from all blogs
    const allArticles = [];

    for (const blog of blogs) {
      try {
        const articlesResponse = await fetch(
          `https://${cleanStoreUrl}/admin/api/2023-10/blogs/${blog.id}/articles.json?limit=250`,
          {
            headers: {
              'X-Shopify-Access-Token': shopifyAccessToken,
              'Content-Type': 'application/json',
            },
          }
        );

        if (articlesResponse.ok) {
          const articlesData = await articlesResponse.json();
          const articles = articlesData.articles || [];
          
          // Add blog information to each article
          const articlesWithBlog = articles.map((article: ShopifyArticle) => ({
            ...article,
            blog_id: blog.id,
            blog_title: blog.title,
          }));
          
          allArticles.push(...articlesWithBlog);
        }
      } catch (error) {
        console.error(`Failed to fetch articles for blog ${blog.id}:`, error);
        // Continue with other blogs even if one fails
      }
    }

    // Sort articles by creation date (newest first)
    allArticles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ 
      articles: allArticles,
      count: allArticles.length 
    });

  } catch (error) {
    console.error('Error fetching Shopify articles:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 