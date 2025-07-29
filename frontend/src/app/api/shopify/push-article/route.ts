import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

interface ShopifyArticleRequest {
  shopifyStoreUrl: string;
  shopifyAccessToken: string;
  blogId?: string;
  article: {
    title: string;
    content: string;
    status: 'draft' | 'published';
    author?: string;
  };
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
    const body: ShopifyArticleRequest = await request.json();
    const { shopifyStoreUrl, shopifyAccessToken, blogId: requestedBlogId, article } = body;

    // Validate required fields
    if (!shopifyStoreUrl || !shopifyAccessToken || !article) {
      return NextResponse.json(
        { error: 'Missing required fields: shopifyStoreUrl, shopifyAccessToken, or article' },
        { status: 400 }
      );
    }

    // Debug logging
    console.log('Received article data:', {
      title: article.title,
      contentLength: article.content?.length || 0,
      hasContent: !!article.content,
      contentPreview: article.content?.substring(0, 100) + '...'
    });

    if (!article.title || !article.content) {
      console.error('Article validation failed:', {
        hasTitle: !!article.title,
        hasContent: !!article.content,
        contentLength: article.content?.length || 0
      });
      return NextResponse.json(
        { error: 'Article must have both title and content' },
        { status: 400 }
      );
    }

    // Clean up the store URL to get the shop domain
    let shopDomain = shopifyStoreUrl;
    if (shopDomain.includes('://')) {
      shopDomain = shopDomain.split('://')[1];
    }
    if (shopDomain.endsWith('/')) {
      shopDomain = shopDomain.slice(0, -1);
    }
    if (!shopDomain.endsWith('.myshopify.com')) {
      if (!shopDomain.includes('.')) {
        shopDomain = `${shopDomain}.myshopify.com`;
      }
    }

    // Determine which blog to use
    let blogId = requestedBlogId;
    
    if (!blogId) {
      // If no specific blog requested, get the first blog (backward compatibility)
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
      
      if (!blogsData.blogs || blogsData.blogs.length === 0) {
        return NextResponse.json(
          { error: 'No blogs found in your Shopify store. Please create a blog first.' },
          { status: 400 }
        );
      }

      // Use the first blog (usually the main blog)
      blogId = blogsData.blogs[0].id;
    }

    // Create the article in Shopify
    const articleData = {
      article: {
        title: article.title,
        body_html: article.content, // Use body_html instead of content for Shopify
        published: article.status === 'published',
        summary: article.content.replace(/<[^>]*>/g, '').substring(0, 160) + '...', // Create summary from content
        ...(article.author && { author: article.author }), // Include author if provided
      }
    };

    // Debug the data being sent to Shopify
    console.log('Sending to Shopify:', {
      title: articleData.article.title,
      bodyHtmlLength: articleData.article.body_html?.length || 0,
      hasBodyHtml: !!articleData.article.body_html,
      published: articleData.article.published,
      author: articleData.article.author || 'None'
    });

    const createResponse = await fetch(`https://${shopDomain}/admin/api/2023-10/blogs/${blogId}/articles.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(articleData),
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      console.error('Failed to create article:', errorData);
      return NextResponse.json(
        { error: errorData.errors || 'Failed to create article in Shopify' },
        { status: 400 }
      );
    }

    const createdArticle = await createResponse.json();

    return NextResponse.json({
      success: true,
      message: 'Article successfully pushed to Shopify',
      shopifyArticle: {
        id: createdArticle.article.id,
        title: createdArticle.article.title,
        url: `https://${shopDomain}/admin/articles/${createdArticle.article.id}`,
        status: createdArticle.article.published ? 'published' : 'draft'
      }
    });

  } catch (error) {
    console.error('Error pushing article to Shopify:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
} 