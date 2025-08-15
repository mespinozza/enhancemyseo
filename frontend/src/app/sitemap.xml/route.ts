import { NextResponse } from 'next/server';
import { blogOperations } from '@/lib/firebase/firestore';

export async function GET() {
  try {
    // Get all published blog posts
    const publishedBlogs = await blogOperations.getAllPublished();
    
    // Get current date in ISO format
    const currentDate = new Date().toISOString();
    
    // Base URL - you should replace this with your actual domain
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://enhancemyseo.com';
    
    // Create sitemap XML
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Static pages -->
  <url>
    <loc>${baseUrl}/blog</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/pricing</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/contact</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/privacy-policy</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  
  <url>
    <loc>${baseUrl}/terms</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  
  <!-- Blog posts -->
  ${publishedBlogs.map(blog => `
  <url>
    <loc>${baseUrl}/blog/${blog.slug}</loc>
    <lastmod>${(() => {
      try {
        if (blog.updatedAt?.toDate) {
          const updatedDate = blog.updatedAt.toDate();
          if (updatedDate && !isNaN(updatedDate.getTime())) {
            return updatedDate.toISOString();
          }
        }
        if (blog.publishDate) {
          if (blog.publishDate instanceof Date) {
            return isNaN(blog.publishDate.getTime()) ? currentDate : blog.publishDate.toISOString();
          }
          const dateObj = new Date(blog.publishDate);
          return isNaN(dateObj.getTime()) ? currentDate : dateObj.toISOString();
        }
        return currentDate;
      } catch {
        return currentDate;
      }
    })()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('')}
</urlset>`;

    return new NextResponse(sitemap, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error generating sitemap:', error);
    
    // Return a minimal sitemap in case of error
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://enhancemyseo.com';
    const currentDate = new Date().toISOString();
    
    const fallbackSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;

    return new NextResponse(fallbackSitemap, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  }
} 