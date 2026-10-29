import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import {
  resolveShopifyCredentials,
  shopifyCredentialResponse,
} from '@/lib/shopify/credentials';
import { findDuplicateArticle } from '@/lib/shopify/duplicates';
import { escapeHtml } from '@/lib/article/enhanced/render';
import type { ArticleSeo } from '@/lib/article/enhanced/types';

// Initialize Firebase Admin
initializeFirebaseAdmin();

interface ShopifyArticleRequest {
  /** Preferred: credentials are looked up server-side from the brand profile. */
  brandId?: string;
  shopifyStoreUrl?: string;
  shopifyAccessToken?: string;
  blogId?: string;
  /** Refuse with 409 if the blog already has an article Shopify would give the same URL. */
  skipIfTitleExists?: boolean;
  article: {
    title: string;
    content: string;
    status: 'draft' | 'published';
    author?: string;
    /** Search listing fields from Enhanced articles. Classic articles have none. */
    seo?: Partial<ArticleSeo> | null;
  };
}

function seoFields(seo: Partial<ArticleSeo> | null | undefined) {
  if (!seo) return {};
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const metaTitle = text(seo.metaTitle, 70);
  const metaDescription = text(seo.metaDescription, 320);
  const excerpt = text(seo.excerpt, 500);
  const tags = Array.isArray(seo.tags)
    ? seo.tags.map((tag) => text(tag, 40).replace(/,/g, ' ')).filter(Boolean).slice(0, 10)
    : [];
  const src = text(seo.featuredImage?.src, 2000);

  const metafields = [
    metaTitle && { namespace: 'global', key: 'title_tag', value: metaTitle, type: 'single_line_text_field' },
    metaDescription && { namespace: 'global', key: 'description_tag', value: metaDescription, type: 'single_line_text_field' },
  ].filter(Boolean);

  return {
    ...(excerpt && { summary_html: `<p>${escapeHtml(excerpt)}</p>` }),
    ...(tags.length && { tags: tags.join(', ') }),
    ...(metafields.length && { metafields }),
    ...(/^https:\/\//.test(src) && { image: { src, alt: text(seo.featuredImage?.alt, 250) } }),
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
    const { blogId: requestedBlogId, article } = body;

    if (!article) {
      return NextResponse.json({ error: 'Missing required field: article' }, { status: 400 });
    }

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

    if (body.skipIfTitleExists) {
      const duplicate = await findDuplicateArticle(
        shopDomain,
        shopifyAccessToken,
        blogId as string,
        article.title
      );
      if (duplicate) {
        return NextResponse.json(
          {
            error: `Shopify already has "${duplicate.title}" at /${duplicate.handle}, so this was not pushed as a second copy.`,
            code: 'duplicate_title',
          },
          { status: 409 }
        );
      }
    }

    // Create the article in Shopify
    const articleData = {
      article: {
        title: article.title,
        body_html: article.content, // Use body_html instead of content for Shopify
        published: article.status === 'published',
        summary: article.content.replace(/<[^>]*>/g, '').substring(0, 160) + '...', // Create summary from content
        ...(article.author && { author: article.author }), // Include author if provided
        ...seoFields(article.seo),
      } as Record<string, unknown>
    };

    // Debug the data being sent to Shopify
    console.log('Sending to Shopify:', {
      title: articleData.article.title,
      bodyHtmlLength: article.content.length,
      hasSeo: Boolean(article.seo),
      hasBodyHtml: !!articleData.article.body_html,
      published: articleData.article.published,
      author: articleData.article.author || 'None'
    });

    const create = () =>
      fetch(`https://${shopDomain}/admin/api/2023-10/blogs/${blogId}/articles.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': shopifyAccessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(articleData),
      });

    let createResponse = await create();

    // Shopify downloads the featured image while creating the article, so an image it
    // cannot fetch fails the whole request. The article matters more than its picture.
    if (!createResponse.ok && createResponse.status === 422 && articleData.article.image) {
      console.warn('Shopify rejected the article with its featured image; retrying without it');
      delete articleData.article.image;
      createResponse = await create();
    }

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