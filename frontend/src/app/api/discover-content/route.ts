import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert } from 'firebase-admin/app';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  const serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
  };

  initializeApp({
    credential: cert(serviceAccount as any),
  });
}

// Simple in-memory cache for content discovery
const discoveryCache = new Map<string, {
  content: any[];
  timestamp: number;
  expiresAt: number;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function getCacheKey(websiteUrl: string, searchTerms: string[]): string {
  return `${websiteUrl}:${searchTerms.join(',')}`;
}

function getCachedContent(cacheKey: string) {
  const cached = discoveryCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`🎯 Cache hit for: ${cacheKey}`);
    return cached.content;
  }
  return null;
}

function setCachedContent(cacheKey: string, content: any[]) {
  discoveryCache.set(cacheKey, {
    content,
    timestamp: Date.now(),
    expiresAt: Date.now() + CACHE_DURATION
  });
  
  // Clean up old cache entries
  for (const [key, value] of discoveryCache.entries()) {
    if (Date.now() > value.expiresAt) {
      discoveryCache.delete(key);
    }
  }
}

// Copy the website discovery functions from generate-article/route.ts
// [Note: In a real implementation, these would be moved to a shared utility file]

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…');
}

// Simplified content discovery focused on speed and essential pages
async function discoverWebsiteContent(
  websiteUrl: string, 
  searchTerms: string[] = []
): Promise<Array<{
  url: string;
  title: string;
  description?: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
  discoveryMethod?: string;
  relevanceScore?: number;
}>> {
  console.log(`🚀 Fast Content Discovery starting for: ${websiteUrl}`);
  const startTime = Date.now();
  const discoveredPages: any[] = [];
  
  try {
    // Phase 1: Quick sitemap and homepage analysis (8 seconds max)
    console.log('⚡ Phase 1: Essential Structure Analysis');
    
    // Get homepage content
    const homepageContent = await analyzePageContent(websiteUrl);
    if (homepageContent) {
      discoveredPages.push({
        ...homepageContent,
        discoveryMethod: 'homepage',
        relevanceScore: calculateBasicRelevance(homepageContent, searchTerms)
      });
    }
    
    // Quick sitemap check
    const sitemapUrls = await getQuickSitemapUrls(websiteUrl);
    const relevantSitemapPages = sitemapUrls
      .filter(url => isRelevantUrl(url, searchTerms))
      .slice(0, 10); // Limit to 10 most relevant
    
    // Analyze top sitemap pages in parallel
    const sitemapPromises = relevantSitemapPages.map(async (url) => {
      const content = await analyzePageContent(url);
      if (content) {
        return {
          ...content,
          discoveryMethod: 'sitemap',
          relevanceScore: calculateBasicRelevance(content, searchTerms)
        };
      }
      return null;
    });
    
    const sitemapResults = await Promise.allSettled(sitemapPromises);
    sitemapResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
        discoveredPages.push(result.value);
      }
    });
    
    const timeElapsed = Date.now() - startTime;
    console.log(`✅ Discovery complete: ${discoveredPages.length} pages in ${timeElapsed}ms`);
    
    // Filter and sort by relevance
    return discoveredPages
      .filter(page => page.relevanceScore > 5)
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .slice(0, 20); // Return top 20 pages
    
  } catch (error) {
    console.error('❌ Content discovery error:', error);
    return discoveredPages; // Return partial results
  }
}

async function analyzePageContent(url: string): Promise<{
  url: string;
  title: string;
  description?: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
} | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'EnhanceMySeBot/1.0' },
      signal: AbortSignal.timeout(2000) // Very fast timeout
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : getBasicTitleFromUrl(url);
    
    // Extract description
    const descMatch = html.match(/<meta[^>]*name=['"](description|Description)['"]\s*content=['"](.*?)['"]/i);
    const description = descMatch ? decodeHtmlEntities(descMatch[2].trim()) : undefined;
    
    const pageType = categorizePageBasic(url, title);
    
    return { url, title, description, pageType };
    
  } catch (error) {
    return null;
  }
}

async function getQuickSitemapUrls(websiteUrl: string): Promise<string[]> {
  const urls: string[] = [];
  
  try {
    const sitemapUrl = `${websiteUrl}/sitemap.xml`;
    const response = await fetch(sitemapUrl, {
      signal: AbortSignal.timeout(3000)
    });
    
    if (response.ok) {
      const xml = await response.text();
      const urlMatches = xml.match(/<loc>(.*?)<\/loc>/g);
      
      if (urlMatches) {
        urls.push(...urlMatches
          .map(match => match.replace(/<\/?loc>/g, ''))
          .filter(url => url.startsWith('http'))
          .slice(0, 50)
        );
      }
    }
  } catch (error) {
    // Sitemap not available or failed
  }
  
  return urls;
}

function isRelevantUrl(url: string, searchTerms: string[]): boolean {
  if (!searchTerms.length) return true;
  
  const urlLower = url.toLowerCase();
  return searchTerms.some(term => 
    urlLower.includes(term.toLowerCase()) ||
    urlLower.includes(term.toLowerCase().replace(/\s+/g, '-'))
  );
}

function calculateBasicRelevance(page: any, searchTerms: string[]): number {
  if (!searchTerms.length) return 25;
  
  let score = 0;
  const titleLower = page.title.toLowerCase();
  const urlLower = page.url.toLowerCase();
  const descLower = (page.description || '').toLowerCase();
  
  searchTerms.forEach(term => {
    const termLower = term.toLowerCase();
    if (titleLower.includes(termLower)) score += 40;
    if (urlLower.includes(termLower)) score += 30;
    if (descLower.includes(termLower)) score += 20;
  });
  
  // Boost commercial pages
  if (urlLower.includes('product') || urlLower.includes('service') || 
      urlLower.includes('buy') || urlLower.includes('shop')) {
    score += 15;
  }
  
  return score;
}

function categorizePageBasic(url: string, title: string): 'product' | 'service' | 'blog' | 'category' | 'about' | 'other' {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  
  // Blog detection
  if (urlLower.match(/\/(blog|news|articles|posts)\//) || 
      urlLower.match(/\/\d{4}\/\d{2}\//) ||
      titleLower.includes('blog')) {
    return 'blog';
  }
  
  // Product detection
  if (urlLower.includes('product') || urlLower.includes('item') || urlLower.includes('shop')) {
    return 'product';
  }
  
  // Service detection
  if (urlLower.includes('service') || urlLower.includes('repair') || urlLower.includes('consultation')) {
    return 'service';
  }
  
  // Category detection
  if (urlLower.includes('category') || urlLower.includes('collection') || urlLower.includes('catalog')) {
    return 'category';
  }
  
  // About detection
  if (urlLower.includes('about') || urlLower.includes('contact') || urlLower.includes('team')) {
    return 'about';
  }
  
  return 'other';
}

function getBasicTitleFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return pathname.split('/').pop()?.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Page';
  } catch {
    return 'Page';
  }
}

export async function POST(request: Request) {
  try {
    // Authentication check
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
    } catch (error) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { websiteUrl, searchTerms = [], keyword = '' } = await request.json();
    
    if (!websiteUrl) {
      return NextResponse.json({ error: 'Website URL is required' }, { status: 400 });
    }

    // Create cache key
    const allSearchTerms = [keyword, ...searchTerms].filter(Boolean);
    const cacheKey = getCacheKey(websiteUrl, allSearchTerms);
    
    // Check cache first
    const cachedContent = getCachedContent(cacheKey);
    if (cachedContent) {
      return NextResponse.json({
        pages: cachedContent,
        cached: true,
        timestamp: Date.now()
      });
    }

    console.log('🔍 Starting content discovery for:', websiteUrl);
    
    // Discover content
    const discoveredPages = await discoverWebsiteContent(websiteUrl, allSearchTerms);
    
    // Cache the results
    setCachedContent(cacheKey, discoveredPages);
    
    console.log(`✅ Content discovery complete: ${discoveredPages.length} pages found`);
    
    return NextResponse.json({
      pages: discoveredPages,
      cached: false,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Content discovery error:', error);
    return NextResponse.json(
      { error: 'Failed to discover content' },
      { status: 500 }
    );
  }
} 