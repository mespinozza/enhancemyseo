import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';

// Initialize Firebase Admin if not already initialized
initializeFirebaseAdmin();

// Enhanced URL pattern analysis for blog detection
function analyzeUrlPatterns(url: string): number {
  let score = 0;
  const urlLower = url.toLowerCase();
  
  // Date patterns in URL (+25 points)
  const datePatterns = [
    /\/\d{4}\/\d{1,2}\/\d{1,2}\//,     // /2024/01/15/
    /\/\d{4}-\d{1,2}-\d{1,2}/,         // /2024-01-15
    /\/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i
  ];
  
  if (datePatterns.some(pattern => pattern.test(url))) score += 25;
  
  // CMS indicators (+20 points)
  if (urlLower.includes('?p=') || urlLower.includes('?post_id=')) score += 20;
  if (urlLower.includes('/posts/') || urlLower.includes('/insights/')) score += 15;
  
  // Editorial sections (+15 points)
  const editorialSections = ['/news/', '/resources/', '/learning/', '/insights/', '/updates/'];
  if (editorialSections.some(section => urlLower.includes(section))) score += 15;
  
  return score;
}

// Enhanced content metadata analysis for blog detection
function analyzeContentMetadata(title: string, content?: string): number {
  let score = 0;
  const contentLower = (content || '').toLowerCase();
  
  // Author indicators (+20 points)
  const authorPatterns = ['by ', 'author:', 'written by', 'posted by'];
  if (authorPatterns.some(pattern => contentLower.includes(pattern))) score += 20;
  
  // Temporal language (+10 points)
  const temporalTerms = ['today', 'yesterday', 'recently', 'last week', 'this month'];
  const temporalMatches = temporalTerms.filter(term => contentLower.includes(term)).length;
  score += Math.min(temporalMatches * 3, 10);
  
  // Publication metadata (+10 points)
  if (contentLower.includes('published') || contentLower.includes('updated')) score += 10;
  
  return score;
}

// Multi-layered blog probability calculator
function calculateBlogProbability(url: string, title: string, content?: string): number {
  let score = 0;
  
  // URL pattern analysis (30 points max)
  score += analyzeUrlPatterns(url);
  
  // Content metadata analysis (40 points max) 
  score += analyzeContentMetadata(title, content);
  
  return Math.min(score, 100);
}

// Advanced page categorization with parallel Shopify structure (excludes blog articles)
function categorizeWebsitePageAdvanced(
  url: string, 
  title: string, 
  content?: string
): 'product' | 'service' | 'blog' | 'category' | 'about' | 'other' {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const contentLower = (content || '').toLowerCase();
  
  // 🔥 ENHANCED BLOG DETECTION (multi-layered analysis)
  const blogProbability = calculateBlogProbability(url, title, content);
  
  if (blogProbability > 60) {
    return 'blog'; // Will be filtered out - uses sophisticated URL patterns, content analysis, and context detection
  }
  
  // 🛍️ PRODUCT PAGES (parallel to Shopify Products)
  const productIndicators = [
    '/product', '/equipment', '/parts', '/inventory', '/catalog', '/shop', '/store'
  ];
  
  const productKeywords = [
    'equipment', 'parts', 'inventory', 'catalog', 'model', 'specification',
    'buy', 'purchase', 'order', 'price', 'cost', 'for sale'
  ];
  
  let productScore = 0;
  for (const indicator of productIndicators) {
    if (urlLower.includes(indicator)) productScore += 15;
  }
  
  for (const keyword of productKeywords) {
    if (titleLower.includes(keyword)) productScore += 10;
    if (contentLower.includes(keyword)) productScore += 5;
  }
  
  // 📂 CATEGORY/COLLECTION PAGES (parallel to Shopify Collections)
  const categoryIndicators = [
    '/category', '/collection', '/department', '/section', '/type',
    '/brand', '/manufacturer', '/series'
  ];
  
  const categoryKeywords = [
    'category', 'collection', 'department', 'type', 'series', 'line',
    'brand', 'manufacturer', 'family', 'range'
  ];
  
  let categoryScore = 0;
  for (const indicator of categoryIndicators) {
    if (urlLower.includes(indicator)) categoryScore += 15;
  }
  
  for (const keyword of categoryKeywords) {
    if (titleLower.includes(keyword)) categoryScore += 10;
    if (contentLower.includes(keyword)) categoryScore += 5;
  }
  
  // 🔧 SERVICE PAGES (part of "Regular Pages" - high priority)
  const serviceIndicators = [
    '/service', '/repair', '/maintenance', '/installation', '/support',
    '/consulting', '/solution', '/cleaning', '/calibration', '/inspection',
    '/troubleshooting', '/warranty'
  ];
  
  const serviceKeywords = [
    'service', 'repair', 'maintenance', 'installation', 'support',
    'consulting', 'solution', 'cleaning', 'calibration', 'inspection',
    'troubleshooting', 'warranty', 'technical support'
  ];
  
  let serviceScore = 0;
  for (const indicator of serviceIndicators) {
    if (urlLower.includes(indicator)) serviceScore += 15;
  }
  
  for (const keyword of serviceKeywords) {
    if (titleLower.includes(keyword)) serviceScore += 10;
    if (contentLower.includes(keyword)) serviceScore += 5;
  }
  
  // 📄 ABOUT/COMPANY PAGES (part of "Regular Pages" - lower priority)
  const aboutIndicators = ['/about', '/company', '/team', '/history', '/mission'];
  const aboutKeywords = ['about', 'company', 'team', 'history', 'mission', 'values'];
  
  let aboutScore = 0;
  for (const indicator of aboutIndicators) {
    if (urlLower.includes(indicator)) aboutScore += 10;
  }
  
  for (const keyword of aboutKeywords) {
    if (titleLower.includes(keyword)) aboutScore += 8;
  }
  
  // Determine category based on highest score
  const scores = [
    { type: 'product' as const, score: productScore },
    { type: 'category' as const, score: categoryScore },
    { type: 'service' as const, score: serviceScore },
    { type: 'about' as const, score: aboutScore }
  ];
  
  const highestScore = scores.reduce((max, curr) => curr.score > max.score ? curr : max);
  
  // Return highest scoring category, or 'other' for regular pages
  if (highestScore.score > 8) {
    return highestScore.type;
  }
  
  // Default to 'other' for regular pages that aren't clearly categorized
  return 'other';
}

// Comprehensive website discovery function using the same 4-phase system as automatic mode
async function searchWebsiteContentComprehensive(websiteUrl: string, searchTerm: string) {
  try {
    console.log(`🔍 Starting enhanced discovery for "${searchTerm}" on ${websiteUrl}`);
    
    // Use the comprehensive 4-phase discovery system (20-second limit for manual search)
    const discoveredPages = await discoverWebsitePages(websiteUrl, [searchTerm], 20000); // Increased to 20 seconds
    
    console.log(`🔍 Discovered ${discoveredPages.length} total pages from comprehensive search`);
    
    // Enhanced filtering with URL-based scoring
    const enhancedPages = discoveredPages.map(page => {
      let enhancedScore = page.relevanceScore || 0;
      const searchLower = searchTerm.toLowerCase();
      
      // 🎯 URL-based scoring (high priority for manual search)
      if (page.url.toLowerCase().includes(searchLower)) {
        enhancedScore += 50; // High boost for URL matches
        console.log(`🎯 URL match found: "${searchTerm}" in ${page.url}`);
      }
      
      // Check for hyphenated and underscore variations
      const urlPath = page.url.toLowerCase();
      if (urlPath.includes(`-${searchLower}`) || urlPath.includes(`${searchLower}-`) || 
          urlPath.includes(`_${searchLower}`) || urlPath.includes(`${searchLower}_`)) {
        enhancedScore += 40;
        console.log(`🎯 URL variation match: "${searchTerm}" in ${page.url}`);
      }
      
      // Title-based scoring
      if (page.title.toLowerCase().includes(searchLower)) {
        enhancedScore += 30;
      }
      
      // Description-based scoring
      if ((page.description || '').toLowerCase().includes(searchLower)) {
        enhancedScore += 20;
      }
      
      return { ...page, relevanceScore: enhancedScore };
    });
    
    // Filter for relevant pages with lower threshold
    const relevantPages = enhancedPages.filter(page => {
      // Keep pages that are not blogs and have ANY relevance (lowered threshold)
      return page.pageType !== 'blog' && (page.relevanceScore || 0) > 5; // Much lower threshold
    });
    
    console.log(`📊 Enhanced scoring: ${relevantPages.length}/${discoveredPages.length} pages passed filtering`);
    
    // Sort by enhanced relevance score
    relevantPages.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    
    // Show top scoring results for debugging
    if (relevantPages.length > 0) {
      console.log(`🏆 Top ${Math.min(5, relevantPages.length)} results:`);
      relevantPages.slice(0, 5).forEach((page, index) => {
        console.log(`  ${index + 1}. "${page.title}" [${page.pageType}] - Score: ${page.relevanceScore} - ${page.url}`);
      });
    }
    
    // Limit to top 50 results for performance
    const topResults = relevantPages.slice(0, 50);
    
    // Ensure all pages have pageType for UI display
    const enhancedResults = topResults.map(page => ({
      ...page,
      pageType: page.pageType || 'other' // Fallback pageType if missing
    }));
    
    console.log(`✅ Returning ${enhancedResults.length} relevant pages of all types`);
    console.log(`📊 Page types found:`, [...new Set(enhancedResults.map(p => p.pageType))]);
    
    return enhancedResults;
  } catch (error) {
    console.error('Error in comprehensive website search:', error);
    return [];
  }
}

// Import the comprehensive discovery system from the automatic mode
// Enhanced 4-Phase Website Discovery Orchestrator (simplified for manual search)
async function discoverWebsitePages(
  websiteUrl: string, 
  searchTerms: string[] = [],
  timeLimit: number = 15000 // 15 seconds for manual search
): Promise<Array<{
  url: string;
  title: string;
  description?: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
  discoveryMethod?: string;
  priority?: number;
  relevanceScore?: number;
}>> {
  console.log(`🚀 4-Phase Discovery starting for: ${websiteUrl}`);
  const startTime = Date.now();
  const allPages: any[] = [];
  
  try {
    // Phase 1: Enhanced Sitemap & Structure Analysis (High Priority - Fast)
    console.log('⚡ Phase 1: Structure Analysis');
    const structureData = await discoverWebsiteStructure(websiteUrl);
    allPages.push(...structureData.pages);
    
    console.log(`📊 Phase 1 Results: ${structureData.pages.length} pages`);
    
    // Quick quality assessment
    const phase1RelevantPages = structureData.pages.filter(page => {
      if (!searchTerms.length) return true;
      const score = calculateSimpleRelevance(page, searchTerms);
      return score > 10;
    });
    
    // Check if we should continue with deeper phases
    const timeElapsed = Date.now() - startTime;
    const hasGoodResults = phase1RelevantPages.length >= 10; // Increased threshold to encourage Phase 2
    const shouldContinue = !hasGoodResults && timeElapsed < timeLimit * 0.7; // Increased time allowance
    
    if (!shouldContinue) {
      console.log(`✅ Discovery complete after Phase 1: ${allPages.length} pages (found ${phase1RelevantPages.length} relevant)`);
      return allPages.map(page => ({
        url: page.url,
        title: page.title,
        description: page.description,
        pageType: page.pageType,
        discoveryMethod: page.discoveryMethod || 'phase1',
        priority: page.priority || 10,
        relevanceScore: searchTerms.length ? calculateSimpleRelevance(page, searchTerms) : 50
      }));
    }
    
    // Phase 2: Enhanced Pattern-Based Discovery (Always run if we have time)
    if (Date.now() - startTime < timeLimit * 0.9) { // Increased time allowance for Phase 2
      console.log('🔍 Phase 2: Enhanced Pattern-Based Discovery');
      const phase2Pages = await discoverByPatterns(websiteUrl, searchTerms);
      allPages.push(...phase2Pages);
      
      console.log(`📊 Phase 2 Results: ${phase2Pages.length} additional pages`);
    }
    
    // Final processing and scoring
    const finalPages = allPages.map(page => ({
      url: page.url,
      title: page.title,
      description: page.description,
      pageType: page.pageType,
      discoveryMethod: page.discoveryMethod || 'enhanced-discovery',
      priority: page.priority || 5,
      relevanceScore: page.relevanceScore || (searchTerms.length ? calculateSimpleRelevance(page, searchTerms) : 25)
    }));
    
    // Remove duplicates and sort by relevance
    const uniquePages = finalPages.filter((page, index, self) => 
      index === self.findIndex(p => p.url === page.url)
    ).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    
    const totalTime = Date.now() - startTime;
    console.log(`🎉 Discovery Complete: ${uniquePages.length} pages in ${totalTime}ms`);
    
    return uniquePages;
    
  } catch (error) {
    console.error('Discovery error:', error);
    return [{
      url: websiteUrl,
      title: 'Homepage',
      description: 'Main website page',
      pageType: 'other' as const,
      discoveryMethod: 'fallback',
      priority: 1,
      relevanceScore: 10
    }];
  }
}

// Simplified structure discovery for manual search
async function discoverWebsiteStructure(websiteUrl: string) {
  const pages: any[] = [];
  
  try {
    // Try sitemap discovery
    console.log('📋 Discovering from sitemap...');
    const sitemapUrls = await discoverFromSitemap(websiteUrl);
    
    for (const url of sitemapUrls.slice(0, 50)) { // Limit for performance
      try {
        const response = await fetch(url, { 
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentBot/1.0)' }
        });
        
        if (!response.ok) continue;
        
        const html = await response.text();
        const title = extractTitle(html) || 'Untitled Page';
        const description = extractDescription(html) || '';
        const content = extractTextContent(html) || '';
        const pageType = categorizeWebsitePageAdvanced(url, title, content);
        
        pages.push({
          url,
          title,
          description,
          pageType,
          discoveryMethod: 'sitemap',
          priority: 10
        });
        
      } catch (_error) {
        continue;
      }
    }
    
    console.log(`✅ Sitemap discovery found ${pages.length} pages`);
    
  } catch (error) {
    console.log('❌ Sitemap discovery failed:', error instanceof Error ? error.message : String(error));
  }
  
  return {
    pages,
    sitemaps: [],
    navigationStructure: {}
  };
}

// Pattern-based discovery for additional pages (Enhanced)
async function discoverByPatterns(websiteUrl: string, searchTerms: string[]) {
  const pages: any[] = [];
  const baseUrl = new URL(websiteUrl).origin;
  
  console.log('🔍 Enhanced Pattern Discovery: Crawling for internal links...');
  
  // Phase 2A: Crawl homepage for internal links
  try {
    console.log('📄 Crawling homepage for internal links...');
    const homepageLinks = await extractLinksFromPage(websiteUrl);
    console.log(`🔗 Found ${homepageLinks.length} internal links on homepage`);
    
    for (const linkUrl of homepageLinks.slice(0, 20)) { // Limit to prevent timeout
      try {
        const response = await fetch(linkUrl, { 
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentBot/1.0)' }
        });
        
        if (!response.ok) continue;
        
        const html = await response.text();
        const title = extractTitle(html) || 'Untitled Page';
        const description = extractDescription(html) || '';
        const content = extractTextContent(html) || '';
        const pageType = categorizeWebsitePageAdvanced(linkUrl, title, content);
        
        // Enhanced relevance check - lower threshold for manual search
        const isRelevant = !searchTerms.length || searchTerms.some(term => {
          const termLower = term.toLowerCase();
          return linkUrl.toLowerCase().includes(termLower) ||
                 title.toLowerCase().includes(termLower) ||
                 description.toLowerCase().includes(termLower) ||
                 content.toLowerCase().includes(termLower);
        });
        
        if (isRelevant) {
          pages.push({
            url: linkUrl,
            title,
            description,
            pageType,
            discoveryMethod: 'link-crawl',
            priority: 9
          });
        }
        
      } catch (_error) {
        continue;
      }
    }
  } catch (error) {
    console.log('Homepage crawling failed:', error instanceof Error ? error.message : String(error));
  }
  
  // Phase 2B: Enhanced URL pattern testing
  console.log('🎯 Testing enhanced URL patterns...');
  const enhancedPatterns = [
    // Basic patterns
    '/products', '/services', '/equipment', '/catalog', '/about', '/contact', '/support',
    '/parts', '/maintenance', '/repair', '/installation', '/commercial', '/residential',
    
    // Search term specific patterns
    ...searchTerms.flatMap(term => [
      `/${term}`, `/${term}s`, `/service-${term}`, `/product-${term}`, 
      `/${term}-service`, `/${term}-services`, `/${term}-repair`, `/${term}-installation`
    ]),
    
    // Common page extensions
    '/index.html', '/home.html', '/services.html', '/products.html'
  ];
  
  for (const pattern of enhancedPatterns) {
    try {
      const testUrl = `${baseUrl}${pattern}`;
      const response = await fetch(testUrl, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentBot/1.0)' }
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      const title = extractTitle(html) || 'Untitled Page';
      const description = extractDescription(html) || '';
      const content = extractTextContent(html) || '';
      const pageType = categorizeWebsitePageAdvanced(testUrl, title, content);
      
      // Enhanced relevance check with URL priority
      const isRelevant = !searchTerms.length || searchTerms.some(term => {
        const termLower = term.toLowerCase();
        // Higher priority for URL matches
        if (testUrl.toLowerCase().includes(termLower)) return true;
        return title.toLowerCase().includes(termLower) ||
               description.toLowerCase().includes(termLower) ||
               content.toLowerCase().includes(termLower);
      });
      
      if (isRelevant) {
        pages.push({
          url: testUrl,
          title,
          description,
          pageType,
          discoveryMethod: 'enhanced-pattern',
          priority: 8
        });
      }
      
    } catch (_error) {
      continue;
    }
  }
  
  console.log(`🎉 Pattern discovery found ${pages.length} additional pages`);
  return pages;
}

// New function: Extract internal links from a webpage
async function extractLinksFromPage(pageUrl: string): Promise<string[]> {
  try {
    const response = await fetch(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ContentBot/1.0)' }
    });
    
    if (!response.ok) return [];
    
    const html = await response.text();
    const baseUrl = new URL(pageUrl).origin;
    
    // Extract all href attributes
    const linkMatches = html.match(/href\s*=\s*["']([^"']+)["']/gi) || [];
    
    const internalLinks = linkMatches
      .map(match => {
        const url = match.replace(/href\s*=\s*["']/i, '').replace(/["']$/, '');
        
        // Convert relative URLs to absolute
        if (url.startsWith('/')) {
          return baseUrl + url;
        } else if (url.startsWith('./')) {
          return baseUrl + url.substring(1);
        } else if (url.startsWith('http') && url.includes(new URL(baseUrl).hostname)) {
          return url;
        }
        return null;
      })
      .filter(url => url !== null && url !== pageUrl) // Remove nulls and self-links
      .filter((url, index, self) => self.indexOf(url) === index); // Remove duplicates
    
    console.log(`🔗 Extracted ${internalLinks.length} internal links from ${pageUrl}`);
    return internalLinks as string[];
    
  } catch (error) {
    console.log(`Link extraction failed for ${pageUrl}:`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

// Simplified relevance calculation for manual search
function calculateSimpleRelevance(page: any, searchTerms: string[]): number {
  let score = 0;
  const title = (page.title || '').toLowerCase();
  const description = (page.description || '').toLowerCase();
  const url = (page.url || '').toLowerCase();
  
  for (const term of searchTerms) {
    const termLower = term.toLowerCase();
    
    // Title matches (highest weight)
    if (title.includes(termLower)) score += 100;
    
    // Description matches
    if (description.includes(termLower)) score += 50;
    
    // URL matches
    if (url.includes(termLower)) score += 25;
  }
  
  return score;
}

// Helper functions for content discovery
async function discoverFromSitemap(websiteUrl: string): Promise<string[]> {
  try {
    const sitemapUrl = `${websiteUrl}/sitemap.xml`;
    const response = await fetch(sitemapUrl);
    
    if (!response.ok) return [];
    
    const xml = await response.text();
    const urlMatches = xml.match(/<loc>(.*?)<\/loc>/g) || [];
    
    return urlMatches
      .map(match => match.replace(/<\/?loc>/g, ''))
      .filter(url => url.startsWith('http'));
      
  } catch (error) {
    console.log('Sitemap discovery failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

// Helper function to decode HTML entities
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

function extractTitle(html: string): string {
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const rawTitle = titleMatch ? titleMatch[1].trim() : '';
  return decodeHtmlEntities(rawTitle);
}

function extractDescription(html: string): string {
  const descMatch = html.match(/<meta[^>]*name=['"]*description['"]*[^>]*content=['"]*([^'"]*)['"]*[^>]*>/i);
  const rawDescription = descMatch ? descMatch[1].trim() : '';
  return decodeHtmlEntities(rawDescription);
}

function extractTextContent(html: string): string {
  // Remove scripts, styles, and HTML tags
  const cleanText = html
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 2000); // Limit content length for performance
  
  return decodeHtmlEntities(cleanText);
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let verifiedUser;
    try {
      verifiedUser = await getAuth().verifyIdToken(idToken);
    } catch (error) {
      console.error('Token verification failed:', error);
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    // Parse request body
    const { websiteUrl, searchTerm } = await request.json();
    
    if (!websiteUrl || !searchTerm) {
      return NextResponse.json({
        error: 'Missing required fields: websiteUrl, searchTerm'
      }, { status: 400 });
    }

    console.log(`🔍 Unified search request: "${searchTerm}" on ${websiteUrl}`);
    
    // Perform comprehensive website content discovery for all page types
    const discoveredPages = await searchWebsiteContentComprehensive(websiteUrl, searchTerm);
    
    console.log(`✅ Found ${discoveredPages.length} relevant pages`);

    return NextResponse.json({
      success: true,
      pages: discoveredPages,
      searchTerm,
      totalFound: discoveredPages.length,
      pageTypes: [...new Set(discoveredPages.map(p => p.pageType))] // Summary of page types found
    });

  } catch (error) {
    console.error('Search website content error:', error);
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 });
  }
} 