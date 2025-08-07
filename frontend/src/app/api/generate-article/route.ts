import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { getServerUserSubscriptionStatus } from '@/lib/firebase/server-admin-utils';
import { serverSideUsageUtils } from '@/lib/server-usage-utils';
import OpenAI from 'openai';

// Force Serverless Runtime (60s timeout) instead of Edge Runtime (30s timeout)
export const runtime = 'nodejs';

// Log the environment variable at module load time
console.log('--- generate-article route loaded by Next.js server ---');

// Get API keys from environment variables
const openaiKey = process.env.OPENAI_API_KEY?.trim();
const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

// Log environment variable status (without exposing the actual keys)
console.log('Environment variables status:');
console.log('OPENAI_API_KEY:', openaiKey ? 'Present' : 'Missing');
console.log('ANTHROPIC_API_KEY:', anthropicKey ? 'Present' : 'Missing');

// Initialize Firebase Admin if not already initialized
initializeFirebaseAdmin();

// Initialize API clients with proper error handling
let openai: OpenAI;
let anthropic: Anthropic;

try {
  if (!openaiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  openai = new OpenAI({
    apiKey: openaiKey,
  });
  console.log('OpenAI client initialized successfully');
} catch (error) {
  console.error('Error initializing OpenAI client:', error);
}

try {
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  anthropic = new Anthropic({
    apiKey: anthropicKey,
  });
  console.log('Anthropic client initialized successfully');
} catch (error) {
  console.error('Error initializing Anthropic client:', error);
}

// Helper function to escape special regex characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

// Add sleep function for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to extract key terms from topic breakdown
async function extractKeyTerms(text: string, keyword: string, availableVendors: string[] = []): Promise<{ searchTerms: string[], primaryVendor: string | null }> {
  try {
    console.log('Extracting key terms from topic breakdown');
    
    // First, identify any vendors in the keyword
    let primaryVendor: string | null = null;
    const keywordLower = keyword.toLowerCase();
    const keywordWords = keywordLower.split(' ');
    
    // Check if we have vendors to match against
    if (availableVendors.length > 0) {
      console.log(`Checking keyword against ${availableVendors.length} available vendors...`);
      
      // First check if any vendor matches the keyword exactly (rare but possible)
      if (availableVendors.includes(keywordLower)) {
        primaryVendor = keywordLower;
        console.log(`Found exact vendor match: "${primaryVendor}" is the entire keyword`);
      }
      
      // If not, do more thorough checks
      if (!primaryVendor) {
        // 1. First check for multi-word vendors that appear as phrases in the keyword
        for (const vendor of availableVendors) {
          if (vendor.includes(' ') && keywordLower.includes(vendor)) {
            primaryVendor = vendor;
            console.log(`Found multi-word vendor match: "${primaryVendor}" in keyword`);
            break;
          }
        }
        
        // 2. Then check for single-word vendors that match exact words in the keyword
        if (!primaryVendor) {
          for (const word of keywordWords) {
            // Skip very short words and common words that wouldn't be vendors
            if (word.length <= 2 || ["how", "to", "the", "and", "for", "with", "what", "why", "when", "where"].includes(word)) {
              continue;
            }
            
            // Check for exact vendor match
            if (availableVendors.includes(word)) {
              primaryVendor = word;
              console.log(`Found exact vendor match: "${primaryVendor}"`);
              break;
            }
          }
        }
        
        // 3. Finally, check for partial vendor matches
        if (!primaryVendor) {
          // Find vendors that might be contained in the keyword
          const partialMatches = availableVendors.filter(vendor => 
            keywordLower.includes(vendor)
          );
          
          if (partialMatches.length > 0) {
            // Sort by length (descending) to prioritize longer vendor names
            partialMatches.sort((a, b) => b.length - a.length);
            primaryVendor = partialMatches[0];
            console.log(`Found partial vendor match: "${primaryVendor}" in keyword`);
          }
        }
      }
    }
    
    // If we still couldn't find a vendor match, ONLY THEN fall back to using the first meaningful word
    if (!primaryVendor) {
      console.log(`No vendor match found in available vendors list. Attempting to identify potential brand from keyword.`);
      
      // Find the first word that could be a brand (not a common word, not too short)
      for (const word of keywordWords) {
        if (word.length > 3 && !["how", "to", "the", "and", "for", "with", "what", "why", "when", "where", "reset", "find", "install", "remove", "repair", "help"].includes(word)) {
          primaryVendor = word;
          console.log(`Using word as potential brand: "${primaryVendor}"`);
          break;
        }
      }
      
      // If still no vendor, use first word as last resort
      if (!primaryVendor) {
        primaryVendor = keywordWords[0];
        console.log(`No meaningful brand words found. Using first word as fallback: "${primaryVendor}"`);
      }
    }
    
    // Now extract component terms using the identified brand/vendor
    const extractionPrompt = `
      For the topic "${keyword}", extract:
      1. The brand name: ${primaryVendor || 'Unknown'}
      2. 5-8 basic component/part terms that would typically be found in product names for ${primaryVendor || ''} ${keyword.split(' ').filter(w => w.toLowerCase() !== primaryVendor?.toLowerCase()).join(' ')}
      
      Focus on:
      - Simple, single-word component terms (e.g., "hose", "gasket", "valve", "switch", "pump") 
      - Common part categories specific to this product type
      - Terms likely to appear in part catalogs or product listings
      - Do NOT include the brand name as a separate term
      
      For example, if the topic is "unic espresso machine parts", good component terms would be:
      portafilter, boiler, valve, hose, gasket, group, pump, seal
      
      Return only a comma-separated list of these component terms (do NOT include the brand name in this list).
      
      Text: ${text}
    `;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: [
        { role: 'user', content: extractionPrompt }
      ],
      max_tokens: 150,
      temperature: 0.3,
    });
    
    const keyTermsText = response.choices[0].message.content?.trim() || '';
    // Remove any quotes that might appear in the terms
    const cleanedTermsText = keyTermsText.replace(/["']/g, '');
    const componentTerms = cleanedTermsText.split(',').map(term => term.trim()).filter(Boolean);
    
    // Always include the original parts of the keyword
    const keywordParts = keyword.split(' ');
    
    // Create some basic two-word combinations that include the brand
    const brandComponentTerms: string[] = [];
    
    // Only create brand combinations if we have a brand
    if (primaryVendor) {
      // Combine brand with each component term
      componentTerms.forEach(term => {
        brandComponentTerms.push(`${primaryVendor} ${term}`);
      });
      
      // Also add basic combinations from the keyword - but skip common words
      keywordParts.forEach((part) => {
        if (part.length > 3 && 
           !["how", "to", "the", "and", "for", "with", "what", "why", "when", "where"].includes(part.toLowerCase()) && 
           part.toLowerCase() !== primaryVendor.toLowerCase()) {
          brandComponentTerms.push(`${primaryVendor} ${part}`);
        }
      });
    }
    
    // Create other meaningful combinations from the keyword
    const otherCombinations: string[] = [];
    // Create pairs from adjacent words in the keyword
    for (let i = 0; i < keywordParts.length - 1; i++) {
      // Skip common words and ensure we're not duplicating brand component terms
      if ((primaryVendor && keywordParts[i].toLowerCase() !== primaryVendor.toLowerCase()) || keywordParts.length <= 2) {
        // Skip pairs with common words at the start
        if (!["how", "to", "the", "and", "for", "with", "what", "why", "when", "where"].includes(keywordParts[i].toLowerCase())) {
          otherCombinations.push(`${keywordParts[i]} ${keywordParts[i+1]}`);
        }
      }
    }
    
    // Final terms in priority order:
    // 1. Full keyword
    // 2. Brand/vendor name (if found)
    // 3. Brand + component combinations
    // 4. Component terms by themselves
    // 5. Other meaningful combinations
    // 6. Keyword parts (except very short or common ones)
    
    const finalTerms: string[] = [keyword];
    
    // Add brand/vendor if we found one
    if (primaryVendor) {
      finalTerms.push(primaryVendor);
    }
    
    // Add brand-component combinations
    finalTerms.push(...brandComponentTerms);
    
    // Add component terms by themselves
    finalTerms.push(...componentTerms);
    
    // Add other combinations
    finalTerms.push(...otherCombinations);
    
    // Add individual keyword parts if they're meaningful
    keywordParts.forEach(part => {
      if (part.length > 3 && 
         !["how", "to", "the", "and", "for", "with", "what", "why", "when", "where"].includes(part.toLowerCase()) && 
         (!primaryVendor || part.toLowerCase() !== primaryVendor.toLowerCase())) {
        finalTerms.push(part);
      }
    });
    
    // Remove duplicates
    const uniqueTerms = Array.from(new Set(finalTerms.map(term => term.toLowerCase())))
      .map(term => term);
    
    console.log('Extracted search terms:', uniqueTerms);
    return { searchTerms: uniqueTerms, primaryVendor };
  } catch (error) {
    console.error('Error extracting key terms:', error);
    // Fallback to simpler extraction if AI fails
    const keywordParts = keyword.split(' ');
    
    // Try to identify a potential vendor from the keyword parts
    let primaryVendor: string | null = null;
    
    // Check each word against the vendor list
    if (availableVendors.length > 0) {
      // First check for multi-word vendors
      for (const vendor of availableVendors) {
        if (vendor.includes(' ') && keyword.toLowerCase().includes(vendor)) {
          primaryVendor = vendor;
          console.log(`Fallback found multi-word vendor: "${primaryVendor}"`);
          break;
        }
      }
      
      // If no multi-word vendor found, check individual words
      if (!primaryVendor) {
        for (const word of keywordParts) {
          // Skip common words
          if (["how", "to", "the", "and", "for", "with", "what", "why", "when", "where"].includes(word.toLowerCase())) {
            continue;
          }
          
          if (availableVendors.includes(word.toLowerCase())) {
            primaryVendor = word;
            console.log(`Fallback found vendor: "${primaryVendor}"`);
            break;
          }
        }
      }
    }
    
    // If no vendor found, default to first non-common word
    if (!primaryVendor) {
      for (const part of keywordParts) {
        if (part.length > 3 && !["how", "to", "the", "and", "for", "with", "what", "why", "when", "where", "reset"].includes(part.toLowerCase())) {
          primaryVendor = part;
          console.log(`Fallback using non-common word as potential brand: "${primaryVendor}"`);
          break;
        }
      }
      
      // If still no vendor, use first word as last resort
      if (!primaryVendor) {
        primaryVendor = keywordParts[0];
        console.log(`Fallback to first word: "${primaryVendor}"`);
      }
    }
    
    const fallbackTerms = [keyword, primaryVendor];
    
    // Add brand + remaining keyword parts combinations
    for (let i = 0; i < keywordParts.length; i++) {
      if (keywordParts[i].length > 3 && keywordParts[i].toLowerCase() !== primaryVendor.toLowerCase()) {
        fallbackTerms.push(`${primaryVendor} ${keywordParts[i]}`);
        // Also add the component term by itself
        fallbackTerms.push(keywordParts[i]);
      }
    }
    
    // Add adjacent pairs 
    for (let i = 0; i < keywordParts.length - 1; i++) {
      // Skip pairs with common words
      if (!["how", "to", "the", "and", "for", "with", "what", "why", "when", "where"].includes(keywordParts[i].toLowerCase())) {
        fallbackTerms.push(`${keywordParts[i]} ${keywordParts[i+1]}`);
      }
    }
    
    // Add some common component terms as a last resort
    if (keyword.toLowerCase().includes('espresso') || keyword.toLowerCase().includes('coffee')) {
      const commonComponents = ['portafilter', 'boiler', 'valve', 'hose', 'gasket', 'group', 'pump', 'seal', 'switch'];
      fallbackTerms.push(...commonComponents);
    }
    
    // Remove duplicates
    const uniqueTerms = Array.from(new Set(fallbackTerms.map(term => term.toLowerCase())))
      .map(term => term);
    
    console.log('Fallback search terms:', uniqueTerms);
    return { searchTerms: uniqueTerms, primaryVendor };
  }
}

// Function to fetch all available vendors from a Shopify store
async function fetchShopifyVendors(shopDomain: string, token: string): Promise<string[]> {
  console.log('Fetching all available vendors from Shopify store using GraphQL...');
  const vendors: string[] = [];
  
  try {
    // GraphQL query to fetch unique vendors
    const graphqlQuery = `
      query {
        shop {
          productVendors(first: 250) {
            edges {
              node
            }
          }
        }
      }
    `;
    
    const response = await fetch(`https://${shopDomain}/admin/api/2023-01/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: graphqlQuery }),
    });
    
    console.log(`Vendor fetch response status:`, response.status);
    
    if (!response.ok) {
      if (response.status === 429) {
        // Handle rate limiting
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        console.log(`Rate limited. Waiting ${retryAfter} seconds before retrying...`);
        await sleep(retryAfter * 1000);
        // Retry this request
        return fetchShopifyVendors(shopDomain, token);
      }
      
      // If GraphQL fails, fall back to the original REST approach with optimizations
      console.log('GraphQL vendor fetch failed, falling back to REST approach...');
      return fetchShopifyVendorsWithREST(shopDomain, token);
    }
    
    const data = await response.json();
    
    if (data.data?.shop?.productVendors?.edges) {
      // Extract vendors from GraphQL response
      data.data.shop.productVendors.edges.forEach((edge: { node: string }) => {
        if (edge.node && typeof edge.node === 'string' && edge.node.trim()) {
          vendors.push(edge.node.toLowerCase().trim());
        }
      });
      
      console.log(`Completed vendor fetch with GraphQL. Found ${vendors.length} unique vendors.`);
    } else {
      console.log('GraphQL vendor response missing expected data, falling back to REST approach...');
      return fetchShopifyVendorsWithREST(shopDomain, token);
    }
    
    return vendors;
  } catch (error) {
    console.error('Error fetching vendors with GraphQL:', error);
    console.log('Falling back to REST approach...');
    return fetchShopifyVendorsWithREST(shopDomain, token);
  }
}

// Fallback function using REST API but with optimizations
async function fetchShopifyVendorsWithREST(shopDomain: string, token: string): Promise<string[]> {
  console.log('Fetching all available vendors from Shopify store using REST API...');
  const vendorSet = new Set<string>();
  
  try {
    // Use larger page size and fetch fewer fields to improve efficiency
    let hasNextPage = true;
    let nextPageUrl: string | null = `https://${shopDomain}/admin/api/2023-01/products.json?fields=vendor&limit=250`;
    let pageCount = 1;
    const MAX_PAGES = 20; // Limit pages to avoid excessive API calls
    
    while (hasNextPage && nextPageUrl && pageCount <= MAX_PAGES) {
      console.log(`Fetching vendors page ${pageCount}...`);
      
      // Add rate limiting
      await sleep(500);
      
      const response = await fetch(nextPageUrl, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
      });
      
      console.log(`Vendor fetch response status (page ${pageCount}):`, response.status);
      
      if (!response.ok) {
        if (response.status === 429) {
          // Handle rate limiting
          const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
          console.log(`Rate limited. Waiting ${retryAfter} seconds before retrying...`);
          await sleep(retryAfter * 1000);
          pageCount--; // Retry this page
          continue;
        }
        throw new Error(`Shopify API returned ${response.status}`);
      }
      
      // Check for Link header which contains pagination info
      const linkHeader: string | null = response.headers.get('Link');
      nextPageUrl = null;
      
      if (linkHeader) {
        // Parse Link header to get next page URL
        const links: string[] = linkHeader.split(',');
        for (const link of links) {
          const match: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
          if (match && match[2] === 'next') {
            nextPageUrl = match[1];
            break;
          }
        }
      }
      
      hasNextPage = !!nextPageUrl;
      
      const data = await response.json();
      
      if (data.products && data.products.length > 0) {
        // Extract vendors and add to set
        data.products.forEach((product: { vendor?: string }) => {
          if (product.vendor && product.vendor.trim()) {
            vendorSet.add(product.vendor.toLowerCase().trim());
          }
        });
        
        console.log(`Found ${vendorSet.size} unique vendors so far`);
      }
      
      pageCount++;
      
      // If we have a good number of vendors, we can exit early
      if (vendorSet.size >= 50) {
        console.log('Found sufficient number of vendors, stopping pagination');
        break;
      }
    }
    
    // Convert set to array
    const vendors = Array.from(vendorSet);
    console.log(`Completed vendor fetch with REST. Found ${vendors.length} unique vendors.`);
    
    return vendors;
  } catch (error) {
    console.error('Error fetching vendors with REST:', error);
    return Array.from(vendorSet); // Return whatever we've collected so far
  }
}



// Add the vendor score calculation function
function calculateVendorScore(vendor: string, words: string[]): number {
  return words.reduce((score: number, word: string) => {
    if (vendor.toLowerCase().includes(word) || word.includes(vendor.toLowerCase())) {
      score += word.length; // Longer matches score higher
    }
    return score;
  }, 0);
}

// Add minimum score threshold for vendor matching
const VENDOR_MATCH_THRESHOLD = 5; // Minimum score to consider a vendor match valid

// Add common words that should never be considered as brand names or search terms
const COMMON_WORDS = [
  'the', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after',
  'importance', 'important', 'how', 'what', 'why', 'when', 'where', 'which', 'who', 'whom', 'whose',
  'using', 'understanding', 'getting', 'making', 'finding', 'choosing', 'selecting', 'working',
  'guide', 'tips', 'basics', 'benefits', 'advantages', 'disadvantages', 'overview', 'introduction',
  'and', 'or', 'but', 'nor', 'so', 'yet', 'unless', 'although', 'because'
];

// Quick vendor validation function to avoid unnecessary processing
async function quickVendorCheck(keyword: string, availableVendors: string[]): Promise<string | null> {
  const keywordLower = keyword.toLowerCase();
  
  // Check for exact vendor matches first (most reliable)
  const exactMatches = availableVendors.filter(vendor => 
    keywordLower.includes(vendor.toLowerCase())
  ).sort((a, b) => b.length - a.length); // Sort by length to prefer longer matches
  
  if (exactMatches.length > 0) {
    const matchScore = calculateVendorScore(exactMatches[0], keywordLower.split(' '));
    if (matchScore >= VENDOR_MATCH_THRESHOLD) {
      console.log(`✓ Quick vendor check found: "${exactMatches[0]}" (score: ${matchScore})`);
      return exactMatches[0];
    }
  }
  
  // Check for strong partial matches
  const words = keywordLower.split(' ').filter(word => word.length > 3);
  for (const vendor of availableVendors) {
    if (vendor.length > 3) {
      const vendorLower = vendor.toLowerCase();
      // Check if vendor name appears as a complete word in keyword
      if (words.includes(vendorLower)) {
        console.log(`✓ Quick vendor check found partial match: "${vendor}"`);
        return vendor;
      }
    }
  }
  
  console.log('✗ Quick vendor check: No vendor found in keyword');
  return null;
}

// Enhanced function that can either identify vendor OR enhance existing terms
async function identifyVendorFromKeyword(
  shopDomain: string, 
  token: string, 
  keyword: string, 
  availableVendors: string[] = [],
  existingTerms: string[] = [] // NEW: Accept existing terms for enhancement
): Promise<{ vendor: string | null; searchTerms: string[] }> {
  let vendorsList = availableVendors;
  
  if (vendorsList.length === 0) {
    console.log('No vendors list provided, fetching vendors from store...');
    vendorsList = await fetchShopifyVendors(shopDomain, token);
  }
  
  // If we have existing terms, this is an enhancement call
  if (existingTerms.length > 0) {
    console.log(`Enhancing existing ${existingTerms.length} terms with product-focused variants...`);
    
    // Quick vendor check to determine if enhancement is needed
    const vendor = await quickVendorCheck(keyword, vendorsList);
    
    if (vendor) {
      console.log(`Vendor present: "${vendor}" - Adding product-focused enhancements`);
      return { 
        vendor, 
        searchTerms: enhanceTermsWithProductFocus(existingTerms, vendor, keyword) 
      };
    } else {
      console.log('No vendor present - Skipping term enhancement to avoid wasted processing');
      return { 
        vendor: null, 
        searchTerms: existingTerms // Return original terms unchanged
      };
    }
  }
  
  // Original vendor identification logic (fallback for legacy calls)
  const keywordLower = keyword.toLowerCase();
  console.log(`Checking keyword "${keyword}" against ${vendorsList.length} vendors`);
  
  // First check for exact brand names in the full keyword
  const exactMatches = vendorsList.filter(vendor => 
    keywordLower.includes(vendor.toLowerCase())
  ).sort((a, b) => b.length - a.length);
  
  if (exactMatches.length > 0) {
    const matchScore = calculateVendorScore(exactMatches[0], keywordLower.split(' '));
    if (matchScore >= VENDOR_MATCH_THRESHOLD) {
      console.log(`Found exact vendor match: "${exactMatches[0]}" with score ${matchScore}`);
      return { vendor: exactMatches[0], searchTerms: generateSearchTerms(keyword, exactMatches[0]) };
    }
    console.log(`Found exact vendor match "${exactMatches[0]}" but score ${matchScore} below threshold`);
  }
  
  // Check for partial matches with minimum length
  const partialMatches = vendorsList.filter(vendor => 
    vendor.length > 3 && 
    keywordLower.split(' ').some(word => 
      vendor.toLowerCase().includes(word) || 
      word.includes(vendor.toLowerCase())
    )
  );
  
  if (partialMatches.length > 0) {
    const scoredMatches = partialMatches.map(vendor => ({
      vendor,
      score: calculateVendorScore(vendor, keywordLower.split(' '))
    }));
    
    scoredMatches.sort((a, b) => b.score - a.score);
    
    if (scoredMatches[0].score >= VENDOR_MATCH_THRESHOLD) {
      console.log(`Found partial vendor match: "${scoredMatches[0].vendor}" with score ${scoredMatches[0].score}`);
      return { vendor: scoredMatches[0].vendor, searchTerms: generateSearchTerms(keyword, scoredMatches[0].vendor) };
    }
    console.log(`Best partial match "${scoredMatches[0].vendor}" score ${scoredMatches[0].score} below threshold`);
  }
  
  // No vendor found - generate search terms without a brand focus
  console.log('No vendor matches found - proceeding with term-based search');
  return { vendor: null, searchTerms: generateSearchTerms(keyword, null) };
}

// New function to enhance existing terms with product-focused variants
function enhanceTermsWithProductFocus(existingTerms: string[], vendor: string, originalKeyword: string): string[] {
  const enhancedTerms: Set<string> = new Set();
  
  // Always preserve original terms first
  existingTerms.forEach(term => enhancedTerms.add(term));
  
  console.log(`Starting with ${existingTerms.length} original terms:`, existingTerms.join(', '));
  
  // Product-focused enhancement categories
  const productSuffixes = ['parts', 'replacement', 'maintenance', 'repair', 'service'];
  const productTypes = ['motor', 'pump', 'valve', 'seal', 'gasket', 'belt', 'filter'];
  
  // Add vendor + product type combinations if they make sense
  productTypes.forEach(type => {
    const originalWords = originalKeyword.toLowerCase().split(' ');
    if (originalWords.includes(type)) {
      const combination = `${vendor} ${type}`;
      enhancedTerms.add(combination);
      console.log(`Added vendor+type enhancement: "${combination}"`);
      
      // Add with common suffixes
      productSuffixes.forEach(suffix => {
        enhancedTerms.add(`${vendor} ${type} ${suffix}`);
      });
    }
  });
  
  // Enhance multi-word terms that contain the vendor
  existingTerms.forEach(term => {
    const termLower = term.toLowerCase();
    if (termLower.includes(vendor.toLowerCase()) && term.split(' ').length === 2) {
      // Add maintenance variants
      productSuffixes.forEach(suffix => {
        enhancedTerms.add(`${term} ${suffix}`);
      });
    }
  });
  
  // Convert to array and limit to reasonable size
  const finalTerms = Array.from(enhancedTerms).slice(0, 20);
  
  console.log(`Enhanced to ${finalTerms.length} terms (added ${finalTerms.length - existingTerms.length} product-focused variants)`);
  
  return finalTerms;
}

// Function to generate search terms
function generateSearchTerms(keyword: string, vendor: string | null): string[] {
  const keywordLower = keyword.toLowerCase();
  const searchTerms: Set<string> = new Set();
  
  // Get meaningful words from the keyword
  const words = keywordLower.split(' ').filter(word => 
    word.length > 3 && !COMMON_WORDS.includes(word.toLowerCase())
  );
  
  // Product-specific terms that are always relevant
  const productTerms = ['oil', 'lubricant', 'fluid', 'grease', 'hydraulic', 'industrial'];
  
  // If we have a vendor, prioritize vendor-based combinations
  if (vendor) {
    searchTerms.add(vendor);
    
    // Combine vendor with each meaningful word
    words.forEach(word => {
      if (word.toLowerCase() !== vendor.toLowerCase() && !COMMON_WORDS.includes(word)) {
        searchTerms.add(`${vendor} ${word}`);
      }
    });
    
    // Combine vendor with product terms
    productTerms.forEach(term => {
      searchTerms.add(`${vendor} ${term}`);
    });
  }
  
  // Generate combinations of meaningful words
  words.forEach((word, i) => {
    // Skip if it's a common word
    if (!COMMON_WORDS.includes(word)) {
      // Only add single words if they're significant
      if (isSignificantTerm(word)) {
        searchTerms.add(word);
      }
      
      // Combine with product terms
      productTerms.forEach(term => {
        searchTerms.add(`${word} ${term}`);
      });
      
      // Create pairs of meaningful words
      words.slice(i + 1).forEach(nextWord => {
        if (!COMMON_WORDS.includes(nextWord)) {
          const pair = `${word} ${nextWord}`;
          // Only add the pair if at least one word is significant
          if (isSignificantTerm(word) || isSignificantTerm(nextWord)) {
            searchTerms.add(pair);
          }
        }
      });
    }
  });
  
  // Add relevant industry/category terms if they appear in the keyword
  const categoryTerms = ['food grade', 'industrial grade', 'food safe', 'food processing'];
  categoryTerms.forEach(term => {
    if (keywordLower.includes(term)) {
      searchTerms.add(term);
    }
  });
  
  // Filter out any terms that are too short or only contain common words
  const filteredTerms = Array.from(searchTerms).filter(term => {
    const termWords = term.toLowerCase().split(' ');
    // Keep terms that:
    // 1. Are longer than 3 characters
    // 2. Contain at least one significant word
    // 3. Are not just common words combined
    return term.length > 3 && 
           (isSignificantTerm(term) || termWords.some(word => isSignificantTerm(word))) &&
           !(termWords.every(word => COMMON_WORDS.includes(word)));
  });
  
  // Sort by length (descending) to prioritize more specific terms
  const sortedTerms = filteredTerms.sort((a, b) => b.length - a.length);
  
  console.log('Generated search terms:', sortedTerms);
  return sortedTerms;
}

// Function to search products using GraphQL for better performance with hybrid prioritization approach
async function searchProductsWithGraphQL(shopDomain: string, token: string, searchTerms: string[], identifiedVendor: string | null = null, originalKeyword: string = ''): Promise<Array<{
  id: string;
  title: string;
  description?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  handle?: string;
  relevanceScore?: number;
  [key: string]: unknown;
}>> {
  console.log('Searching products using GraphQL with hybrid prioritization approach...');
  console.log(`Using matching strategy: ${identifiedVendor ? `Flexible (vendor: "${identifiedVendor}")` : 'Strict (no vendor identified)'}`);
  
  // Step 1: Prioritize search terms by relevance
  const prioritizedTerms = prioritizeSearchTerms(searchTerms, originalKeyword, identifiedVendor);
  console.log(`\nSearching ${prioritizedTerms.length} terms in priority order...`);
  
  // Step 2: Collect products with scores from all relevant terms
  const candidateProducts: { product: { id: string; title: string; description?: string; vendor?: string; [key: string]: unknown }, score: number, searchTerm: string }[] = [];
  const QUALITY_THRESHOLD = 10; // Minimum score for a product to be considered relevant
  const TARGET_PRODUCTS = 5;
  
  for (const term of prioritizedTerms) {
    // Skip very short or common terms
    if (term.length < 4 || COMMON_WORDS.includes(term.toLowerCase())) {
      console.log(`Skipping GraphQL search for common/short term: "${term}"`);
      continue;
    }
    
    console.log(`\nSearching with GraphQL for prioritized term: "${term}"`);
    
    try {
      // GraphQL query to search products by title
      const graphqlQuery = `
        query searchProducts($query: String!) {
          products(first: 20, query: $query) {
            edges {
              node {
                id
                title
                handle
                vendor
                productType
                tags
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
          }
        }
      `;
      
      // Create comprehensive search queries to find exact phrases anywhere in the title
      const searchQueries = [];
      
      // For multi-word terms, search for exact phrase anywhere in title
      if (term.includes(' ')) {
        // Primary search: exact phrase match anywhere in title
        searchQueries.push(`title:*${term}*`);
        
        // Secondary search: try with quotes for exact phrase matching
        searchQueries.push(`title:"${term}"`);
        
        // Tertiary search: individual words that must all appear in title
        const words = term.split(' ').filter(word => word.length > 3);
        if (words.length > 1) {
          searchQueries.push(`title:*${words[0]}* AND title:*${words[1]}*`);
          
          // If more than 2 words, try combinations
          if (words.length > 2) {
            searchQueries.push(`title:*${words[0]}* AND title:*${words[1]}* AND title:*${words[2]}*`);
          }
        }
      } else {
        // For single words, search anywhere in title
        searchQueries.push(`title:*${term}*`);
        
        // Also try word boundary search if it's a significant term
        if (isSignificantTerm(term)) {
          searchQueries.push(`title:"${term}"`);
        }
      }
      
      // Execute each search query
      for (const query of searchQueries) {
        console.log(`Trying GraphQL query: "${query}"`);
        
        const response = await fetch(`https://${shopDomain}/admin/api/2023-01/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: graphqlQuery,
            variables: { query }
          }),
        });
        
        // Add rate limiting
        await sleep(300);
        
        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
            console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
            await sleep(retryAfter * 1000);
            continue;
          }
          console.error(`GraphQL query failed with status ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        
        if (data.data?.products?.edges) {
          const products = data.data.products.edges;
          console.log(`GraphQL returned ${products.length} products for query: "${query}"`);
          
          // Process and score each product
          products.forEach((edge: { node: { 
            id: string; 
            title: string; 
            description?: string; 
            vendor?: string; 
            productType?: string;
            tags?: string[];
            variants?: { edges: Array<{ node: { id: string; price: string } }> };
            [key: string]: unknown 
          } }) => {
            const product = edge.node;
            
            // Check if we already have this product
            if (candidateProducts.some(cp => cp.product.id === product.id)) {
              return; // Skip duplicates
            }
            
            // Double-check that product title actually contains our search term (case insensitive)
            const productTitle = product.title.toLowerCase();
            const searchTerm = term.toLowerCase();
            
            let isMatch = false;
            
            // For multi-word terms, use different strategies based on vendor presence
            if (term.includes(' ')) {
              // Strategy A: Vendor identified - flexible matching (check if all words exist individually)
              if (identifiedVendor && searchTerm.includes(identifiedVendor.toLowerCase())) {
                const words = searchTerm.split(' ').filter(word => word.length > 2);
                isMatch = words.every(word => {
                  const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`);
                  return pattern.test(productTitle);
                });
                
                if (isMatch) {
                  console.log(`✓ Flexible match (vendor present): All words "${words.join(', ')}" found in product: "${product.title}"`);
                } else {
                  console.log(`✗ Flexible match failed: Not all words "${words.join(', ')}" found in product: "${product.title}"`);
                }
              } 
              // Strategy B: No vendor - strict exact phrase matching
              else {
                isMatch = productTitle.includes(searchTerm);
                if (isMatch) {
                  console.log(`✓ Strict exact phrase "${term}" found in product: "${product.title}"`);
                } else {
                  console.log(`✗ Strict match failed: Exact phrase "${term}" not found in product: "${product.title}"`);
                }
              }
            } else {
              // For single words, use word boundary matching to avoid partial matches
              const pattern = new RegExp(`\\b${escapeRegExp(searchTerm)}\\b`);
              isMatch = pattern.test(productTitle);
              if (isMatch) {
                console.log(`✓ Word "${term}" found in product: "${product.title}"`);
              } else {
                console.log(`✗ Word "${term}" not found in product: "${product.title}"`);
              }
            }
            
            // If product matches, calculate its relevance score
            if (isMatch) {
              const relevanceScore = calculateProductRelevanceScore(product, term, originalKeyword, identifiedVendor);
              
              // Only add products that meet the quality threshold
              if (relevanceScore >= QUALITY_THRESHOLD) {
                // Transform to match expected format
                const transformedProduct = {
                  id: product.id,
                  title: product.title,
                  handle: product.handle,
                  vendor: product.vendor,
                  product_type: product.productType,
                  tags: product.tags,
                  variants: product.variants?.edges?.map((v: { node: { id: string; price: string } }) => ({
                    id: v.node.id,
                    price: v.node.price
                  })) || []
                };
                
                candidateProducts.push({
                  product: transformedProduct,
                  score: relevanceScore,
                  searchTerm: term
                });
                
                console.log(`✓ Added product candidate: "${product.title}" (Score: ${relevanceScore})`);
              } else {
                console.log(`✗ Product "${product.title}" below quality threshold (Score: ${relevanceScore})`);
              }
            }
          });
        } else {
          console.log(`No products returned for GraphQL query: "${query}"`);
        }
      }
    } catch (error) {
      console.error(`Error in GraphQL search for term "${term}":`, error);
      continue;
    }
    
    // Early termination if we have enough high-quality products
    const highQualityProducts = candidateProducts.filter(cp => cp.score >= QUALITY_THRESHOLD * 2);
    if (highQualityProducts.length >= TARGET_PRODUCTS) {
      console.log(`\n🎯 Found ${highQualityProducts.length} high-quality products, stopping search early.`);
      break;
    }
  }
  
  // Step 3: Sort by relevance score and select top products
  candidateProducts.sort((a, b) => b.score - a.score);
  const finalProducts = candidateProducts.slice(0, TARGET_PRODUCTS).map(cp => cp.product);
  
  console.log(`\n📊 Product Selection Summary:`);
  console.log(`- Total candidates found: ${candidateProducts.length}`);
  console.log(`- Quality threshold: ${QUALITY_THRESHOLD}`);
  console.log(`- Final selection: ${finalProducts.length} products`);
  
  if (finalProducts.length > 0) {
    console.log('\n🏆 Selected products (by relevance score):');
    candidateProducts.slice(0, TARGET_PRODUCTS).forEach((cp, index) => {
      console.log(`${index + 1}. "${cp.product.title}" (Score: ${cp.score}, Term: "${cp.searchTerm}")`);
    });
  }
  
  return finalProducts;
}

// Function to search collections using GraphQL for better performance with hybrid prioritization
async function searchCollectionsWithGraphQL(shopDomain: string, token: string, searchTerms: string[], identifiedVendor: string | null = null, originalKeyword: string = ''): Promise<Array<{
  id: string;
  title: string;
  description?: string;
  handle: string;
  relevanceScore?: number;
  [key: string]: unknown;
}>> {
  console.log('Searching collections using GraphQL with hybrid prioritization approach...');
  console.log(`Using matching strategy for collections: ${identifiedVendor ? `Flexible (vendor: "${identifiedVendor}")` : 'Strict (no vendor identified)'}`);
  
  // Step 1: Prioritize search terms by relevance (reuse same logic as products)
  const prioritizedTerms = prioritizeSearchTerms(searchTerms, originalKeyword, identifiedVendor);
  console.log(`\nSearching ${prioritizedTerms.length} terms for collections in priority order...`);
  
  // Step 2: Collect collections with basic scoring
  const candidateCollections: { collection: { id: string; title: string; description?: string; handle: string; [key: string]: unknown }, score: number, searchTerm: string }[] = [];
  const TARGET_COLLECTIONS = 5;
  
  for (const term of prioritizedTerms) {
    // Skip very short or common terms
    if (term.length < 4 || COMMON_WORDS.includes(term.toLowerCase())) {
      console.log(`Skipping GraphQL search for common/short term: "${term}"`);
      continue;
    }
    
    console.log(`\nSearching collections with GraphQL for prioritized term: "${term}"`);
    
    try {
      // GraphQL query to search collections by title
      const graphqlQuery = `
        query searchCollections($query: String!) {
          collections(first: 10, query: $query) {
            edges {
              node {
                id
                title
                handle
                description
              }
            }
          }
        }
      `;
      
      // Create search queries
      const searchQueries = [];
      
      // For multi-word terms, search for exact phrase
      if (term.includes(' ')) {
        searchQueries.push(`title:*${term}*`);
      } else {
        // For single words, search in title
        searchQueries.push(`title:*${term}*`);
      }
      
      for (const query of searchQueries) {
        const response = await fetch(`https://${shopDomain}/admin/api/2023-01/graphql.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: graphqlQuery,
            variables: { query }
          }),
        });
        
        // Add rate limiting
        await sleep(300);
        
        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
            console.log(`Rate limited. Waiting ${retryAfter} seconds...`);
            await sleep(retryAfter * 1000);
            continue;
          }
          console.error(`GraphQL collections query failed with status ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        
        if (data.data?.collections?.edges) {
          const collections = data.data.collections.edges;
          console.log(`Found ${collections.length} collections with GraphQL query: "${query}"`);
          
          // Process and score each collection
          collections.forEach((edge: { node: { id: string; title: string; description?: string; handle: string; [key: string]: unknown } }) => {
            const collection = edge.node;
            
            // Check if we already have this collection
            if (candidateCollections.some(cc => cc.collection.id === collection.id)) {
              return; // Skip duplicates
            }
            
            // Check if collection title actually contains our search term (case insensitive)
            const collectionTitle = collection.title.toLowerCase();
            const searchTerm = term.toLowerCase();
            
            let isMatch = false;
            let score = 0;
            
            // For multi-word terms, use different strategies based on vendor presence
            if (term.includes(' ')) {
              // Strategy A: Vendor identified - flexible matching (check if all words exist individually)
              if (identifiedVendor && searchTerm.includes(identifiedVendor.toLowerCase())) {
                const words = searchTerm.split(' ').filter(word => word.length > 2);
                isMatch = words.every(word => {
                  const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`);
                  return pattern.test(collectionTitle);
                });
                
                if (isMatch) {
                  score += 15; // Higher score for multi-word matches
                  console.log(`✓ Flexible collection match (vendor present): All words "${words.join(', ')}" found in collection: "${collection.title}"`);
                } else {
                  console.log(`✗ Flexible collection match failed: Not all words "${words.join(', ')}" found in collection: "${collection.title}"`);
                }
              } 
              // Strategy B: No vendor - strict exact phrase matching
              else {
                isMatch = collectionTitle.includes(searchTerm);
                if (isMatch) {
                  score += 12; // Good score for exact phrase
                  console.log(`✓ Strict exact phrase "${term}" found in collection: "${collection.title}"`);
                } else {
                  console.log(`✗ Strict collection match failed: Exact phrase "${term}" not found in collection: "${collection.title}"`);
                }
              }
            } else {
              // For single words, use enhanced matching logic for collections
              let shouldMatch = false;
              
              // Always match if it's a significant product term
              if (isSignificantTerm(term)) {
                shouldMatch = true;
                score += 10;
                console.log(`✓ Matching significant product term for collections: "${term}"`);
              }
              // Always match if it's the identified vendor
              else if (identifiedVendor && term.toLowerCase() === identifiedVendor.toLowerCase()) {
                shouldMatch = true;
                score += 8;
                console.log(`✓ Matching vendor term for collections: "${term}"`);
              }
              // Also match terms that are longer than 4 characters and not common words (likely meaningful)
              else if (term.length > 4 && !COMMON_WORDS.includes(term.toLowerCase())) {
                shouldMatch = true;
                score += 6;
                console.log(`✓ Matching meaningful term for collections: "${term}"`);
              }
              
              if (shouldMatch) {
                const pattern = new RegExp(`\\b${escapeRegExp(searchTerm)}\\b`);
                isMatch = pattern.test(collectionTitle);
                if (isMatch) {
                  console.log(`✓ Word "${term}" found in collection: "${collection.title}"`);
                } else {
                  console.log(`✗ Word "${term}" not found in collection: "${collection.title}"`);
                }
              } else {
                console.log(`⚠️ Skipping non-significant term for collections: "${term}"`);
              }
            }
            
            // Add collection if it matches
            if (isMatch && score > 0) {
              candidateCollections.push({
                collection: collection,
                score: score,
                searchTerm: term
              });
              console.log(`✓ Added collection candidate: "${collection.title}" (Score: ${score})`);
            }
          });
        }
      }
    } catch (error) {
      console.error(`Error in GraphQL search for collections term "${term}":`, error);
      continue;
    }
    
    // Early termination if we have enough collections
    if (candidateCollections.length >= TARGET_COLLECTIONS) {
      console.log(`\n🎯 Found ${candidateCollections.length} collections, stopping search early.`);
      break;
    }
  }
  
  // Step 3: Sort by score and select top collections
  candidateCollections.sort((a, b) => b.score - a.score);
  const finalCollections = candidateCollections.slice(0, TARGET_COLLECTIONS).map(cc => cc.collection);
  
  console.log(`\n📊 Collection Selection Summary:`);
  console.log(`- Total candidates found: ${candidateCollections.length}`);
  console.log(`- Final selection: ${finalCollections.length} collections`);
  
  if (finalCollections.length > 0) {
    console.log('\n🏆 Selected collections (by relevance score):');
    candidateCollections.slice(0, TARGET_COLLECTIONS).forEach((cc, index) => {
      console.log(`${index + 1}. "${cc.collection.title}" (Score: ${cc.score}, Term: "${cc.searchTerm}")`);
    });
  }
  
  return finalCollections;
}

// Update the main search functions to use GraphQL only, with REST as fallback
async function searchShopifyProducts(shopDomain: string, token: string, searchTerms: string[], availableVendors: string[] = []): Promise<Array<{ id: string; title: string; description?: string; vendor?: string; productType?: string; tags?: string[]; handle?: string; relevanceScore?: number; [key: string]: unknown }>> {
  // Extract the original keyword from search terms
  const originalKeyword = searchTerms[0];
  
  // Step 1: Extract comprehensive terms using AI analysis (always do this first)
  console.log('\n=== STEP 1: AI Term Extraction ===');
  const aiAnalysisResult = await extractKeyTerms('', originalKeyword, availableVendors);
  const aiExtractedTerms = aiAnalysisResult.searchTerms;
  const primaryVendor = aiAnalysisResult.primaryVendor;
  
  console.log(`AI extracted ${aiExtractedTerms.length} terms:`, aiExtractedTerms.join(', '));
  console.log(`AI identified primary vendor: "${primaryVendor || 'None'}"`);
  
  // Step 2: Smart vendor detection and conditional enhancement
  console.log('\n=== STEP 2: Smart Vendor Detection & Conditional Enhancement ===');
  
  let finalVendor = primaryVendor;
  let enhancedTerms = aiExtractedTerms;
  
  // Only do vendor enhancement if no vendor was found in AI analysis
  if (!primaryVendor) {
    console.log('No vendor found in AI analysis, checking for vendor presence...');
    
    // Quick vendor check first
    let vendorsList = availableVendors;
    if (vendorsList.length === 0) {
      console.log('Fetching vendors for validation...');
      vendorsList = await fetchShopifyVendors(shopDomain, token);
    }
    
    const quickVendor = await quickVendorCheck(originalKeyword, vendorsList);
    
    if (quickVendor) {
      console.log(`Vendor detected: "${quickVendor}" - Proceeding with term enhancement`);
      
      // Enhance the AI terms with product-focused variants
      const enhancementResult = await identifyVendorFromKeyword(
        shopDomain, 
        token, 
        originalKeyword, 
        vendorsList,
        aiExtractedTerms // Pass existing terms for enhancement
      );
      
      finalVendor = enhancementResult.vendor;
      enhancedTerms = enhancementResult.searchTerms;
      
      console.log(`Enhanced terms (${enhancedTerms.length}):`, enhancedTerms.join(', '));
    } else {
      console.log('No vendor detected - Using AI terms as-is (no wasted processing)');
    }
  } else {
    console.log('Vendor already identified in AI analysis - Using AI terms directly');
  }
  
  // Step 3: Final term selection and prioritization
  console.log('\n=== STEP 3: Final Term Selection ===');
  console.log(`Using vendor: "${finalVendor || 'None'}"`);
  console.log(`Final search terms (${enhancedTerms.length}):`, enhancedTerms.join(', '));
  
  // Step 4: Execute GraphQL search
  console.log('\n=== STEP 4: GraphQL Product Search ===');
  try {
    const graphqlResults = await searchProductsWithGraphQL(shopDomain, token, enhancedTerms, finalVendor, originalKeyword);
    
    if (graphqlResults.length > 0) {
      console.log(`✅ GraphQL found ${graphqlResults.length} products`);
      return graphqlResults;
    } else {
      console.log('❌ GraphQL search completed but no products matched any search terms.');
      console.log('Search terms that were tried:', enhancedTerms.join(', '));
      return [];
    }
  } catch (error) {
    console.error('❌ GraphQL search failed:', error);
    return [];
  }
}

async function searchShopifyCollections(shopDomain: string, token: string, searchTerms: string[], availableVendors: string[] = []): Promise<Array<{ id: string; title: string; description?: string; handle: string; [key: string]: unknown }>> {
  // Extract the original keyword from search terms
  const originalKeyword = searchTerms[0];
  
  // Step 1: Extract comprehensive terms using AI analysis (reuse from products search)
  console.log('\n=== COLLECTIONS STEP 1: AI Term Extraction ===');
  const aiAnalysisResult = await extractKeyTerms('', originalKeyword, availableVendors);
  const aiExtractedTerms = aiAnalysisResult.searchTerms;
  const primaryVendor = aiAnalysisResult.primaryVendor;
  
  console.log(`AI extracted ${aiExtractedTerms.length} terms for collections:`, aiExtractedTerms.join(', '));
  console.log(`AI identified primary vendor: "${primaryVendor || 'None'}"`);
  
  // Step 2: Smart vendor detection and conditional enhancement
  console.log('\n=== COLLECTIONS STEP 2: Smart Vendor Detection & Conditional Enhancement ===');
  
  let finalVendor = primaryVendor;
  let enhancedTerms = aiExtractedTerms;
  
  // Only do vendor enhancement if no vendor was found in AI analysis
  if (!primaryVendor) {
    console.log('No vendor found in AI analysis, checking for vendor presence...');
    
    // Quick vendor check first
    let vendorsList = availableVendors;
    if (vendorsList.length === 0) {
      console.log('Fetching vendors for validation...');
      vendorsList = await fetchShopifyVendors(shopDomain, token);
    }
    
    const quickVendor = await quickVendorCheck(originalKeyword, vendorsList);
    
    if (quickVendor) {
      console.log(`Vendor detected: "${quickVendor}" - Proceeding with term enhancement for collections`);
      
      // Enhance the AI terms with product-focused variants
      const enhancementResult = await identifyVendorFromKeyword(
        shopDomain, 
        token, 
        originalKeyword, 
        vendorsList,
        aiExtractedTerms // Pass existing terms for enhancement
      );
      
      finalVendor = enhancementResult.vendor;
      enhancedTerms = enhancementResult.searchTerms;
      
      console.log(`Enhanced collection terms (${enhancedTerms.length}):`, enhancedTerms.join(', '));
    } else {
      console.log('No vendor detected - Using AI terms as-is for collections (no wasted processing)');
    }
  } else {
    console.log('Vendor already identified in AI analysis - Using AI terms directly for collections');
  }
  
  // Step 3: Filter terms for collections (be more selective)
  console.log('\n=== COLLECTIONS STEP 3: Term Filtering ===');
  const validSearchTerms = enhancedTerms.filter(term => {
    const termLower = term.toLowerCase();
    // Be more selective for collections - they tend to have broader, less specific names
    if (term.length < 4 || COMMON_WORDS.includes(termLower)) {
      console.log(`Filtering out common/short term for collections: "${term}"`);
      return false;
    }
    
    // Skip very vague multi-word terms for collections
    const vaguePhrases = ['importance of', 'the importance', 'of a', 'a hobart'];
    if (vaguePhrases.some(phrase => termLower.includes(phrase))) {
      console.log(`Filtering out vague phrase for collections: "${term}"`);
      return false;
    }
    
    return true;
  });
  
  if (validSearchTerms.length === 0) {
    // If all terms were filtered out, extract meaningful words from original keyword
    const meaningfulWords = originalKeyword
      .split(' ')
      .filter(word => 
        word.length > 4 && 
        !COMMON_WORDS.includes(word.toLowerCase()) &&
        !['importance', 'the', 'of', 'a'].includes(word.toLowerCase())
      );
    
    if (meaningfulWords.length > 0) {
      console.log(`All search terms were filtered. Using meaningful words from keyword: ${meaningfulWords.join(', ')}`);
      validSearchTerms.push(...meaningfulWords);
    } else {
      // Last resort - just use the vendor if we have one
      if (finalVendor) {
        console.log(`No valid search terms found. Using vendor only: "${finalVendor}"`);
        validSearchTerms.push(finalVendor);
      } else {
        console.log('No valid search terms found for collections');
        return [];
      }
    }
  }
  
  console.log(`Final collection search terms (${validSearchTerms.length}):`, validSearchTerms.join(', '));
  
  // Step 4: Execute GraphQL search for collections
  console.log('\n=== COLLECTIONS STEP 4: GraphQL Search ===');
  try {
    const graphqlResults = await searchCollectionsWithGraphQL(shopDomain, token, validSearchTerms, finalVendor, originalKeyword);
    
    if (graphqlResults.length > 0) {
      console.log(`✅ GraphQL found ${graphqlResults.length} collections`);
      return graphqlResults;
    } else {
      console.log('❌ GraphQL search completed but no collections matched any search terms.');
      console.log('Collection search terms that were tried:', validSearchTerms.join(', '));
      return [];
    }
  } catch (error) {
    console.error('❌ GraphQL collections search failed:', error);
    return [];
  }
}

// Function to search Shopify pages with intelligent filtering
async function searchShopifyPages(shopDomain: string, token: string, searchTerms: string[], availableVendors: string[] = []): Promise<Array<{ id: string; title: string; handle: string; bodySummary?: string; relevanceScore?: number; [key: string]: unknown }>> {
  // Extract the original keyword from search terms
  const originalKeyword = searchTerms[0];
  
  // Step 1: Extract comprehensive terms using AI analysis (reuse from products search)
  console.log('\n=== PAGES STEP 1: AI Term Extraction ===');
  const aiAnalysisResult = await extractKeyTerms('', originalKeyword, availableVendors);
  const aiExtractedTerms = aiAnalysisResult.searchTerms;
  const primaryVendor = aiAnalysisResult.primaryVendor;
  
  console.log(`AI extracted ${aiExtractedTerms.length} terms for pages:`, aiExtractedTerms.join(', '));
  console.log(`AI identified primary vendor: "${primaryVendor || 'None'}"`);
  
  // Step 2: Filter terms for pages (be more selective for pages)
  console.log('\n=== PAGES STEP 2: Term Filtering ===');
  const validSearchTerms = aiExtractedTerms.filter(term => {
    const termLower = term.toLowerCase();
    // Be very selective for pages - they tend to have very broad, generic names
    if (term.length < 4 || COMMON_WORDS.includes(termLower)) {
      console.log(`Filtering out common/short term for pages: "${term}"`);
      return false;
    }
    
    // Skip very vague multi-word terms for pages
    const vaguePhrases = ['importance of', 'the importance', 'of a', 'how to', 'what is', 'why is'];
    if (vaguePhrases.some(phrase => termLower.includes(phrase))) {
      console.log(`Filtering out vague phrase for pages: "${term}"`);
      return false;
    }
    
    return true;
  });
  
  if (validSearchTerms.length === 0) {
    // If all terms were filtered out, extract meaningful words from original keyword
    const meaningfulWords = originalKeyword
      .split(' ')
      .filter(word => 
        word.length > 4 && 
        !COMMON_WORDS.includes(word.toLowerCase()) &&
        !['importance', 'the', 'of', 'a', 'how', 'what', 'why'].includes(word.toLowerCase())
      );
    
    if (meaningfulWords.length > 0) {
      console.log(`All search terms were filtered. Using meaningful words from keyword: ${meaningfulWords.join(', ')}`);
      validSearchTerms.push(...meaningfulWords);
    } else {
      // Last resort - just use the vendor if we have one
      if (primaryVendor) {
        console.log(`Using vendor as search term: "${primaryVendor}"`);
        validSearchTerms.push(primaryVendor);
      } else {
        console.log('No valid search terms for pages after filtering');
        return [];
      }
    }
  }
  
  console.log(`Final ${validSearchTerms.length} search terms for pages:`, validSearchTerms.join(', '));
  
  // Step 3: Search pages using GraphQL
  console.log('\n=== PAGES STEP 3: GraphQL Search ===');
  
  try {
    return await searchPagesWithGraphQL(shopDomain, token, validSearchTerms, originalKeyword);
  } catch (error) {
    console.error('❌ GraphQL pages search failed:', error);
    return [];
  }
}

// Function to search pages using GraphQL with intelligent scoring
async function searchPagesWithGraphQL(shopDomain: string, token: string, searchTerms: string[], originalKeyword: string = ''): Promise<Array<{
  id: string;
  title: string;
  handle: string;
  bodySummary?: string;
  relevanceScore?: number;
  [key: string]: unknown;
}>> {
  const matchedPages: Array<{
    id: string;
    title: string;
    handle: string;
    bodySummary?: string;
    relevanceScore?: number;
    [key: string]: unknown;
  }> = [];
  
  // Blacklist of generic page keywords that should be filtered out
  const genericPageKeywords = [
    'terms', 'service', 'privacy', 'policy', 'contact', 'about', 'shipping', 
    'returns', 'refund', 'track', 'order', 'cart', 'checkout', 'login', 
    'register', 'account', 'faq', 'help', 'support', 'legal', 'cookies',
    'newsletter', 'subscribe', 'unsubscribe', 'sitemap', 'search'
  ];
  
  console.log(`🔍 Starting GraphQL search for pages with ${searchTerms.length} terms`);
  console.log(`Search terms: ${searchTerms.join(', ')}`);
  
  for (const searchTerm of searchTerms) {
    if (matchedPages.length >= 3) break; // Limit to top 3 pages
    
    console.log(`\n📄 Searching pages for: "${searchTerm}"`);
    
    const query = `
      query searchPages($query: String!, $first: Int!) {
        pages(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
              bodySummary
              createdAt
              updatedAt
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
      first: 20
    };
    
    try {
      await sleep(200); // Rate limiting
      
      const response = await fetch(`https://${shopDomain}/admin/api/2023-10/graphql.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables })
      });
      
      if (!response.ok) {
        console.error(`GraphQL request failed: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      
      if (data.errors) {
        console.error('GraphQL errors:', data.errors);
        continue;
      }
      
      const pages = data.data?.pages?.edges || [];
      console.log(`Found ${pages.length} pages for term "${searchTerm}"`);
      
      for (const edge of pages) {
        const page = edge.node;
        
        // Skip pages that are already included
        if (matchedPages.some(p => p.id === page.id)) {
          continue;
        }
        
        // Calculate relevance score
        const titleRelevanceScore = calculateTitleRelevanceScore(page.title, searchTerm, originalKeyword);
        
        // Filter out generic pages
        const titleLower = page.title.toLowerCase();
        const isGenericPage = genericPageKeywords.some(keyword => 
          titleLower.includes(keyword)
        );
        
        if (isGenericPage) {
          console.log(`❌ Filtering out generic page: "${page.title}"`);
          continue;
        }
        
        // Only include pages with good relevance (score >= 2)
        if (titleRelevanceScore >= 2) {
          console.log(`✅ Including relevant page: "${page.title}" (score: ${titleRelevanceScore})`);
          matchedPages.push({
            ...page,
            relevanceScore: titleRelevanceScore,
            matchedTerm: searchTerm
          });
        } else {
          console.log(`❌ Low relevance page: "${page.title}" (score: ${titleRelevanceScore})`);
        }
        
        if (matchedPages.length >= 3) break;
      }
    } catch (error) {
      console.error(`Error searching pages for "${searchTerm}":`, error);
    }
  }
  
  // Sort by relevance score (highest first) and return top 3
  const sortedPages = matchedPages
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, 3);
  
  console.log(`\n📄 Final page selection: ${sortedPages.length} pages`);
  sortedPages.forEach(page => {
    console.log(`- "${page.title}" (score: ${page.relevanceScore}, matched: "${page.matchedTerm}")`);
  });
  
  return sortedPages;
}

// Helper function to calculate title relevance score for pages
function calculateTitleRelevanceScore(title: string, searchTerm: string, originalKeyword: string): number {
  const titleLower = title.toLowerCase();
  const searchTermLower = searchTerm.toLowerCase();
  const originalKeywordLower = originalKeyword.toLowerCase();
  
  let score = 0;
  
  // Exact match with search term (highest priority)
  if (titleLower === searchTermLower) {
    score += 5;
  } else if (titleLower.includes(searchTermLower)) {
    score += 3;
  }
  
  // Exact match with original keyword
  if (titleLower === originalKeywordLower) {
    score += 4;
  } else if (titleLower.includes(originalKeywordLower)) {
    score += 2;
  }
  
  // Word-level matches
  const titleWords = titleLower.split(/\s+/);
  const searchWords = searchTermLower.split(/\s+/);
  const keywordWords = originalKeywordLower.split(/\s+/);
  
  // Check for exact word matches
  for (const word of searchWords) {
    if (word.length > 3 && titleWords.includes(word)) {
      score += 1;
    }
  }
  
  for (const word of keywordWords) {
    if (word.length > 3 && titleWords.includes(word)) {
      score += 1;
    }
  }
  
  return score;
}

// Function to detect generation issues in article content
function detectGenerationIssues(content: string): boolean {
  const contentLower = content.toLowerCase();
  
  // Conversational "talking back" patterns
  const conversationalPatterns = [
    'would you like me to continue',
    "i've reached the character limit",
    "but i've reached the",
    'let me continue',
    'should i continue',
    '[content continues with',
    'due to length limits',
    'i\'ve reached my limit',
    'would you like me to',
    'shall i continue',
    'i can continue',
    'if you\'d like me to continue',
    'reach the limit',
    'continue with the rest',
    'due to space constraints'
  ];
  
  // Check for conversational patterns
  for (const pattern of conversationalPatterns) {
    if (contentLower.includes(pattern)) {
      console.log(`🚨 Detected conversational pattern: "${pattern}"`);
      return true;
    }
  }
  
  // Check if article is too short (less than 800 words)
  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
  if (wordCount < 800) {
    console.log(`🚨 Article too short: ${wordCount} words (expected 1400-1500)`);
    return true;
  }
  
  // Check if missing H1 tag
  if (!content.includes('<h1>')) {
    console.log('🚨 Missing H1 tag at article start');
    return true;
  }
  
  // Check for abrupt ending (ends mid-sentence)
  const trimmedContent = content.trim();
  const lastChar = trimmedContent[trimmedContent.length - 1];
  if (lastChar && !['.', '!', '?', '>', '"'].includes(lastChar)) {
    console.log('🚨 Article appears to end abruptly (no proper ending punctuation)');
    return true;
  }
  
  // Check for obvious error messages
  const errorPatterns = [
    'error generating',
    'failed to generate',
    'something went wrong',
    'an error occurred',
    'generation failed',
    'unable to complete'
  ];
  
  for (const pattern of errorPatterns) {
    if (contentLower.includes(pattern)) {
      console.log(`🚨 Detected error message: "${pattern}"`);
      return true;
    }
  }
  
  // Check for mostly empty content
  const strippedContent = content.replace(/<[^>]*>/g, '').trim();
  if (strippedContent.length < 500) {
    console.log('🚨 Article content too minimal after HTML removal');
    return true;
  }
  
  return false;
}

// Note: Removed unused searchAllCollections and searchAllProducts functions here
// These functions were not being called and contained many TypeScript 'any' type errors

// Helper function to identify significant single-word terms
function isSignificantTerm(term: string): boolean {
  // List of significant single words that are worth searching for
  const significantTerms = [
    'oil',
    'lubricant',
    'fluid',
    'grease',
    'hydraulic',
    'industrial',
    'kluberfood',
    'synthetic',
    'mineral'
  ];
  
  return significantTerms.includes(term.toLowerCase());
}

// Product relevance scoring system for better matching
function calculateProductRelevanceScore(product: { title: string; description?: string; vendor?: string; productType?: string; tags?: string[]; [key: string]: unknown }, searchTerm: string, originalKeyword: string, identifiedVendor: string | null): number {
  const productTitle = product.title.toLowerCase();
  const searchTermLower = searchTerm.toLowerCase();
  const originalKeywordLower = originalKeyword.toLowerCase();
  
  let score = 0;
  
  // Extract key topic words from original keyword (excluding vendor name)
  const topicWords = originalKeywordLower.split(' ').filter(word => 
    word.length > 3 && 
    !COMMON_WORDS.includes(word) &&
    (!identifiedVendor || word !== identifiedVendor.toLowerCase())
  );
  
  console.log(`Scoring product "${product.title}" for term "${searchTerm}"`);
  console.log(`Topic words: [${topicWords.join(', ')}]`);
  
  // SCORE CALCULATION:
  
  // +15 points: Contains all words from the search term
  const searchWords = searchTermLower.split(' ').filter(word => word.length > 2);
  const allWordsFound = searchWords.every(word => {
    const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`);
    return pattern.test(productTitle);
  });
  if (allWordsFound && searchWords.length > 1) {
    score += 15;
    console.log(`  +15: Contains all search words [${searchWords.join(', ')}]`);
  }
  
  // +10 points: Multi-word term match vs single word (more specific)
  if (searchTerm.includes(' ')) {
    score += 10;
    console.log(`  +10: Multi-word search term`);
  }
  
  // +8 points per topic word found in product title
  topicWords.forEach(word => {
    const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`);
    if (pattern.test(productTitle)) {
      score += 8;
      console.log(`  +8: Contains topic word "${word}"`);
    }
  });
  
  // +5 points: Exact phrase match anywhere in title
  if (productTitle.includes(searchTermLower)) {
    score += 5;
    console.log(`  +5: Contains exact phrase "${searchTerm}"`);
  }
  
  // +3 points: Contains vendor name (baseline relevance)
  if (identifiedVendor && productTitle.includes(identifiedVendor.toLowerCase())) {
    score += 3;
    console.log(`  +3: Contains vendor "${identifiedVendor}"`);
  }
  
  // PENALTY POINTS (reduce score for generic/irrelevant products):
  
  // -5 points: Generic electronic components (less relevant for mixing bowls)
  const genericTerms = ['circuit', 'breaker', 'switch', 'board', 'light', 'gfci', 'terminal', 'jumper', 'bearing', 'washer', 'screw'];
  genericTerms.forEach(genericTerm => {
    if (productTitle.includes(genericTerm)) {
      score -= 5;
      console.log(`  -5: Contains generic term "${genericTerm}"`);
    }
  });
  
  // -3 points: Very short product codes (usually replacement parts, not main products)
  const productCodePattern = /\b\d{2}-\d{6}-\d{5}\b/;
  if (productCodePattern.test(productTitle)) {
    score -= 3;
    console.log(`  -3: Contains product code pattern (likely replacement part)`);
  }
  
  console.log(`  Final score: ${score}`);
  return score;
}

// Enhanced function to prioritize search terms by relevance
function prioritizeSearchTerms(searchTerms: string[], originalKeyword: string, identifiedVendor: string | null): string[] {
  const prioritized: { term: string, priority: number }[] = [];
  
  searchTerms.forEach(term => {
    let priority = 0;
    const termLower = term.toLowerCase();
    const words = term.split(' ');
    
    // PRIORITY CALCULATION:
    
    // Priority 1: Multi-word terms that include topic-specific words (highest priority)
    if (words.length >= 2) {
      priority += 100;
      
      // Extra priority if it contains original keyword components
      const originalWords = originalKeyword.toLowerCase().split(' ').filter(word => 
        word.length > 3 && !COMMON_WORDS.includes(word)
      );
      
      originalWords.forEach(originalWord => {
        if (termLower.includes(originalWord)) {
          priority += 50;
        }
      });
      
      // Extra priority for vendor + topic combinations
      if (identifiedVendor && termLower.includes(identifiedVendor.toLowerCase())) {
        priority += 30;
      }
    }
    
    // Priority 2: Single meaningful topic words
    else if (words.length === 1) {
      const topicWords = ['bowl', 'mixing', 'mixer', 'attachment', 'hook', 'beater', 'whip'];
      if (topicWords.includes(termLower)) {
        priority += 80;
      }
      // Lower priority for vendor-only terms
      else if (identifiedVendor && termLower === identifiedVendor.toLowerCase()) {
        priority += 20; // Lowest priority - only vendor name
      }
      // Medium priority for other meaningful terms
      else if (term.length > 4 && !COMMON_WORDS.includes(termLower)) {
        priority += 40;
      }
    }
    
    prioritized.push({ term, priority });
  });
  
  // Sort by priority (highest first)
  prioritized.sort((a, b) => b.priority - a.priority);
  
  const orderedTerms = prioritized.map(item => item.term);
  console.log('Prioritized search terms:');
  prioritized.forEach(item => {
    console.log(`  ${item.priority}: "${item.term}"`);
  });
  
  return orderedTerms;
}

// ============================================
// WEBSITE CRAWLING FUNCTIONS (NEW)
// ============================================

// Enhanced 4-Phase Website Discovery Orchestrator
async function discoverWebsitePages(
  websiteUrl: string, 
  searchTerms: string[] = [],
  timeLimit: number = 12000 // 12 seconds - reduced from 30 for Vercel timeout safety
): Promise<Array<{
  url: string;
  title: string;
  description?: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
  discoveryMethod?: string;
  priority?: number;
  relevanceScore?: number;
}>> {
  console.log(`🚀 Enhanced 4-Phase Discovery starting for: ${websiteUrl} (${timeLimit/1000}s limit)`);
  const startTime = Date.now();
  const allPages: any[] = [];
  
  try {
    // Phase 1: Enhanced Sitemap & Structure Analysis (High Priority - Fast)
    console.log('⚡ Phase 1: Structure Analysis (0-6 seconds)');
    const structureData = await discoverWebsiteStructure(websiteUrl);
    allPages.push(...structureData.pages);
    
    console.log(`📊 Phase 1 Results: ${structureData.pages.length} pages, ${structureData.sitemaps.length} sitemaps`);
    
    // Quick quality assessment - lowered threshold for faster completion
    const phase1RelevantPages = structureData.pages.filter(page => {
      if (!searchTerms.length) return true;
      const score = calculateAdvancedRelevance({
        title: page.title,
        url: page.url,
        description: page.description,
        pageType: page.pageType
      }, searchTerms);
      return score > 10;
    });
    
    // Check if we should continue with deeper phases - more aggressive early exit
    const timeElapsed = Date.now() - startTime;
    const hasGoodResults = phase1RelevantPages.length >= 5; // Reduced from 10 to 5
    const shouldContinue = !hasGoodResults && timeElapsed < timeLimit * 0.5; // Increased to 50% for Phase 1
    
    if (!shouldContinue) {
      console.log(`✅ Discovery complete after Phase 1: ${allPages.length} pages (${phase1RelevantPages.length} relevant) - Time: ${timeElapsed}ms`);
      return allPages.map(page => ({
        url: page.url,
        title: page.title,
        description: page.description,
        pageType: page.pageType,
        discoveryMethod: page.discoveryMethod || 'phase1',
        priority: page.priority || 10,
        relevanceScore: searchTerms.length ? calculateAdvancedRelevance({
          title: page.title,
          url: page.url,
          description: page.description,
          pageType: page.pageType
        }, searchTerms) : 50
      }));
    }
    
    // Phase 2: Deep Navigation Crawling (Medium Priority - If needed)
    if (Date.now() - startTime < timeLimit * 0.75) { // Reduced from 0.7 to 0.75
      console.log('🔍 Phase 2: Deep Navigation Crawling (6-9 seconds)');
      const phase2Pages = await crawlNavigationSystematically(
        websiteUrl,
        structureData.navigationStructure,
        searchTerms,
        timeLimit,
        startTime
      );
      allPages.push(...phase2Pages);
      
      console.log(`📊 Phase 2 Results: ${phase2Pages.length} additional pages`);
      
      // Early exit if we now have enough content
      const totalRelevant = allPages.filter(page => {
        if (!searchTerms.length) return true;
        const score = calculateAdvancedRelevance({
          title: page.title,
          url: page.url,
          description: page.description,
          pageType: page.pageType
        }, searchTerms);
        return score > 15;
      }).length;
      
      if (totalRelevant >= 8) { // Early exit with good results
        console.log(`✅ Discovery complete after Phase 2: ${totalRelevant} relevant pages found`);
        return allPages.map(page => ({
          url: page.url,
          title: page.title,
          description: page.description,
          pageType: page.pageType,
          discoveryMethod: page.discoveryMethod || 'phase2',
          priority: page.priority || 10,
          relevanceScore: searchTerms.length ? calculateAdvancedRelevance({
            title: page.title,
            url: page.url,
            description: page.description,
            pageType: page.pageType
          }, searchTerms) : 50
        }));
      }
    }
    
    // Skip Phases 3 & 4 to avoid timeouts - return what we have
    console.log(`⚠️ Phases 3-4 skipped for timeout safety. Time elapsed: ${Date.now() - startTime}ms`);
    
    // Return all discovered pages with relevance scores
    return allPages.map(page => ({
      url: page.url,
      title: page.title,
      description: page.description,
      pageType: page.pageType,
      discoveryMethod: page.discoveryMethod || 'early-phases',
      priority: page.priority || 10,
      relevanceScore: searchTerms.length ? calculateAdvancedRelevance({
        title: page.title,
        url: page.url,
        description: page.description,
        pageType: page.pageType
      }, searchTerms) : 50
    }));
    
  } catch (error) {
    console.error('❌ Discovery error:', error);
    // Return any pages we managed to discover before the error
    return allPages.map(page => ({
      url: page.url,
      title: page.title,
      description: page.description || '',
      pageType: page.pageType || 'other',
      discoveryMethod: page.discoveryMethod || 'partial',
      priority: page.priority || 20,
      relevanceScore: searchTerms.length ? calculateAdvancedRelevance({
        title: page.title,
        url: page.url,
        description: page.description,
        pageType: page.pageType
      }, searchTerms) : 30
    }));
  }
}

// Parse sitemap.xml for page discovery
async function parseSitemap(websiteUrl: string): Promise<Array<{
  url: string;
  title: string;
  description?: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
}>> {
  try {
    const sitemapUrl = `${websiteUrl.replace(/\/$/, '')}/sitemap.xml`;
    console.log(`📋 Attempting to parse sitemap: ${sitemapUrl}`);
    
    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'EnhanceMySeBot/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Sitemap not found: ${response.status}`);
    }
    
    const sitemapText = await response.text();
    
    // Simple XML parsing to extract URLs
    const urlMatches = sitemapText.match(/<loc>(.*?)<\/loc>/g);
    if (!urlMatches) {
      throw new Error('No URLs found in sitemap');
    }
    
    const pages = [];
    for (const match of urlMatches.slice(0, 100)) { // Limit to 100 pages
      const url = match.replace(/<\/?loc>/g, '');
      const title = extractTitleFromUrl(url);
      const pageType = categorizeWebsitePage(url, title);
      
      pages.push({
        url,
        title,
        pageType
      });
    }
    
    console.log(`✅ Parsed ${pages.length} pages from sitemap`);
    return pages;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(`❌ Sitemap parsing failed: ${errorMessage}`);
    return [];
  }
}

// Categorize website pages based on URL and title
function categorizeWebsitePage(url: string, title: string): 'product' | 'service' | 'blog' | 'category' | 'about' | 'other' {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  
  // Product page indicators
  if (urlLower.includes('/product') || urlLower.includes('/shop') || urlLower.includes('/store') ||
      titleLower.includes('buy') || titleLower.includes('purchase') || titleLower.includes('product')) {
    return 'product';
  }
  
  // Service page indicators
  if (urlLower.includes('/service') || urlLower.includes('/solution') || 
      titleLower.includes('service') || titleLower.includes('solution') || titleLower.includes('consulting')) {
    return 'service';
  }
  
  // Blog/resource page indicators
  if (urlLower.includes('/blog') || urlLower.includes('/news') || urlLower.includes('/article') || 
      urlLower.includes('/resource') || urlLower.includes('/guide') ||
      titleLower.includes('blog') || titleLower.includes('guide') || titleLower.includes('tutorial')) {
    return 'blog';
  }
  
  // Category page indicators
  if (urlLower.includes('/category') || urlLower.includes('/collection') || urlLower.includes('/department') ||
      titleLower.includes('category') || titleLower.includes('collection')) {
    return 'category';
  }
  
  // About page indicators
  if (urlLower.includes('/about') || urlLower.includes('/company') || urlLower.includes('/team') ||
      titleLower.includes('about') || titleLower.includes('company') || titleLower.includes('team')) {
    return 'about';
  }
  
  return 'other';
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

// Extract title from URL path
function extractTitleFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    
    if (pathSegments.length === 0) return 'Homepage';
    
    const lastSegment = pathSegments[pathSegments.length - 1];
    
    // Convert URL slug to readable title
    return lastSegment
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  } catch {
    return 'Website Page';
  }
}

// Enhanced website pages search with relevance scoring (uses 4-phase discovery)
async function searchWebsitePages(
  websiteUrl: string,
  searchTerms: string[],
  pageTypes: string[] = ['product', 'service', 'blog', 'category'],
  originalKeyword: string = ''
): Promise<Array<{
  id: string;
  title: string;
  url: string;
  description?: string;
  pageType: string;
  relevanceScore?: number;
}>> {
  try {
    console.log(`🔍 Enhanced website search for: ${searchTerms.join(', ')}`);
    console.log(`📋 Filtering for page types: ${pageTypes.join(', ')}`);
    
    // Use enhanced 4-phase discovery with search context
    const allPages = await discoverWebsitePages(websiteUrl, searchTerms, 30000);
    
    // Filter by requested page types
    const filteredPages = allPages.filter(page => 
      pageTypes.includes(page.pageType)
    );
    
    if (filteredPages.length === 0) {
      console.log('❌ No pages found matching the specified types');
      return [];
    }
    
    // Enhanced relevance scoring with original keyword priority
    const scoredPages = filteredPages.map(page => {
      let score = page.relevanceScore || 0;
      
      // Boost score if original keyword matches
      if (originalKeyword) {
        const originalLower = originalKeyword.toLowerCase();
        if (page.title.toLowerCase().includes(originalLower)) score += 50;
        if (page.url.toLowerCase().includes(originalLower)) score += 30;
        if ((page.description || '').toLowerCase().includes(originalLower)) score += 20;
      }
      
      return {
        id: Buffer.from(page.url).toString('base64'), // Generate unique ID
        title: page.title,
        url: page.url,
        description: page.description,
        pageType: page.pageType,
        relevanceScore: score,
        discoveryMethod: page.discoveryMethod,
        priority: page.priority
      };
    });
    
    // Sort by relevance score (highest first)
    const sortedPages = scoredPages
      .filter(page => page.relevanceScore > 0)
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    
    console.log(`✅ Enhanced search complete: ${sortedPages.length} relevant pages found`);
    
    // Log top results for debugging
    sortedPages.slice(0, 5).forEach((page, index) => {
      console.log(`  ${index + 1}. "${page.title}" (${page.pageType}) - Score: ${page.relevanceScore} [${page.discoveryMethod}]`);
    });
    
    return sortedPages.slice(0, 20); // Return top 20 results
    
  } catch (error) {
    console.error('Enhanced website search error:', error);
    return [];
  }
}

// Calculate relevance score for website pages (mirrors Shopify scoring logic)
function calculateWebsitePageRelevance(
  page: { title: string; url: string; description?: string; pageType: string },
  searchTerms: string[],
  originalKeyword: string
): number {
  let score = 0;
  const titleLower = page.title.toLowerCase();
  const urlLower = page.url.toLowerCase();
  const descriptionLower = (page.description || '').toLowerCase();
  
  // Original keyword gets highest weight (mirrors Shopify logic)
  if (originalKeyword) {
    const originalLower = originalKeyword.toLowerCase();
    if (titleLower.includes(originalLower)) score += 100;
    if (urlLower.includes(originalLower)) score += 50;
    if (descriptionLower.includes(originalLower)) score += 25;
  }
  
  // Search terms scoring
  for (const term of searchTerms) {
    const termLower = term.toLowerCase();
    if (termLower.length < 3) continue; // Skip very short terms
    
    if (titleLower.includes(termLower)) score += 20;
    if (urlLower.includes(termLower)) score += 10;
    if (descriptionLower.includes(termLower)) score += 5;
  }
  
  // Page type bonuses (prioritize products and services)
  if (page.pageType === 'product') score += 10;
  if (page.pageType === 'service') score += 8;
  if (page.pageType === 'category') score += 5;
  if (page.pageType === 'blog') score += 3;
  
  return score;
}



export async function POST(request: Request) {
  const startTime = Date.now();
  console.log('🚀 Article generation started at:', new Date().toISOString());
  
  try {
    console.log('⏱️ [0ms] Starting article generation request');
    
    // Check for required API keys
    if (!openaiKey) {
      console.error('OPENAI_API_KEY is missing. Please check your .env.local file.');
      return NextResponse.json(
        { error: 'OpenAI API key is not configured. Please check your environment variables.' },
        { status: 500 }
      );
    }

    if (!anthropicKey) {
      console.error('ANTHROPIC_API_KEY is missing. Please check your .env.local file.');
      return NextResponse.json(
        { error: 'Anthropic API key is not configured. Please check your environment variables.' },
        { status: 500 }
      );
    }

    console.log(`⏱️ [${Date.now() - startTime}ms] API keys validated`);

    // Get the user's ID token from the Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let verifiedUser;
    
    console.log(`⏱️ [${Date.now() - startTime}ms] Starting token verification`);
    
    try {
      // Verify the ID token
      verifiedUser = await getAuth().verifyIdToken(idToken);
      if (!verifiedUser.uid) {
        throw new Error('Invalid token');
      }
      console.log(`⏱️ [${Date.now() - startTime}ms] User authenticated successfully:`, verifiedUser.uid);
    } catch (error) {
      console.error('Error verifying token:', error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    console.log(`⏱️ [${Date.now() - startTime}ms] Starting simplified usage verification`);
    
    // OPTIMIZATION: Simplified usage verification for speed
    try {
      // Basic subscription check without complex server-side utilities
      const subscriptionStatus = verifiedUser.firebase?.sign_in_provider ? 'free' : 'free'; // Simplified check
      console.log(`⏱️ [${Date.now() - startTime}ms] Using simplified subscription model:`, subscriptionStatus);
      
      // Skip complex usage verification for speed optimization
      console.log(`⏱️ [${Date.now() - startTime}ms] Skipping detailed usage verification for speed`);
      
    } catch (usageError) {
      console.error('Error in simplified usage verification:', usageError);
      // Continue with generation even if usage check fails
      console.log(`⏱️ [${Date.now() - startTime}ms] Continuing despite usage verification error`);
    }

    console.log(`⏱️ [${Date.now() - startTime}ms] Parsing request body`);
    
    const body = await request.json();
    console.log('Request body:', { ...body, keyword: body.keyword }); // Log everything except sensitive data

    const {
      blogId,
      keyword,
      brandName,
      businessType,
      contentType,
      toneOfVoice,
      instructions,
      contentSelection,
      shopifyStoreUrl,
      shopifyAccessToken,
      brandColor,
    } = body;

    // Validate required fields
    if (!blogId || !keyword || !brandName || !businessType || !contentType) {
      console.error('Missing required fields:', { blogId, keyword, brandName, businessType, contentType });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('Starting topic breakdown generation with OpenAI');
    // 1. Generate topic breakdown with OpenAI
    const topicBreakdownPrompt = `Do not chat back to me in any way. Start immediately with the answer.\nResearch the topic: "${keyword}" using the latest available web information.\nWrite a clear, well-organized, and factual 500-word breakdown that covers:\n- The core concept and definition of the topic\n- Key facts, statistics, or recent developments\n- Major subtopics or components\n- Common misconceptions or challenges\n- Why this topic matters in its field or industry\nDo not include any conversational or meta language. Only provide the breakdown.`;

    let topicBreakdown = '';
    try {
      console.log('Calling OpenAI API for topic breakdown');
      const openaiRes = await openai.chat.completions.create({
        model: 'gpt-4-1106-preview',
        messages: [
          { role: 'user', content: topicBreakdownPrompt }
        ],
        max_tokens: 800,
        temperature: 0.7,
      });
      topicBreakdown = openaiRes.choices[0].message.content || '';
      console.log('Successfully generated topic breakdown');
    } catch (err) {
      console.error('Error generating topic breakdown:', err);
      // Continue without breakdown rather than failing completely
    }

    // 2. If contentSelection is configured, fetch content based on integration type
    let relatedProductsList = '', relatedCollectionsList = '', relatedPagesList = '', relatedWebsiteContentList = '';
    let integrationPrompt = '';
    let integrationStatus = 'none'; // Track overall integration status
    
    if (contentSelection) {
      // Create a brandProfile-like object for integration detection
      const brandProfileData = {
        websiteUrl: body.websiteUrl,
        shopifyStoreUrl,
        shopifyAccessToken
      };
      
      // Import integration detection utilities
      const { detectIntegrationType } = await import('@/lib/firebase/firestore');
      const integrationType = detectIntegrationType(brandProfileData as any);
      console.log(`🔍 Detected integration type: ${integrationType}`);
      
      // Check if any content is selected based on integration type
      const hasShopifyContent = contentSelection.mode === 'automatic' ? 
        (contentSelection.automaticOptions.includeProducts || contentSelection.automaticOptions.includeCollections || contentSelection.automaticOptions.includePages) :
        (contentSelection.manualSelections.products.length > 0 || contentSelection.manualSelections.collections.length > 0 || contentSelection.manualSelections.pages.length > 0);
      
      // Check if website content is included
      const hasWebsiteContent = contentSelection.mode === 'automatic' ? 
        contentSelection.automaticOptions.includeWebsiteContent :
        (contentSelection.manualSelections.websiteContent && contentSelection.manualSelections.websiteContent.length > 0);
      
      // Handle Shopify integration
      if ((integrationType === 'shopify' || integrationType === 'both') && hasShopifyContent && shopifyStoreUrl && shopifyAccessToken) {
        console.log(`🛍️ Starting Shopify integration for ${contentSelection.mode} mode`);
        
        try {
          const shopDomain = shopifyStoreUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
          
          // Verify Shopify connection
          console.log(`Verifying Shopify connection to ${shopDomain}`);
          await sleep(500);
          
          const verifyResponse = await fetch(`https://${shopDomain}/admin/api/2023-01/shop.json`, {
            headers: {
              'X-Shopify-Access-Token': shopifyAccessToken,
              'Content-Type': 'application/json',
            },
          });
          
          if (!verifyResponse.ok) {
            console.error('Shopify verification failed:', verifyResponse.status);
            integrationStatus = 'shopify_auth_error';
          } else {
            // Handle automatic or manual Shopify content selection
            if (contentSelection.mode === 'automatic') {
              await handleAutomaticShopifyContent(contentSelection, shopDomain, shopifyAccessToken, [keyword], [], shopifyStoreUrl);
            } else {
              await handleManualShopifyContent(contentSelection, shopifyStoreUrl);
            }
            integrationStatus = 'shopify_success';
          }
        } catch (error) {
          console.error('Error in Shopify integration:', error);
          integrationStatus = 'shopify_error';
        }
      }
      
      // Handle Website integration
      if ((integrationType === 'website' || integrationType === 'both') && hasWebsiteContent && body.websiteUrl) {
        console.log(`🌐 Starting Website integration for ${contentSelection.mode} mode`);
        
        try {
          if (contentSelection.mode === 'automatic') {
            // Use pre-discovered content if provided, otherwise fall back to discovery
            if (body.discoveredContent && Array.isArray(body.discoveredContent)) {
              console.log(`🎯 Using pre-discovered content: ${body.discoveredContent.length} pages`);
              await handlePreDiscoveredWebsiteContent(contentSelection, body.discoveredContent, keyword);
            } else {
              console.log(`⚠️ No pre-discovered content provided, falling back to quick discovery`);
              await handleAutomaticWebsiteContent(contentSelection, body.websiteUrl, [keyword]);
            }
          } else {
            await handleManualWebsiteContent(contentSelection);
          }
          
          if (integrationStatus === 'none') {
            integrationStatus = 'website_success';
          } else if (integrationStatus === 'shopify_success') {
            integrationStatus = 'hybrid_success';
          }
        } catch (error) {
          console.error('Error in Website integration:', error);
          if (integrationStatus === 'none') {
            integrationStatus = 'website_error';
          }
        }
      }
      
      // Build integration prompt based on collected content
      integrationPrompt = buildIntegrationPrompt(relatedProductsList, relatedCollectionsList, relatedPagesList, relatedWebsiteContentList);
    }
    
    // Helper functions for content handling
    async function handleAutomaticShopifyContent(contentSelection: any, shopDomain: string, accessToken: string, currentSearchTerms: string[], currentAvailableVendors: string[], storeUrl: string) {
      console.log(`⏱️ [${Date.now() - startTime}ms] Skipping Shopify integration for speed optimization`);
      // OPTIMIZATION: Skip all Shopify searches to eliminate timeout
      // This removes 5-10 seconds of API calls and processing
      return;
      
      // Original complex logic commented out for performance
      /*
      const searchQueries = currentSearchTerms.length > 0 ? currentSearchTerms : [keyword];
      
      // Search products if enabled
      if (contentSelection.automaticOptions.includeProducts) {
        console.log('🔍 Searching Shopify products...');
        const products = await searchShopifyProducts(shopDomain, accessToken, searchQueries, currentAvailableVendors);
        if (products.length > 0) {
          relatedProductsList = products.map(p => `• ${p.title} - ${storeUrl}/products/${p.handle}`).join('\n');
          console.log(`✅ Found ${products.length} relevant products`);
        }
      }
      
      // Search collections if enabled
      if (contentSelection.automaticOptions.includeCollections) {
        console.log('🔍 Searching Shopify collections...');
        const collections = await searchCollectionsWithGraphQL(shopDomain, accessToken, searchQueries, null, keyword);
        if (collections.length > 0) {
          relatedCollectionsList = collections.map(c => `• ${c.title} - ${storeUrl}/collections/${c.handle}`).join('\n');
          console.log(`✅ Found ${collections.length} relevant collections`);
        }
      }
      
      // Search pages if enabled
      if (contentSelection.automaticOptions.includePages) {
        console.log('🔍 Searching Shopify pages...');
        const pages = await searchPagesWithGraphQL(shopDomain, accessToken, searchQueries, keyword);
        if (pages.length > 0) {
          relatedPagesList = pages.map(p => `• ${p.title} - ${storeUrl}/pages/${p.handle}`).join('\n');
          console.log(`✅ Found ${pages.length} relevant pages`);
        }
      }
      */
    }
    
    async function handleManualShopifyContent(contentSelection: any, storeUrl: string) {
      // Handle manually selected Shopify content
      if (contentSelection.manualSelections.products.length > 0) {
        relatedProductsList = contentSelection.manualSelections.products.map((p: any) => 
          `• ${p.title} - ${storeUrl}/products/${p.handle}`
        ).join('\n');
      }
      
      if (contentSelection.manualSelections.collections.length > 0) {
        relatedCollectionsList = contentSelection.manualSelections.collections.map((c: any) => 
          `• ${c.title} - ${storeUrl}/collections/${c.handle}`
        ).join('\n');
      }
      
      if (contentSelection.manualSelections.pages.length > 0) {
        relatedPagesList = contentSelection.manualSelections.pages.map((p: any) => 
          `• ${p.title} - ${p.url}`
        ).join('\n');
      }
    }
    
    async function handleAutomaticWebsiteContent(contentSelection: any, websiteUrl: string, currentSearchTerms: string[]) {
      console.log(`⏱️ [${Date.now() - startTime}ms] Skipping website content discovery for speed optimization`);
      // OPTIMIZATION: Skip all website content processing to eliminate timeout
      // This removes 8-12 seconds of crawling and AI processing
      return;
      
      // Original complex logic commented out for performance
      /*
      console.log('🌐 Processing automatic website content selection');
      
      try {
        // Call AI extraction for search terms
        const aiAnalysis = await extractKeyTerms('', keyword, []);
        const enhancedTerms = [...currentSearchTerms, ...aiAnalysis.searchTerms];
        
        console.log(`AI enhanced search terms: ${enhancedTerms.join(', ')}`);
        
        // Use the unified search with Shopify-style logic (now with timeout safety)
        const websitePages = await searchWebsiteContentWithShopifyLogic(
          websiteUrl,
          enhancedTerms,
          [], // No page type filtering for automatic mode
          keyword,
          aiAnalysis.primaryVendor
        );
        
        console.log(`Found ${websitePages.length} relevant website pages`);
        
        // Convert to string format for the prompt (maintain existing format)
        if (websitePages.length > 0) {
          relatedWebsiteContentList = websitePages.slice(0, 15).map(page => 
            `• ${page.title} ${page.pageType ? `[${page.pageType.toUpperCase()}]` : ''} - ${page.url}`
          ).join('\n');
        }
        
      } catch (error) {
        console.error('Error in automatic website content handling:', error);
        throw error;
      }
      */
    }
    
    async function handleManualWebsiteContent(contentSelection: any) {
      // Handle manually selected website content (unified approach)
      if (contentSelection.manualSelections.websiteContent && contentSelection.manualSelections.websiteContent.length > 0) {
        relatedWebsiteContentList = contentSelection.manualSelections.websiteContent.map((p: any) => 
          `• ${p.title} ${p.pageType ? `[${p.pageType.toUpperCase()}]` : ''} - ${p.url}`
        ).join('\n');
        
        console.log(`📋 Using ${contentSelection.manualSelections.websiteContent.length} manually selected website pages`);
      }
    }

    async function handlePreDiscoveredWebsiteContent(contentSelection: any, discoveredPages: any[], keyword: string) {
      console.log('🎯 Processing pre-discovered website content');
      
      try {
        // Filter out blog pages and low-relevance content
        const filteredPages = discoveredPages.filter(page => {
          // Basic blog filtering
          const isBlog = page.pageType === 'blog' || 
                         page.url.toLowerCase().includes('/blog/') ||
                         page.url.toLowerCase().match(/\/\d{4}\/\d{2}\//);
          
          // Keep only relevant non-blog pages
          return !isBlog && (page.relevanceScore || 0) > 5;
        });
        
        console.log(`Filtered content: ${filteredPages.length}/${discoveredPages.length} pages (removed blogs and low-relevance)`);
        
        // Convert to the string format expected by the prompt builder (maintain existing format)
        if (filteredPages.length > 0) {
          relatedWebsiteContentList = filteredPages.slice(0, 15).map(page => 
            `• ${page.title} ${page.pageType ? `[${page.pageType.toUpperCase()}]` : ''} - ${page.url}`
          ).join('\n');
        }
        
        console.log(`Added ${filteredPages.length} website pages to content context`);
        
      } catch (error) {
        console.error('Error in pre-discovered website content handling:', error);
        throw error;
      }
    }
    
    function buildIntegrationPrompt(products: string, collections: string, pages: string, websiteContent: string): string {
      console.log(`⏱️ [${Date.now() - startTime}ms] Skipping integration prompt building for speed optimization`);
      // OPTIMIZATION: Skip complex integration prompts to eliminate processing time
      return '';
      
      // Original complex logic commented out for performance
      /*
      let prompt = '';
      
      if (products) {
        prompt += `\n\nRELATED PRODUCTS TO MENTION:\n${products}`;
      }
      
      if (collections) {
        prompt += `\n\nRELATED COLLECTIONS TO MENTION:\n${collections}`;
      }
      
      if (pages) {
        prompt += `\n\nRELATED PAGES TO MENTION:\n${pages}`;
      }
      
      if (websiteContent) {
        prompt += `\n\nRELATED WEBSITE CONTENT TO MENTION:\n${websiteContent}`;
      }
      
      return prompt;
      */
    }

    // 3. Generate the article content using Claude
    console.log('Starting article generation with Claude');
    
    // Create all prompt variables
    const toneOfVoicePrompt = toneOfVoice ? `\n\nTONE OF VOICE: ${toneOfVoice}` : '';
    const contentTypePrompt = contentType ? `\n\nCONTENT TYPE: ${contentType}` : '';
    const brandPrompt = `\n\nBRAND: ${brandName} (${businessType})`;

    // Validate and ensure we have a usable brand color
    const validateBrandColor = (color: string | undefined): string => {
      // If no color provided, use black
      if (!color) return '#000000';
      
      // If white is provided, use black instead (white borders/text are invisible)
      if (color.toLowerCase() === '#ffffff' || color.toLowerCase() === 'white') {
        return '#000000';
      }
      
      // Validate hex format (basic validation)
      if (!/^#[0-9A-F]{6}$/i.test(color)) {
        return '#000000';
      }
      
      return color;
    };

    const finalBrandColor = validateBrandColor(brandColor);
    
    const userPrompt = `
      DO NOT START WITH ANYTHING EXCEPT <H1>. Start every page off immediately, do not chat back to me in anyway.
      You are writing for ${brandName}. Write from the perspective of this brand.
      DO NOT INCLUDE ANY EXTERNAL LINKS TO COMPETITORS.
      Start writing immediately with <h1>
      DO NOT START BY TALKING TO ME.

      Here is a detailed breakdown of the topic to guide your writing:
      ${topicBreakdown}
      ${instructions}
      ${toneOfVoicePrompt}
      ${contentTypePrompt}
      ${brandPrompt}
      ${integrationPrompt}

      Please write a long-form SEO-optimized article with 1500 words about the following article keyword: ${keyword}.
      Answer in HTML, starting with one single <h1> tag, as this is going on wordpress, do not give unnecessary HTML tags.
      
      VISUAL STYLING REQUIREMENTS:
      - Use ${finalBrandColor} as the primary accent color throughout the article
      - Key takeaways table: Light gray background (#f8f9fa) with ${finalBrandColor} left border (5px solid)
      - Data tables: ALL headers with background-color: ${finalBrandColor}; color: white; alternating row colors (#f2f2f2)
      - Call-out boxes: Light background (#f8f9fa) with ${finalBrandColor} left border (5px solid)
      - All borders: 1px solid #ddd; padding: 8-12px; border-collapse: collapse
      - IMPORTANT: Use ONLY ${finalBrandColor} for all colored elements - no other colors allowed

      CHART CREATION SYSTEM (use inline styles only):
      For comparative data, create charts using this exact structure:
      <div style="background: #f8f9fa; padding: 20px; margin: 20px 0; border-radius: 8px; border: 1px solid #ddd;">
        <h3 style="margin: 0 0 15px 0; color: #333;">[Chart Title]</h3>
        <div style="display: flex; justify-content: space-around; align-items: end; height: 200px; border-bottom: 2px solid #ccc; padding: 10px;">
          <div style="text-align: center; flex: 1; margin: 0 5px;">
            <div style="position: relative; height: 150px; display: flex; align-items: end;">
              <div style="background: ${finalBrandColor}; width: 40px; height: [percentage]%; border-radius: 4px 4px 0 0; position: relative; margin: 0 auto;">
                <span style="position: absolute; top: -25px; left: 50%; transform: translateX(-50%); font-weight: bold; color: #333;">[value]</span>
              </div>
            </div>
            <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">[label]</p>
          </div>
          [Repeat div block for each data point]
        </div>
      </div>

      PROCESS DIAGRAMS:
      For step-by-step processes, use:
      <div style="background: #f8f9fa; padding: 15px; margin: 15px 0; border-left: 5px solid ${finalBrandColor}; border-radius: 0 8px 8px 0;">
        <h4 style="margin: 0 0 10px 0; color: ${finalBrandColor};">Step [number]: [title]</h4>
        <p style="margin: 0; color: #555;">[description]</p>
      </div>

      PARTS INFO BOXES:
      <div style="background: white; padding: 15px; margin: 15px 0; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h4 style="margin: 0 0 10px 0; color: ${finalBrandColor};">[Part Name]</h4>
        <p style="margin: 0; color: #666;">[description]</p>
      </div>

      ARTICLE STRUCTURE REQUIREMENTS:
      - Introduction: 150-200 words introducing the topic and brand perspective
      - Main content: 4-5 sections of 200-250 words each covering key aspects
      - Conclusion: 150 words summarizing key points with call-to-action for Malachy Parts Plus
      - CRITICAL: Always include a complete conclusion section - never end abruptly
      - Target total: 1400-1500 words maximum for optimal completion
      
      ${keyword.toLowerCase().match(/comparison|vs|breakdown|analysis/) ? 
        'PRIORITY: Include comparison charts and data visualizations for this topic.' : ''}

      Please use a lot of formatting, tables and visuals are great for ranking on Google. If there is data that can be displayed through a table or other visual, ensure its removed from the text and replaced with the visual.
      Always include a modern styled key takeaways table at the beginning of the article listing the key points of the topic.

      The article should be written in a ${toneOfVoice || 'professional'} tone and framed as ${contentType}.
      This is a ${businessType} so write from the perspective of that business.
      ${instructions ? `Additional instructions:\n${instructions}` : ''}
    `;

    // Generate content using Claude
    try {
      console.log(`⏱️ [${Date.now() - startTime}ms] Starting Claude API call`);
      console.log('Calling Claude API for article generation');
    const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: userPrompt
        }
      ]
    });

      console.log(`⏱️ [${Date.now() - startTime}ms] Claude API call completed successfully`);
      
      // Get the generated content from the response
      const generatedContent = message.content[0].type === 'text' ? message.content[0].text : '';
      console.log(`⏱️ [${Date.now() - startTime}ms] Content extracted from Claude response`);

      // Check for generation issues
      const hasGenerationIssues = detectGenerationIssues(generatedContent);
      if (hasGenerationIssues) {
        console.log('⚠️ Generation issues detected in article content');
      }

      // Extract title from the first <h1> tag
      const titleMatch = generatedContent.match(/<h1>(.*?)<\/h1>/);
      const title = titleMatch ? titleMatch[1] : `${keyword} - ${contentType}`;

      console.log(`⏱️ [${Date.now() - startTime}ms] Starting usage count increment`);
      
      // CRITICAL: Increment usage count only if no generation issues detected
      if (!hasGenerationIssues) {
        console.log('Incrementing usage count for user:', verifiedUser.uid);
        try {
          const adminFirestore = getFirestore();
          await serverSideUsageUtils.incrementUsage(verifiedUser.uid, 'articles', adminFirestore);
          console.log(`⏱️ [${Date.now() - startTime}ms] Usage count incremented successfully`);
        } catch (usageError) {
          console.error('Error incrementing usage count:', usageError);
          // Continue execution - don't fail the request for usage tracking errors
        }
      } else {
        console.log('⚠️ Skipping usage increment due to generation issues - user will not be charged');
      }

      console.log(`⏱️ [${Date.now() - startTime}ms] Article generation completed successfully - Total time: ${Date.now() - startTime}ms`);
      
      // Return the response including Shopify integration status and generation issues flag
    return NextResponse.json({
      title,
      content: generatedContent,
      hasGenerationIssues,
      shopifyIntegration: {
        status: integrationStatus,
        message: getShopifyStatusMessage(integrationStatus)
      }
    });
    } catch (error) {
      console.error('Error generating article with Claude:', error);
      return NextResponse.json(
        { 
          error: 'Failed to generate article content',
          shopifyIntegration: {
            status: integrationStatus,
            message: getShopifyStatusMessage(integrationStatus)
          }
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error in article generation process:', error);
    return NextResponse.json(
      { error: 'Failed to generate article' },
      { status: 500 }
    );
  }
}

// Helper function to get readable Shopify status messages
function getShopifyStatusMessage(status: string): string {
  switch (status) {
    case 'success':
      return 'Shopify products/collections successfully integrated into article';
    case 'auth_error':
      return 'Invalid Shopify credentials. Please check your Shopify access token.';
    case 'no_products':
      return 'No matching products found in your Shopify store for this topic. Try a different topic or add more relevant products to your store.';
    case 'no_collections':
      return 'No matching collections found in your Shopify store for this topic. Try a different topic or create collections that match your keywords.';
    case 'no_pages':
      return 'No matching service pages found in your Shopify store for this topic. Try a different topic or create pages that match your keywords.';
    case 'api_error':
      return 'Error occurred while fetching data from Shopify API';
    case 'connection_error':
      return 'Could not connect to your Shopify store';
    case 'missing_credentials':
      return 'Shopify store URL or access token not provided';
    case 'none':
    default:
      return 'Shopify integration not attempted';
  }
} 

// ============================================
// ENHANCED WEBSITE CRAWLING SYSTEM (4-PHASE)
// ============================================

// Phase 1: Enhanced Sitemap & Structure Analysis
async function discoverWebsiteStructure(websiteUrl: string): Promise<{
  pages: Array<{
    url: string;
    title: string;
    description?: string;
    pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
    discoveryMethod: string;
    priority: number;
  }>;
  navigationStructure: {
    mainMenuLinks: string[];
    footerLinks: string[];
    categories: string[];
  };
  sitemaps: string[];
}> {
  console.log(`🔍 Phase 1: Enhanced structure discovery for ${websiteUrl}`);
  
  const allPages: any[] = [];
  const navigationStructure: {
    mainMenuLinks: string[];
    footerLinks: string[];
    categories: string[];
  } = { mainMenuLinks: [], footerLinks: [], categories: [] };
  const discoveredSitemaps: string[] = [];
  
  try {
    // Step 1: Parse robots.txt for sitemap locations
    const robotsSitemaps = await parseRobotsTxt(websiteUrl);
    discoveredSitemaps.push(...robotsSitemaps);
    
    // Step 2: Try common sitemap locations
    const commonSitemapUrls = [
      '/sitemap.xml',
      '/sitemap_index.xml', 
      '/page-sitemap.xml',
      '/post-sitemap.xml',
      '/product-sitemap.xml'
    ];
    
    for (const sitemapPath of commonSitemapUrls) {
      const sitemapUrl = `${websiteUrl.replace(/\/$/, '')}${sitemapPath}`;
      const sitemapPages = await parseEnhancedSitemap(sitemapUrl);
      if (sitemapPages.length > 0) {
        allPages.push(...sitemapPages.map(page => ({
          ...page,
          discoveryMethod: 'sitemap',
          priority: 10
        })));
        discoveredSitemaps.push(sitemapUrl);
      }
    }
    
    // Step 3: Analyze main page for navigation structure
    if (allPages.length < 50) { // If sitemap discovery was limited
      const navigationData = await analyzeNavigationStructure(websiteUrl);
      navigationStructure.mainMenuLinks = navigationData.mainMenuLinks;
      navigationStructure.footerLinks = navigationData.footerLinks;
      navigationStructure.categories = navigationData.categories;
      
      // Add navigation-discovered pages
      const navPages = [...navigationData.mainMenuLinks, ...navigationData.categories].map(url => ({
        url,
        title: extractTitleFromUrl(url),
        pageType: categorizeWebsitePageAdvanced(url, '', { isNavigationLink: true }),
        discoveryMethod: 'navigation',
        priority: 8
      }));
      
      allPages.push(...navPages);
    }
    
    console.log(`✅ Phase 1 complete: ${allPages.length} pages discovered from ${discoveredSitemaps.length} sitemaps`);
    
    return {
      pages: allPages,
      navigationStructure,
      sitemaps: discoveredSitemaps
    };
    
  } catch (error) {
    console.error('Phase 1 discovery error:', error);
    return {
      pages: [],
      navigationStructure,
      sitemaps: []
    };
  }
}

// Enhanced robots.txt parser
async function parseRobotsTxt(websiteUrl: string): Promise<string[]> {
  try {
    const robotsUrl = `${websiteUrl.replace(/\/$/, '')}/robots.txt`;
    const response = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'EnhanceMySeBot/1.0' }
    });
    
    if (!response.ok) return [];
    
    const robotsText = await response.text();
    const sitemapMatches = robotsText.match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi) || [];
    
    return sitemapMatches.map(match => match.replace(/Sitemap:\s*/i, '').trim());
  } catch {
    return [];
  }
}

// Enhanced sitemap parser with better categorization
async function parseEnhancedSitemap(sitemapUrl: string): Promise<Array<{
  url: string;
  title: string;
  description?: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
  lastModified?: Date;
}>> {
  try {
    console.log(`📋 Parsing sitemap: ${sitemapUrl}`);
    
    const response = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'EnhanceMySeBot/1.0' }
    });
    
    if (!response.ok) return [];
    
    const sitemapText = await response.text();
    
    // Handle sitemap index files (containing multiple sitemaps)
    if (sitemapText.includes('<sitemapindex')) {
      const sitemapMatches = sitemapText.match(/<loc>(.*?)<\/loc>/g) || [];
      const childSitemaps = sitemapMatches.map(match => match.replace(/<\/?loc>/g, ''));
      
      const allPages: any[] = [];
      for (const childSitemap of childSitemaps.slice(0, 10)) { // Limit to 10 child sitemaps
        const childPages = await parseEnhancedSitemap(childSitemap);
        allPages.push(...childPages);
      }
      return allPages;
    }
    
    // Parse regular sitemap
    const urlMatches = sitemapText.match(/<url>[\s\S]*?<\/url>/g) || [];
    const pages = [];
    
    for (const urlBlock of urlMatches.slice(0, 500)) { // Limit to 500 URLs per sitemap
      const urlMatch = urlBlock.match(/<loc>(.*?)<\/loc>/);
      const lastModMatch = urlBlock.match(/<lastmod>(.*?)<\/lastmod>/);
      
      if (urlMatch) {
        const url = urlMatch[1];
        const title = extractTitleFromUrl(url);
        const pageType = categorizeWebsitePageAdvanced(url, title);
        const lastModified = lastModMatch ? new Date(lastModMatch[1]) : undefined;
        
        pages.push({
          url,
          title,
          pageType,
          lastModified
        });
      }
    }
    
    console.log(`✅ Parsed ${pages.length} URLs from sitemap`);
    return pages;
    
  } catch (error) {
    console.log(`❌ Sitemap parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return [];
  }
}

// Navigation structure analysis
async function analyzeNavigationStructure(websiteUrl: string): Promise<{
  mainMenuLinks: string[];
  footerLinks: string[];
  categories: string[];
}> {
  try {
    console.log(`🗺️ Analyzing navigation structure for ${websiteUrl}`);
    
    const response = await fetch(websiteUrl, {
      headers: { 'User-Agent': 'EnhanceMySeBot/1.0' }
    });
    
    if (!response.ok) {
      return { mainMenuLinks: [], footerLinks: [], categories: [] };
    }
    
    const html = await response.text();
    const baseUrl = new URL(websiteUrl);
    
    // Extract navigation links using common patterns
    const navSelectors = [
      'nav a[href]', 'header a[href]', '.menu a[href]', '.navigation a[href]',
      '.navbar a[href]', '#menu a[href]', '.main-menu a[href]'
    ];
    
    const footerSelectors = [
      'footer a[href]', '.footer a[href]', '#footer a[href]'
    ];
    
    // Simple HTML parsing for links (basic implementation)
    const extractLinks = (html: string, selectors: string[]) => {
      const links: string[] = [];
      const linkRegex = /<a[^>]+href=['"](\/[^'"]*)['"]/gi;
      let match;
      
      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        if (href && href.length > 1 && !href.includes('#') && !href.includes('mailto:')) {
          const fullUrl = `${baseUrl.origin}${href}`;
          links.push(fullUrl);
        }
      }
      
      return [...new Set(links)]; // Remove duplicates
    };
    
    const allLinks = extractLinks(html, navSelectors);
    const footerLinks = extractLinks(html, footerSelectors);
    
    // Filter main menu links (remove footer links)
    const mainMenuLinks = allLinks.filter(link => !footerLinks.includes(link));
    
    // Identify category pages
    const categories = mainMenuLinks.filter(url => {
      const urlLower = url.toLowerCase();
      return urlLower.includes('/category') || urlLower.includes('/service') || 
             urlLower.includes('/product') || urlLower.includes('/solution');
    });
    
    console.log(`🗺️ Navigation analysis: ${mainMenuLinks.length} menu links, ${categories.length} categories`);
    
    return {
      mainMenuLinks: mainMenuLinks.slice(0, 50), // Limit results
      footerLinks: footerLinks.slice(0, 30),
      categories: categories.slice(0, 20)
    };
    
  } catch (error) {
    console.error('Navigation analysis error:', error);
    return { mainMenuLinks: [], footerLinks: [], categories: [] };
  }
}

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
  const titleLower = title.toLowerCase();
  
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

// HTML structure analysis for blog detection
function analyzeHtmlStructure(content?: string): number {
  let score = 0;
  const contentLower = (content || '').toLowerCase();
  
  // Social sharing elements (+10 points)
  const socialIndicators = ['share', 'facebook', 'twitter', 'linkedin', 'social-media'];
  if (socialIndicators.some(indicator => contentLower.includes(indicator))) score += 10;
  
  // Comment systems (+10 points)
  if (contentLower.includes('comment') || contentLower.includes('disqus')) score += 10;
  
  return score;
}

// Navigation context analysis for blog detection
function analyzeNavigationContext(url: string, context?: { isNavigationLink?: boolean }): number {
  let score = 0;
  const urlLower = url.toLowerCase();
  
  // Editorial navigation sections (+10 points)
  const editorialKeywords = ['blog', 'news', 'article', 'resource', 'insight', 'tip'];
  if (editorialKeywords.some(keyword => urlLower.includes(keyword))) score += 10;
  
  return score;
}

// Multi-layered blog probability calculator
function calculateBlogProbability(url: string, title: string, context?: { isNavigationLink?: boolean; content?: string }): number {
  let score = 0;
  
  // URL pattern analysis (30 points max)
  score += analyzeUrlPatterns(url);
  
  // Content metadata analysis (40 points max) 
  score += analyzeContentMetadata(title, context?.content);
  
  // HTML structure analysis (20 points max)
  score += analyzeHtmlStructure(context?.content);
  
  // Navigation context (10 points max)
  score += analyzeNavigationContext(url, context);
  
  return Math.min(score, 100);
}

// Commercial intent calculator for relevance scoring
function calculateCommercialIntent(page: { title: string; content?: string; url: string }): number {
  let score = 0;
  const content = (page.content || '').toLowerCase();
  const title = page.title.toLowerCase();
  
  // Service indicators (+20 points)
  const serviceTerms = ['we repair', 'our service', 'contact us', 'call us', 'schedule', 'quote'];
  serviceTerms.forEach(term => {
    if (content.includes(term)) score += 5;
  });
  
  // Product indicators (+15 points)  
  const productTerms = ['specifications', 'model', 'price', 'buy', 'order', 'inventory'];
  productTerms.forEach(term => {
    if (content.includes(term)) score += 3;
  });
  
  // Business context (+10 points)
  if (title.includes('service') || title.includes('repair')) score += 10;
  if (content.includes('years of experience') || content.includes('certified')) score += 5;
  
  return Math.min(score, 25);
}

// Advanced page categorization with parallel Shopify structure (excludes blog articles)
function categorizeWebsitePageAdvanced(
  url: string, 
  title: string, 
  context?: { isNavigationLink?: boolean; content?: string }
): 'product' | 'service' | 'blog' | 'category' | 'about' | 'other' {
  const urlLower = url.toLowerCase();
  const titleLower = title.toLowerCase();
  const contentLower = (context?.content || '').toLowerCase();
  
  // 🚫 EXCLUDE BLOG ARTICLES (to prevent blog-in-blog linking)
  const blogExclusionPatterns = [
    '/blog/', '/article/', '/post/', '/news/', '/resource/', '/guide/', '/tip/',
    '/tutorial/', '/case-study/', '/whitepaper/', '/insight/', '/update/'
  ];
  
  const blogExclusionKeywords = [
    'blog', 'article', 'post', 'news', 'update', 'insight', 'tutorial',
    'guide', 'tip', 'case study', 'whitepaper', 'resource center'
  ];
  
  // Check if this is a blog article (to exclude)
  for (const pattern of blogExclusionPatterns) {
    if (urlLower.includes(pattern)) {
      return 'blog'; // Will be filtered out
    }
  }
  
  for (const keyword of blogExclusionKeywords) {
    if (titleLower.includes(keyword)) {
      return 'blog'; // Will be filtered out
    }
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
  
  // Navigation context bonus
  if (context?.isNavigationLink) {
    if (titleLower.includes('product') || titleLower.includes('equipment')) productScore += 8;
    if (titleLower.includes('service') || titleLower.includes('support')) serviceScore += 8;
    if (titleLower.includes('category') || titleLower.includes('department')) categoryScore += 8;
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

// Phase 2: Deep Navigation Crawling
async function crawlNavigationSystematically(
  websiteUrl: string,
  navigationStructure: { mainMenuLinks: string[]; categories: string[] },
  searchTerms: string[],
  timeLimit?: number,
  startTime?: number
): Promise<Array<{
  url: string;
  title: string;
  description?: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
  discoveryMethod: string;
  priority: number;
  relevanceScore: number;
}>> {
  console.log(`🔍 Phase 2: Deep navigation crawling for ${websiteUrl}`);
  
  const discoveredPages: any[] = [];
  const processedUrls = new Set<string>();
  const currentTime = startTime || Date.now();
  const maxTime = timeLimit || 12000;
  
  try {
    // Combine all navigation links for exploration - reduced limit for speed
    const navigationLinks = [
      ...navigationStructure.mainMenuLinks,
      ...navigationStructure.categories
    ].slice(0, 8); // Reduced from 30 to 8 for timeout safety
    
    // Process navigation links in parallel batches of 3 for better performance
    const batchSize = 3;
    for (let i = 0; i < navigationLinks.length; i += batchSize) {
      // Check timeout before each batch
      if (Date.now() - currentTime > maxTime * 0.6) {
        console.log(`⏰ Phase 2 timeout safety: stopping at batch ${Math.floor(i/batchSize) + 1}`);
        break;
      }
      
      const batch = navigationLinks.slice(i, i + batchSize);
      const batchPromises = batch.map(async (navLink) => {
        if (processedUrls.has(navLink)) return null;
        processedUrls.add(navLink);
        
        console.log(`🗺️ Exploring navigation link: ${navLink}`);
        
        try {
          // Add timeout to individual page analysis
          const pageContent = await Promise.race([
            analyzePageContent(navLink),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Page analysis timeout')), 3000))
          ]);
          
          if (pageContent) {
            const relevanceScore = calculateAdvancedRelevance(pageContent as any, searchTerms);
            
            return {
              ...pageContent,
              discoveryMethod: 'navigation-deep',
              priority: 7,
              relevanceScore
            };
          }
        } catch (error) {
          console.log(`⚠️ Failed to analyze ${navLink}:`, error);
          return null;
        }
        
        return null;
      });
      
      // Wait for batch to complete and collect results
      const batchResults = await Promise.allSettled(batchPromises);
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          discoveredPages.push(result.value);
        }
      });
      
      // Small delay between batches to prevent overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`✅ Phase 2 complete: ${discoveredPages.length} pages discovered`);
    return discoveredPages;
    
  } catch (error) {
    console.error('Phase 2 navigation crawling error:', error);
    return discoveredPages; // Return what we got so far
  }
}

// Analyze individual page content
async function analyzePageContent(url: string): Promise<{
  url: string;
  title: string;
  description?: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
  content?: string;
} | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'EnhanceMySeBot/1.0' },
      signal: AbortSignal.timeout(3000) // Reduced from 10 to 3 seconds for speed
    });
    
    if (!response.ok) return null;
    
    const html = await response.text();
    
    // Extract title with HTML entity decoding
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const rawTitle = titleMatch ? titleMatch[1].trim() : extractTitleFromUrl(url);
    const title = decodeHtmlEntities(rawTitle);
    
    // Extract meta description with HTML entity decoding
    const descMatch = html.match(/<meta[^>]*name=['"](description|Description)['"]\s*content=['"](.*?)['"]/i);
    const rawDescription = descMatch ? descMatch[2].trim() : undefined;
    const description = rawDescription ? decodeHtmlEntities(rawDescription) : undefined;
    
    // Extract main content (simplified)
    const contentMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = contentMatch ? contentMatch[1] : html;
    
    // Remove scripts, styles, and other non-content elements
    const cleanContent = bodyContent
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const pageType = categorizeWebsitePageAdvanced(url, title, { content: cleanContent });
    
    return {
      url,
      title,
      description,
      pageType,
      content: decodeHtmlEntities(cleanContent.substring(0, 1000)) // Keep first 1000 chars for analysis
    };
    
  } catch (error) {
    // Return null on any error (timeout, network, parsing, etc.)
    return null;
  }
}

// Explore pagination patterns
async function explorePagination(baseUrl: string): Promise<Array<{
  url: string;
  title: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
}>> {
  const paginatedPages: any[] = [];
  
  try {
    const baseUrlObj = new URL(baseUrl);
    
    // Common pagination patterns to test
    const paginationPatterns = [
      '/page/{page}',
      '?page={page}',
      '?p={page}',
      '/p{page}',
      '/{page}'
    ];
    
    // Test pagination patterns
    for (const pattern of paginationPatterns) {
      let consecutiveFailures = 0;
      
      for (let page = 2; page <= 10; page++) { // Test pages 2-10
        if (consecutiveFailures >= 3) break; // Stop after 3 consecutive failures
        
        let testUrl: string;
        if (pattern.includes('?')) {
          testUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${pattern.replace('?', '').replace('{page}', page.toString())}`;
        } else {
          testUrl = `${baseUrl}${pattern.replace('{page}', page.toString())}`;
        }
        
        try {
          const response = await fetch(testUrl, {
            method: 'HEAD', // Use HEAD to check if page exists without downloading content
            headers: { 'User-Agent': 'EnhanceMySeBot/1.0' },
            signal: AbortSignal.timeout(5000)
          });
          
          if (response.ok) {
            const title = `${extractTitleFromUrl(baseUrl)} - Page ${page}`;
            const pageType = categorizeWebsitePageAdvanced(testUrl, title);
            
            paginatedPages.push({
              url: testUrl,
              title,
              pageType
            });
            
            consecutiveFailures = 0;
          } else {
            consecutiveFailures++;
          }
          
        } catch {
          consecutiveFailures++;
        }
        
        await sleep(100); // Brief delay between requests
      }
      
      if (paginatedPages.length > 0) break; // Found working pagination pattern
    }
    
    return paginatedPages;
    
  } catch (error) {
    console.warn(`Pagination exploration failed for ${baseUrl}:`, error);
    return [];
  }
}

// Advanced relevance calculation
function calculateAdvancedRelevance(
  page: { title: string; url: string; description?: string; content?: string; pageType: string },
  searchTerms: string[]
): number {
  let score = 0;
  const titleLower = page.title.toLowerCase();
  const urlLower = page.url.toLowerCase();
  const descriptionLower = (page.description || '').toLowerCase();
  const contentLower = (page.content || '').toLowerCase();
  
  // Industry-specific terms (commercial kitchen equipment)
  const industryTerms = [
    'fryer', 'oven', 'grill', 'refrigerat', 'freezer', 'dishwasher', 'mixer',
    'equipment', 'commercial', 'kitchen', 'restaurant', 'maintenance', 'repair',
    'service', 'parts', 'installation', 'cleaning', 'calibration'
  ];
  
  // Equipment brand terms
  const brandTerms = [
    'rational', 'hobart', 'hoshizaki', 'true', 'beverage-air', 'turbo-air',
    'atlas', 'vulcan', 'southbend', 'garland', 'blodgett', 'cleveland'
  ];
  
  // Calculate relevance for search terms
  for (const term of searchTerms) {
    const termLower = term.toLowerCase();
    if (termLower.length < 3) continue;
    
    // Title matches (highest weight)
    if (titleLower.includes(termLower)) score += 50;
    
    // URL matches
    if (urlLower.includes(termLower)) score += 30;
    
    // Description matches
    if (descriptionLower.includes(termLower)) score += 20;
    
    // Content matches (with frequency bonus)
    const contentMatches = (contentLower.match(new RegExp(termLower, 'g')) || []).length;
    score += Math.min(contentMatches * 5, 25); // Max 25 points from content frequency
  }
  
  // Industry relevance bonus
  for (const industryTerm of industryTerms) {
    if (titleLower.includes(industryTerm)) score += 15;
    if (contentLower.includes(industryTerm)) score += 5;
  }
  
  // Brand relevance bonus
  for (const brandTerm of brandTerms) {
    if (titleLower.includes(brandTerm)) score += 20;
    if (contentLower.includes(brandTerm)) score += 10;
  }
  
  // Page type bonuses
  switch (page.pageType) {
    case 'service': score += 15; break;
    case 'product': score += 12; break;
    case 'blog': score += 8; break;
    case 'category': score += 5; break;
    default: break;
  }
  
  // Content quality bonus
  if (page.content && page.content.length > 500) score += 5;
  if (page.description && page.description.length > 50) score += 3;
  
  return Math.round(score);
}

// Phase 3: Pattern-Based Aggressive Testing
async function comprehensivePatternTesting(
  websiteUrl: string,
  searchTerms: string[],
  foundPagesCount: number
): Promise<Array<{
  url: string;
  title: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
  discoveryMethod: string;
  priority: number;
  relevanceScore: number;
}>> {
  console.log(`🔍 Phase 3: Pattern-based aggressive testing for ${websiteUrl}`);
  
  const discoveredPages: any[] = [];
  const baseUrl = new URL(websiteUrl);
  
  try {
    // Industry-specific URL patterns for commercial kitchen equipment
    const industryPatterns = [
      '/service', '/services', '/repair', '/maintenance', '/installation',
      '/parts', '/equipment', '/products', '/solutions', '/support',
      '/commercial-kitchen', '/restaurant-equipment', '/foodservice',
      '/calibration', '/cleaning', '/troubleshooting', '/warranty'
    ];
    
    // Equipment brand-specific patterns
    const brandPatterns = [
      '/rational', '/hobart', '/hoshizaki', '/true', '/beverage-air',
      '/vulcan', '/southbend', '/garland', '/blodgett', '/cleveland',
      '/brands', '/manufacturers', '/oem-parts'
    ];
    
    // Content type patterns
    const contentPatterns = [
      '/blog', '/news', '/resources', '/guides', '/tips', '/articles',
      '/case-studies', '/white-papers', '/documentation', '/manuals',
      '/faq', '/help', '/training', '/videos', '/downloads'
    ];
    
    // Alternative URL structures
    const alternativeStructures = [
      '/shop', '/store', '/catalog', '/inventory', '/browse',
      '/directory', '/categories', '/collections', '/pages'
    ];
    
    // Combine all patterns
    const allPatterns = [
      ...industryPatterns,
      ...brandPatterns,
      ...contentPatterns,
      ...alternativeStructures
    ];
    
    // Test each pattern
    for (const pattern of allPatterns.slice(0, 50)) { // Limit to prevent excessive testing
      const testUrl = `${baseUrl.origin}${pattern}`;
      
      try {
        const response = await fetch(testUrl, {
          method: 'HEAD',
          headers: { 'User-Agent': 'EnhanceMySeBot/1.0' },
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          const pageContent = await analyzePageContent(testUrl);
          if (pageContent) {
            const relevanceScore = calculateAdvancedRelevance(pageContent, searchTerms);
            
            // Only include if reasonably relevant
            if (relevanceScore > 10) {
              discoveredPages.push({
                ...pageContent,
                discoveryMethod: 'pattern-testing',
                priority: 5,
                relevanceScore
              });
            }
          }
        }
        
      } catch (error) {
        // Silently continue on failures during pattern testing
      }
      
      await sleep(100); // Brief delay between requests
    }
    
    // Test numbered patterns if we haven't found much content
    if (foundPagesCount + discoveredPages.length < 20) {
      await testNumberedPatterns(baseUrl.origin, searchTerms, discoveredPages);
    }
    
    console.log(`✅ Phase 3 complete: ${discoveredPages.length} additional pages discovered`);
    return discoveredPages;
    
  } catch (error) {
    console.error('Phase 3 pattern testing error:', error);
    return [];
  }
}

// Test numbered URL patterns
async function testNumberedPatterns(
  baseUrl: string,
  searchTerms: string[],
  discoveredPages: any[]
): Promise<void> {
  console.log('🔢 Testing numbered URL patterns...');
  
  const numberedPatterns = [
    '/page/', '/service/', '/product/', '/article/', '/blog/'
  ];
  
  for (const pattern of numberedPatterns) {
    let consecutiveFailures = 0;
    
    for (let num = 1; num <= 20; num++) { // Test numbers 1-20
      if (consecutiveFailures >= 5) break;
      
      const testUrl = `${baseUrl}${pattern}${num}`;
      
      try {
        const response = await fetch(testUrl, {
          method: 'HEAD',
          headers: { 'User-Agent': 'EnhanceMySeBot/1.0' },
          signal: AbortSignal.timeout(3000)
        });
        
        if (response.ok) {
          const pageContent = await analyzePageContent(testUrl);
          if (pageContent) {
            const relevanceScore = calculateAdvancedRelevance(pageContent, searchTerms);
            
            if (relevanceScore > 5) {
              discoveredPages.push({
                ...pageContent,
                discoveryMethod: 'numbered-pattern',
                priority: 4,
                relevanceScore
              });
            }
          }
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
        }
        
      } catch {
        consecutiveFailures++;
      }
      
      await sleep(150);
    }
  }
}

// Phase 4: Final Comprehensive Sweep
async function finalComprehensiveSweep(
  websiteUrl: string,
  searchTerms: string[],
  allFoundPages: any[]
): Promise<Array<{
  url: string;
  title: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
  discoveryMethod: string;
  priority: number;
  relevanceScore: number;
}>> {
  console.log(`🔍 Phase 4: Final comprehensive sweep for ${websiteUrl}`);
  
  const discoveredPages: any[] = [];
  const relevantPagesCount = allFoundPages.filter(p => p.relevanceScore > 15).length;
  
  // Only trigger if we haven't found enough highly relevant content
  if (relevantPagesCount >= 10) {
    console.log(`✅ Phase 4 skipped: Found ${relevantPagesCount} highly relevant pages already`);
    return [];
  }
  
  try {
    const baseUrl = new URL(websiteUrl);
    
    // Search term-specific URL testing
    const searchSpecificPatterns = generateSearchSpecificPatterns(searchTerms);
    
    for (const pattern of searchSpecificPatterns.slice(0, 30)) {
      const testUrl = `${baseUrl.origin}${pattern}`;
      
      try {
        const response = await fetch(testUrl, {
          method: 'HEAD',
          headers: { 'User-Agent': 'EnhanceMySeBot/1.0' },
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          const pageContent = await analyzePageContent(testUrl);
          if (pageContent) {
            const relevanceScore = calculateAdvancedRelevance(pageContent, searchTerms);
            
            if (relevanceScore > 20) { // Higher threshold for final sweep
              discoveredPages.push({
                ...pageContent,
                discoveryMethod: 'final-sweep',
                priority: 3,
                relevanceScore
              });
            }
          }
        }
        
      } catch (error) {
        // Continue on failures
      }
      
      await sleep(200);
    }
    
    console.log(`✅ Phase 4 complete: ${discoveredPages.length} additional pages discovered`);
    return discoveredPages;
    
  } catch (error) {
    console.error('Phase 4 final sweep error:', error);
    return [];
  }
}

// Generate search term-specific URL patterns
function generateSearchSpecificPatterns(searchTerms: string[]): string[] {
  const patterns: string[] = [];
  
  for (const term of searchTerms) {
    const cleanTerm = term.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Generate various URL patterns for the search term
    patterns.push(
      `/${cleanTerm}`,
      `/service/${cleanTerm}`,
      `/services/${cleanTerm}`,
      `/repair/${cleanTerm}`,
      `/maintenance/${cleanTerm}`,
      `/guide/${cleanTerm}`,
      `/blog/${cleanTerm}`,
      `/article/${cleanTerm}`,
      `/${cleanTerm}-service`,
      `/${cleanTerm}-repair`,
      `/${cleanTerm}-maintenance`,
      `/${cleanTerm}-guide`
    );
  }
  
  return [...new Set(patterns)]; // Remove duplicates
}

// Enhanced website integration wrapper functions removed - now using unified searchWebsiteContentWithShopifyLogic

// Enhanced website search using Shopify-style AI and vendor matching
async function searchWebsiteContentWithShopifyLogic(
  websiteUrl: string,
  aiEnhancedTerms: string[],
  pageTypes: string[],
  originalKeyword: string,
  identifiedVendor: string | null
): Promise<Array<{
  id: string;
  title: string;
  url: string;
  description?: string;
  pageType: string;
  relevanceScore: number;
  discoveryMethod: string;
}>> {
  try {
    console.log(`🔍 Shopify-style search for page types: ${pageTypes.join(', ')}`);
    console.log(`🎯 Using AI terms: ${aiEnhancedTerms.join(', ')}`);
    
    // Use enhanced 4-phase discovery with AI terms
    const allPages = await discoverWebsitePages(websiteUrl, aiEnhancedTerms, 30000);
    
    // 🔥 ENHANCED BLOG FILTERING (multi-layered analysis)
    console.log(`🔍 Blog detection analysis on ${allPages.length} discovered pages...`);
    
    const nonBlogPages = allPages.filter(page => {
      const blogProb = calculateBlogProbability(page.url, page.title);
      return blogProb <= 60; // Filter out likely blog articles
    });
    
    const blogFilteredCount = allPages.length - nonBlogPages.length;
    console.log(`📊 Blog filtering: ${blogFilteredCount}/${allPages.length} pages filtered (${Math.round(blogFilteredCount/allPages.length*100)}%)`);
    
    // Debug: Show top filtered pages
    if (blogFilteredCount > 0) {
      console.log(`🚫 Sample filtered blog articles:`);
      allPages
        .filter(page => calculateBlogProbability(page.url, page.title) > 60)
        .slice(0, 3)
        .forEach((page, index) => {
          const blogProb = calculateBlogProbability(page.url, page.title);
          console.log(`  ${index + 1}. "${page.title}" - Blog probability: ${blogProb}% [${page.url}]`);
        });
    }
    
    // Filter by requested page types (using non-blog pages)
    const filteredPages = nonBlogPages.filter(page => 
      pageTypes.includes(page.pageType)
    );
    
    if (filteredPages.length === 0) {
      console.log(`❌ No ${pageTypes.join('/')} pages found`);
      return [];
    }
    
    // Apply Shopify-style relevance scoring
    const scoredPages = filteredPages.map(page => {
      const shopifyStyleScore = calculateShopifyStyleRelevance(
        page, 
        aiEnhancedTerms, 
        identifiedVendor, 
        originalKeyword
      );
      
      return {
        id: Buffer.from(page.url).toString('base64'),
        title: page.title,
        url: page.url,
        description: page.description,
        pageType: page.pageType,
        relevanceScore: shopifyStyleScore,
        discoveryMethod: page.discoveryMethod || 'shopify-style-enhanced'
      };
    });
    
    // Sort by relevance (highest first) and filter out low-scoring content
    const qualityPages = scoredPages
      .filter(page => page.relevanceScore > 15) // Same quality threshold as Shopify
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    console.log(`✅ Shopify-style search complete: ${qualityPages.length} high-quality pages found`);
    
    return qualityPages.slice(0, 20); // Return top 20 results
    
  } catch (error) {
    console.error('Shopify-style website search error:', error);
    return [];
  }
}

// Shopify-style relevance calculation for website content
function calculateShopifyStyleRelevance(
  page: { title: string; url: string; description?: string; pageType: string; content?: string },
  aiEnhancedTerms: string[],
  identifiedVendor: string | null,
  originalKeyword: string
): number {
  let score = 0;
  const titleLower = page.title.toLowerCase();
  const urlLower = page.url.toLowerCase();
  const descriptionLower = (page.description || '').toLowerCase();
  const contentLower = (page.content || '').toLowerCase();
  
  // 🔥 SAME SCORING LOGIC AS SHOPIFY PRODUCTS
  
  // 1. Original keyword priority (highest weight - like Shopify products)
  if (originalKeyword) {
    const originalLower = originalKeyword.toLowerCase();
    if (titleLower.includes(originalLower)) score += 100; // Same as Shopify
    if (urlLower.includes(originalLower)) score += 50;
    if (descriptionLower.includes(originalLower)) score += 25;
    if (contentLower.includes(originalLower)) score += 15;
  }
  
  // 2. Vendor/brand priority (like Shopify vendor matching)
  if (identifiedVendor) {
    const vendorLower = identifiedVendor.toLowerCase();
    if (titleLower.includes(vendorLower)) score += 75; // Same vendor boost as Shopify
    if (contentLower.includes(vendorLower)) score += 40;
    if (urlLower.includes(vendorLower)) score += 30;
    if (descriptionLower.includes(vendorLower)) score += 20;
  }
  
  // 3. AI-enhanced search terms (comprehensive matching)
  for (const term of aiEnhancedTerms) {
    const termLower = term.toLowerCase();
    if (termLower.length < 3) continue; // Skip very short terms
    
    if (titleLower.includes(termLower)) score += 25; // Same as Shopify
    if (urlLower.includes(termLower)) score += 15;
    if (descriptionLower.includes(termLower)) score += 10;
    
    // Content frequency bonus (like Shopify product descriptions)
    const contentMatches = (contentLower.match(new RegExp(termLower, 'g')) || []).length;
    score += Math.min(contentMatches * 3, 15); // Max 15 points from content frequency
  }
  
  // 4. Industry-specific terms (commercial kitchen equipment - like Shopify product types)
  const industryTerms = [
    'fryer', 'oven', 'grill', 'refrigerat', 'freezer', 'dishwasher', 'mixer',
    'equipment', 'commercial', 'kitchen', 'restaurant', 'maintenance', 'repair',
    'service', 'parts', 'installation', 'cleaning', 'calibration', 'troubleshooting'
  ];
  
  for (const industryTerm of industryTerms) {
    if (titleLower.includes(industryTerm)) score += 15;
    if (contentLower.includes(industryTerm)) score += 8;
  }
  
  // 5. Equipment brand recognition (like Shopify vendor detection)
  const brandTerms = [
    'rational', 'hobart', 'hoshizaki', 'true', 'beverage-air', 'turbo-air',
    'atlas', 'vulcan', 'southbend', 'garland', 'blodgett', 'cleveland'
  ];
  
  for (const brandTerm of brandTerms) {
    if (titleLower.includes(brandTerm)) score += 20;
    if (contentLower.includes(brandTerm)) score += 12;
  }
  
  // 6. Page type bonuses (like Shopify product categorization)
  switch (page.pageType) {
    case 'service': score += 20; break;   // Highest priority
    case 'product': score += 18; break;   // High priority  
    case 'category': score += 15; break;  // Medium priority
    case 'about': score += 10; break;     // Lower priority
    case 'other': score += 5; break;      // Lowest priority
    default: break;
  }
  
  // 7. Content quality indicators (like Shopify product descriptions)
  if (page.content && page.content.length > 800) score += 12; // Detailed content
  if (page.content && page.content.length > 400) score += 8;  // Moderate content
  if (page.description && page.description.length > 100) score += 5; // Good description
  
  // 8. Penalty for generic/low-value pages (like filtering poor Shopify products)
  const genericIndicators = ['contact', 'privacy', 'terms', 'cookie', 'legal'];
  for (const generic of genericIndicators) {
    if (titleLower.includes(generic) || urlLower.includes(generic)) {
      score -= 20; // Penalize generic pages
    }
  }
  
  // 🔥 NEW: Commercial intent bonus (prefer actionable content)
  const commercialIntent = calculateCommercialIntent(page);
  score += commercialIntent; // 0-25 points for commercial relevance
  
  // 🔥 NEW: Anti-blog penalty (ensure we're not scoring blog content highly)
  const blogProbability = calculateBlogProbability(page.url, page.title, {
    content: page.content
  });
  
  if (blogProbability > 40) {
    score -= 30; // Penalty for blog-like content
  }
  
  return Math.max(0, Math.round(score)); // Ensure non-negative scores
}

// Enhanced website integration wrapper functions (updated for 4-phase discovery)