'use client';

import { useState, useEffect } from 'react';
import { useParams, notFound } from 'next/navigation';
import { blogOperations, BlogPost } from '@/lib/firebase/firestore';
import { Calendar, User, Eye, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import Head from 'next/head';
import Image from 'next/image';

export default function BlogPostPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [blog, setBlog] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadBlog = async () => {
      if (!slug) return;
      
      setIsLoading(true);
      try {
        const blogPost = await blogOperations.getBySlug(slug);
        
        if (!blogPost) {
          notFound();
          return;
        }
        
        setBlog(blogPost);
        
        // Increment view count
        if (blogPost.authorId && blogPost.id) {
          await blogOperations.incrementViews(blogPost.authorId, blogPost.id);
        }
      } catch (error) {
        console.error('Error loading blog post:', error);
        notFound();
      } finally {
        setIsLoading(false);
      }
    };

    loadBlog();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!blog) {
    notFound();
  }

  return (
    <>
      <Head>
        <title>{blog.title} | EnhanceMySEO</title>
        <meta name="description" content={blog.metaDescription || blog.content.substring(0, 160)} />
        <meta property="og:title" content={blog.title} />
        <meta property="og:description" content={blog.metaDescription || blog.content.substring(0, 160)} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`${window.location.origin}/blog/${blog.slug}`} />
        {blog.featuredImage && <meta property="og:image" content={blog.featuredImage} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={blog.title} />
        <meta name="twitter:description" content={blog.metaDescription || blog.content.substring(0, 160)} />
        {blog.featuredImage && <meta name="twitter:image" content={blog.featuredImage} />}
        <link rel="canonical" href={`${window.location.origin}/blog/${blog.slug}`} />
      </Head>
      
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Link
              href="/blog"
              className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-6"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Blog
            </Link>
            
            <div className="max-w-3xl">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">
                {blog.title}
              </h1>
              
              <div className="flex flex-wrap items-center text-sm text-gray-600 space-x-6">
                <div className="flex items-center">
                  <User className="w-4 h-4 mr-1" />
                  <span>By {blog.authorName}</span>
                </div>
                
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-1" />
                  <span>
                    {blog.publishDate 
                      ? new Date(blog.publishDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })
                      : 'Draft'
                    }
                  </span>
                </div>
                
                <div className="flex items-center">
                  <Eye className="w-4 h-4 mr-1" />
                  <span>{blog.viewCount || 0} views</span>
                </div>
              </div>
              
              {blog.tags && blog.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {blog.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Featured Image */}
        {blog.featuredImage && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="aspect-video rounded-lg overflow-hidden bg-gray-200 relative">
              <Image
                src={blog.featuredImage}
                alt={blog.title}
                fill
                className="object-cover"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
          <article className="bg-white rounded-lg shadow-sm p-8">
            <div 
              className="prose prose-lg max-w-none
                prose-headings:text-gray-900 prose-headings:font-semibold
                prose-p:text-gray-700 prose-p:leading-relaxed
                prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-gray-900 prose-strong:font-semibold
                prose-ul:text-gray-700 prose-ol:text-gray-700
                prose-li:text-gray-700 prose-li:leading-relaxed
                prose-blockquote:text-gray-600 prose-blockquote:border-blue-200
                prose-code:text-blue-600 prose-code:bg-blue-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                prose-pre:bg-gray-900 prose-pre:text-gray-100
                prose-img:rounded-lg prose-img:shadow-md"
              dangerouslySetInnerHTML={{ __html: blog.content }}
            />
          </article>
          
          {/* Article Footer */}
          <div className="mt-8 pt-8 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                Published on {blog.publishDate 
                  ? new Date(blog.publishDate).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })
                  : 'Unknown'
                }
              </div>
              
              <Link
                href="/blog"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                Back to Blog
              </Link>
            </div>
          </div>
        </main>

        {/* Structured Data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Article",
              "headline": blog.title,
              "description": blog.metaDescription || blog.content.substring(0, 160),
              "image": blog.featuredImage || `${window.location.origin}/logo.png`,
              "author": {
                "@type": "Person",
                "name": blog.authorName
              },
              "publisher": {
                "@type": "Organization",
                "name": "EnhanceMySEO",
                "logo": {
                  "@type": "ImageObject",
                  "url": `${window.location.origin}/logo.png`
                }
              },
              "datePublished": blog.publishDate?.toISOString(),
              "dateModified": blog.updatedAt?.toDate?.()?.toISOString() || blog.publishDate?.toISOString(),
              "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": `${window.location.origin}/blog/${blog.slug}`
              }
            })
          }}
        />
      </div>
    </>
  );
} 