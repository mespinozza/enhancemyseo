import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import OpenAI from 'openai';

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

// Common stop words to filter out from component terms
const commonStopWords = ['with', 'from', 'that', 'this', 'the', 'and', 'for', 'your', 'have', 'not'];

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
      keywordParts.forEach((part, i) => {
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
      data.data.shop.productVendors.edges.forEach((edge: any) => {
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
        data.products.forEach((product: any) => {
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

// Add interface for vendor scoring
interface ScoredVendorMatch {
  vendor: string;
  score: number;
}

// Add interface for product scoring
interface ProductScoreResult {
  score: number;
  product: any;
  matchedTerms: string[];
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
async function searchProductsWithGraphQL(shopDomain: string, token: string, searchTerms: string[], identifiedVendor: string | null = null, originalKeyword: string = ''): Promise<any[]> {
  console.log('Searching products using GraphQL with hybrid prioritization approach...');
  console.log(`Using matching strategy: ${identifiedVendor ? `Flexible (vendor: "${identifiedVendor}")` : 'Strict (no vendor identified)'}`);
  
  // Step 1: Prioritize search terms by relevance
  const prioritizedTerms = prioritizeSearchTerms(searchTerms, originalKeyword, identifiedVendor);
  console.log(`\nSearching ${prioritizedTerms.length} terms in priority order...`);
  
  // Step 2: Collect products with scores from all relevant terms
  const candidateProducts: { product: any, score: number, searchTerm: string }[] = [];
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
          products.forEach((edge: any) => {
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
                  variants: product.variants.edges.map((v: any) => ({
                    id: v.node.id,
                    price: v.node.price
                  }))
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
async function searchCollectionsWithGraphQL(shopDomain: string, token: string, searchTerms: string[], identifiedVendor: string | null = null, originalKeyword: string = ''): Promise<any[]> {
  console.log('Searching collections using GraphQL with hybrid prioritization approach...');
  console.log(`Using matching strategy for collections: ${identifiedVendor ? `Flexible (vendor: "${identifiedVendor}")` : 'Strict (no vendor identified)'}`);
  
  // Step 1: Prioritize search terms by relevance (reuse same logic as products)
  const prioritizedTerms = prioritizeSearchTerms(searchTerms, originalKeyword, identifiedVendor);
  console.log(`\nSearching ${prioritizedTerms.length} terms for collections in priority order...`);
  
  // Step 2: Collect collections with basic scoring
  const candidateCollections: { collection: any, score: number, searchTerm: string }[] = [];
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
          collections.forEach((edge: any) => {
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
async function searchShopifyProducts(shopDomain: string, token: string, searchTerms: string[], availableVendors: string[] = []): Promise<any[]> {
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

async function searchShopifyCollections(shopDomain: string, token: string, searchTerms: string[], availableVendors: string[] = []): Promise<any[]> {
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

// Function to search all Shopify collections
async function searchAllCollections(shopDomain: string, token: string, searchTerms: string[], vendorName: string | null = null): Promise<any[]> {
  let matchedCollections: any[] = [];
  
  // Function to search a batch of collections with our terms
  const searchCollectionBatch = (collections: any[], terms: string[]): any[] => {
    const results: any[] = [];
    
    // Execute searches in priority order
    for (const term of terms) {
      if (results.length >= 5) break; // Stop once we have enough collections
      
      // Skip very short or common terms
      if (term.length < 4 || COMMON_WORDS.includes(term.toLowerCase())) {
        console.log(`Skipping search for common/short term: "${term}"`);
        continue;
      }
      
      console.log(`Searching current batch for term: "${term}"`);
      
      const words = term.split(' ');
      
      if (words.length > 1) {
        // For multi-word terms, require exact phrase match in title
        const titleMatches = collections.filter((collection: any) => {
          if (!collection.title) return false;
          if (results.some(c => c.id === collection.id)) return false; // Skip if already matched
          
          const collectionTitle = collection.title.toLowerCase();
          
          // Only accept exact phrase matches
          if (collectionTitle.includes(term.toLowerCase())) {
            console.log(`Found exact phrase match in title: "${collection.title}" matches "${term}"`);
            return true;
          }
          return false;
        });
        
        console.log(`Found ${titleMatches.length} collections by exact phrase match for "${term}" in this batch`);
        
        // Add unique collections from title matches
        titleMatches.forEach((collection: any) => {
          if (!results.some(c => c.id === collection.id)) {
            results.push(collection);
            console.log(`Added collection by exact phrase match: "${collection.title}"`);
          }
        });
      } else {
        // For single-word terms, only search if it's a significant term
        if (isSignificantTerm(term)) {
          const titleMatches = collections.filter((collection: any) => {
            if (!collection.title || results.some(c => c.id === collection.id)) return false;
            
            const collectionTitle = collection.title.toLowerCase();
            // Create a regex pattern that matches the word with word boundaries
            const pattern = new RegExp(`\\b${escapeRegExp(term.toLowerCase())}\\b`);
            return pattern.test(collectionTitle);
          });
          
          console.log(`Found ${titleMatches.length} collections by exact word match for significant term "${term}" in this batch`);
          
          titleMatches.forEach((collection: any) => {
            if (!results.some(c => c.id === collection.id)) {
              results.push(collection);
              console.log(`Added collection by exact word match: "${collection.title}"`);
            }
          });
        } else {
          console.log(`Skipping search for non-significant single word term: "${term}"`);
        }
      }
    }
    
    return results.slice(0, 5); // Return at most 5 collections
  };
  
  try {
    console.log('Fetching and searching collections from Shopify store with pagination');
    
    // First fetch custom collections
    let hasNextPage = true;
    let nextPageUrl: string | null = `https://${shopDomain}/admin/api/2023-01/custom_collections.json?limit=250`;
    let pageCount = 1;
    const TIMEOUT_MS = 30000; // 30 second timeout for each request
    
    let totalCollectionsChecked = 0;
    let startTime = Date.now();
    
    // Custom collections first
    console.log('Fetching custom collections...');
    while (hasNextPage && nextPageUrl && matchedCollections.length < 5) {
      console.log(`Fetching custom collections page ${pageCount}...`);
      
      // Create an abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      try {
        // Add rate limiting - wait 500ms between requests to stay under 2 req/sec
        await sleep(500);
        
        const collectionsRes: Response = await fetch(nextPageUrl, {
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
          signal: controller.signal
        });
        
        // Clear the timeout since request completed
        clearTimeout(timeoutId);
        
        console.log(`Shopify custom collections API response status (page ${pageCount}):`, collectionsRes.status);
        
        if (!collectionsRes.ok) {
          const errorText = await collectionsRes.text();
          console.error(`Shopify API error (${collectionsRes.status}):`, errorText);
          
          // Handle rate limiting with exponential backoff
          if (collectionsRes.status === 429) {
            const retryAfter = parseInt(collectionsRes.headers.get('Retry-After') || '1', 10);
            console.log(`Rate limited. Waiting ${retryAfter} seconds before retrying...`);
            await sleep(retryAfter * 1000);
            pageCount--; // Retry this page
            continue;
          }
          
          throw new Error(`Shopify API returned ${collectionsRes.status}: ${errorText}`);
        }
        
        // Check for Link header which contains pagination info
        const linkHeader: string | null = collectionsRes.headers.get('Link');
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
        
        const customData = await collectionsRes.json();
        
        if (customData.custom_collections && customData.custom_collections.length > 0) {
          totalCollectionsChecked += customData.custom_collections.length;
          console.log(`Found ${customData.custom_collections.length} custom collections on page ${pageCount}, searching for matches...`);
          
          // Search this batch of collections immediately
          const newMatches = searchCollectionBatch(customData.custom_collections, searchTerms);
          
          // Add new matches to our collection
          newMatches.forEach(collection => {
            if (!matchedCollections.some(c => c.id === collection.id)) {
              matchedCollections.push(collection);
            }
          });
          
          console.log(`Found ${newMatches.length} matching collections on page ${pageCount}, total matches so far: ${matchedCollections.length}`);
          
          // Early exit if we have enough collections
          if (matchedCollections.length >= 5) {
            console.log(`Found enough matching collections (${matchedCollections.length}), stopping search.`);
            break;
          }
        } else {
          console.log(`No custom collections found on page ${pageCount}`);
        }
        
        pageCount++;
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.error(`Request for page ${pageCount} timed out after ${TIMEOUT_MS/1000} seconds`);
          // Move to the next page if we timeout
          pageCount++;
          continue;
        }
        throw error;
      }
    }
    
    // If we still need more collections, try smart collections
    if (matchedCollections.length < 5) {
      // Reset for smart collections
      hasNextPage = true;
      nextPageUrl = `https://${shopDomain}/admin/api/2023-01/smart_collections.json?limit=250`;
      pageCount = 1;
      
      console.log('Fetching smart collections...');
      while (hasNextPage && nextPageUrl && matchedCollections.length < 5) {
        console.log(`Fetching smart collections page ${pageCount}...`);
        
        // Create an abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        
        try {
          // Add rate limiting - wait 500ms between requests to stay under 2 req/sec
          await sleep(500);
          
          const smartCollectionsRes: Response = await fetch(nextPageUrl, {
            headers: {
              'X-Shopify-Access-Token': token,
              'Content-Type': 'application/json',
            },
            signal: controller.signal
          });
          
          // Clear the timeout since request completed
          clearTimeout(timeoutId);
          
          console.log(`Shopify smart collections API response status (page ${pageCount}):`, smartCollectionsRes.status);
          
          if (!smartCollectionsRes.ok) {
            const errorText = await smartCollectionsRes.text();
            console.error(`Shopify API error (${smartCollectionsRes.status}):`, errorText);
            
            // Handle rate limiting with exponential backoff
            if (smartCollectionsRes.status === 429) {
              const retryAfter = parseInt(smartCollectionsRes.headers.get('Retry-After') || '1', 10);
              console.log(`Rate limited. Waiting ${retryAfter} seconds before retrying...`);
              await sleep(retryAfter * 1000);
              pageCount--; // Retry this page
              continue;
            }
            
            throw new Error(`Shopify API returned ${smartCollectionsRes.status}: ${errorText}`);
          }
          
          // Check for Link header which contains pagination info
          const linkHeader: string | null = smartCollectionsRes.headers.get('Link');
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
          
          const smartData = await smartCollectionsRes.json();
          
          if (smartData.smart_collections && smartData.smart_collections.length > 0) {
            totalCollectionsChecked += smartData.smart_collections.length;
            console.log(`Found ${smartData.smart_collections.length} smart collections on page ${pageCount}, searching for matches...`);
            
            // Search this batch of collections immediately
            const newMatches = searchCollectionBatch(smartData.smart_collections, searchTerms);
            
            // Add new matches to our collection
            newMatches.forEach(collection => {
              if (!matchedCollections.some(c => c.id === collection.id)) {
                matchedCollections.push(collection);
              }
            });
            
            console.log(`Found ${newMatches.length} matching collections on page ${pageCount}, total matches so far: ${matchedCollections.length}`);
            
            // Early exit if we have enough collections
            if (matchedCollections.length >= 5) {
              console.log(`Found enough matching collections (${matchedCollections.length}), stopping search.`);
              break;
            }
          } else {
            console.log(`No smart collections found on page ${pageCount}`);
          }
          
          pageCount++;
        } catch (error: any) {
          if (error.name === 'AbortError') {
            console.error(`Request for page ${pageCount} timed out after ${TIMEOUT_MS/1000} seconds`);
            // Move to the next page if we timeout
            pageCount++;
            continue;
          }
          throw error;
        }
      }
    }
    
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`Completed collection search in ${elapsedSeconds} seconds. Checked ${totalCollectionsChecked} collections and found ${matchedCollections.length} matches.`);
    
    const finalCollections = matchedCollections.slice(0, 5);
    console.log(`Final collection selection (${finalCollections.length}):`);
    finalCollections.forEach((c: any) => console.log(`- ${c.title}`));
    
    return finalCollections;
  } catch (error) {
    console.error('Error fetching collections:', error);
    return matchedCollections.slice(0, 5); // Return any collections we found before the error
  }
}

// Function to search all Shopify products (original implementation, now as fallback)
async function searchAllProducts(shopDomain: string, token: string, searchTerms: string[]): Promise<any[]> {
  console.log('Searching all products across store (vendor-first approach failed)...');
  let matchedProducts: any[] = [];
  
  // Function to search a batch of products with our terms
  const searchProductBatch = (products: any[], terms: string[]): any[] => {
    const results: any[] = [];
    
    // Execute searches in priority order
    for (const term of terms) {
      if (results.length >= 5) break; // Stop once we have enough products
      
      // Skip very short or common terms
      if (term.length < 4 || COMMON_WORDS.includes(term.toLowerCase())) {
        console.log(`Skipping search for common/short term: "${term}"`);
        continue;
      }
      
      console.log(`Searching current batch for term: "${term}"`);
      
      const words = term.split(' ');
      
      if (words.length > 1) {
        // For multi-word terms, require exact phrase match in title
        const titleMatches = products.filter((product: any) => {
          if (!product.title) return false;
          if (results.some(p => p.id === product.id)) return false; // Skip if already matched
          
          const productTitle = product.title.toLowerCase();
          
          // Only accept exact phrase matches
          if (productTitle.includes(term.toLowerCase())) {
            console.log(`Found exact phrase match in title: "${product.title}" matches "${term}"`);
            return true;
          }
          return false;
        });
        
        console.log(`Found ${titleMatches.length} products by exact phrase match for "${term}" in this batch`);
        
        // Add unique products from title matches
        titleMatches.forEach((product: any) => {
          if (!results.some(p => p.id === product.id)) {
            results.push(product);
            console.log(`Added product by exact phrase match: "${product.title}"`);
          }
        });
      } else {
        // For single-word terms, only search if it's a significant term
        if (isSignificantTerm(term)) {
          const titleMatches = products.filter((product: any) => {
            if (!product.title || results.some(p => p.id === product.id)) return false;
            
            const productTitle = product.title.toLowerCase();
            // Create a regex pattern that matches the word with word boundaries
            const pattern = new RegExp(`\\b${escapeRegExp(term.toLowerCase())}\\b`);
            return pattern.test(productTitle);
          });
          
          console.log(`Found ${titleMatches.length} products by exact word match for significant term "${term}" in this batch`);
          
          titleMatches.forEach((product: any) => {
            if (!results.some(p => p.id === product.id)) {
              results.push(product);
              console.log(`Added product by exact word match: "${product.title}"`);
            }
          });
        } else {
          console.log(`Skipping search for non-significant single word term: "${term}"`);
        }
      }
    }
    
    return results.slice(0, 5); // Return at most 5 products
  };

  // Fetch and search products page by page
  try {
    console.log('Fetching and searching products from Shopify store with pagination');
    
    let hasNextPage = true;
    let nextPageUrl: string | null = `https://${shopDomain}/admin/api/2023-01/products.json?limit=250`;
    let pageCount = 1;
    const TIMEOUT_MS = 60000; // 1 minute timeout for each request
    
    // Keep track of progress
    let totalProductsChecked = 0;
    let startTime = Date.now();
    
    // No MAX_PAGES limit - continue until we find enough products or reach the end
    while (hasNextPage && nextPageUrl && matchedProducts.length < 5) {
      console.log(`Fetching product page ${pageCount}...`);
      
      // Create an abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      try {
        // Add rate limiting - wait 500ms between requests to stay under 2 req/sec
        await sleep(500);
        
        const productsRes: Response = await fetch(nextPageUrl, {
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
          signal: controller.signal
        });
        
        // Clear the timeout since request completed
        clearTimeout(timeoutId);
        
        console.log(`Shopify products API response status (page ${pageCount}):`, productsRes.status);
        
        if (!productsRes.ok) {
          const errorText = await productsRes.text();
          console.error(`Shopify API error (${productsRes.status}):`, errorText);
          
          // Handle rate limiting with exponential backoff
          if (productsRes.status === 429) {
            const retryAfter = parseInt(productsRes.headers.get('Retry-After') || '1', 10);
            console.log(`Rate limited. Waiting ${retryAfter} seconds before retrying...`);
            await sleep(retryAfter * 1000);
            pageCount--; // Retry this page
            continue;
          }
          
          throw new Error(`Shopify API returned ${productsRes.status}: ${errorText}`);
        }
        
        // Check for Link header which contains pagination info
        const linkHeader: string | null = productsRes.headers.get('Link');
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
        
        const productsData = await productsRes.json();
        
        if (productsData.products && productsData.products.length > 0) {
          totalProductsChecked += productsData.products.length;
          console.log(`Found ${productsData.products.length} products on page ${pageCount}, searching for matches...`);
          
          // Search this batch of products immediately
          const newMatches = searchProductBatch(productsData.products, searchTerms);
          
          // Add new matches to our collection
          newMatches.forEach(product => {
            if (!matchedProducts.some(p => p.id === product.id)) {
              matchedProducts.push(product);
            }
          });
          
          console.log(`Found ${newMatches.length} matching products on page ${pageCount}, total matches so far: ${matchedProducts.length}`);
          
          // Early exit if we have enough products
          if (matchedProducts.length >= 5) {
            console.log(`Found enough matching products (${matchedProducts.length}), stopping search.`);
            break;
          }
          
          // Report progress every 5 pages
          if (pageCount % 5 === 0) {
            const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
            console.log(`Progress update: ${totalProductsChecked} products checked in ${elapsedSeconds} seconds, found ${matchedProducts.length} matches so far`);
          }
        } else {
          console.log(`No products found on page ${pageCount}`);
        }
        
        pageCount++;
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.error(`Request for page ${pageCount} timed out after ${TIMEOUT_MS/1000} seconds`);
          // Move to the next page if we timeout
          pageCount++;
          continue;
        }
        throw error;
      }
    }
    
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`Completed product search in ${elapsedSeconds} seconds. Checked ${totalProductsChecked} products and found ${matchedProducts.length} matches.`);
    
    const finalProducts = matchedProducts.slice(0, 5);
    console.log(`Final product selection (${finalProducts.length}):`);
    finalProducts.forEach((p: any) => console.log(`- ${p.title}`));
    
    return finalProducts;
  } catch (error) {
    console.error('Error fetching products:', error);
    return matchedProducts.slice(0, 5); // Return any products we found before the error
  }
}

// Helper function to identify high-value terms worth checking in descriptions
function isHighValueTerm(term: string): boolean {
  // List of term patterns that indicate high value
  const highValuePatterns = [
    'food grade',
    'industrial grade',
    'food safe',
    'food processing',
    'kluberfood',
    'hydraulic',
    'lubricant',
    'grease'
  ];
  
  const termLower = term.toLowerCase();
  return highValuePatterns.some(pattern => termLower.includes(pattern));
}

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
function calculateProductRelevanceScore(product: any, searchTerm: string, originalKeyword: string, identifiedVendor: string | null): number {
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

export async function POST(request: Request) {
  try {
    console.log('Received article generation request');
    
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

    // Get the user's ID token from the Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    try {
      // Verify the ID token
      const decodedToken = await getAuth().verifyIdToken(idToken);
      if (!decodedToken.uid) {
        throw new Error('Invalid token');
      }
      console.log('User authenticated successfully:', decodedToken.uid);
    } catch (error) {
      console.error('Error verifying token:', error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

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
      brandGuidelines,
      articleMode,
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

    // 2. If articleMode is set, fetch Shopify data
    let relatedProductsList = '', relatedCollectionsList = '', relatedPagesList = '', shopifyPrompt = '';
    let shopifyIntegrationStatus = 'none'; // Track Shopify integration status
    
    if ((articleMode === 'store' || articleMode === 'service') && shopifyStoreUrl && shopifyAccessToken) {
      console.log(`Starting Shopify integration for ${articleMode} mode`);
      const shopDomain = shopifyStoreUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      
      // First, let's verify the Shopify credentials and connection
      try {
        console.log(`Verifying Shopify connection to ${shopDomain}`);
        // Add initial rate limiting delay before first API call
        await sleep(500);
        
        const verifyResponse = await fetch(`https://${shopDomain}/admin/api/2023-01/shop.json`, {
          headers: {
            'X-Shopify-Access-Token': shopifyAccessToken,
            'Content-Type': 'application/json',
          }
        });
        
        console.log('Shopify connection test status:', verifyResponse.status);
        
        if (!verifyResponse.ok) {
          const errorText = await verifyResponse.text();
          console.error(`Shopify connection error (${verifyResponse.status}):`, errorText);
          shopifyIntegrationStatus = 'auth_error';
          // Continue without throwing error to allow article generation to proceed
        } else {
          const shopData = await verifyResponse.json();
          console.log('Successfully connected to Shopify store:', shopData.shop?.name || shopDomain);
          
          // Extract key terms from topic breakdown
          const searchTerms = await extractKeyTerms(topicBreakdown || '', keyword);
          // Always include the original keyword
          if (!searchTerms.searchTerms.includes(keyword)) {
            searchTerms.searchTerms.unshift(keyword);
          }
          
          try {
            if (articleMode === 'store') {
              console.log(`Fetching related products from Shopify store: ${shopDomain}`);
              
              // First, fetch all vendors from the store
              console.log('Fetching all vendors before extracting key terms...');
              const availableVendors = await fetchShopifyVendors(shopDomain, shopifyAccessToken);
              console.log(`Found ${availableVendors.length} vendors in the store.`);
              
              // Extract key terms with vendor awareness
              const keyTermsResult = await extractKeyTerms(topicBreakdown || '', keyword, availableVendors);
              const searchTerms = keyTermsResult.searchTerms;
              const identifiedVendor = keyTermsResult.primaryVendor;
              
              console.log(`Using primary vendor "${identifiedVendor}" and ${searchTerms.length} search terms for product/collection search`);
              
              // Always include the original keyword
              if (!searchTerms.includes(keyword)) {
                searchTerms.unshift(keyword);
              }
              
              // Search for products using multiple approaches
              const products = await searchShopifyProducts(shopDomain, shopifyAccessToken, searchTerms, availableVendors);
              
              if (products.length > 0) {
                console.log(`Found ${products.length} products to include in article`);
                relatedProductsList = '"relatedProducts"\n' + products.map((p: any) => `<a href='${shopifyStoreUrl}/products/${p.handle}'>${p.title}</a> - $${p.variants[0]?.price || 'N/A'}`).join('\n');
                
                // Log the products being included
                console.log('Including products:');
                products.forEach((p: any) => console.log(`- ${p.title} ($${p.variants[0]?.price || 'N/A'})`));
                shopifyIntegrationStatus = 'success';
              } else {
                console.log('No related products found in Shopify store');
                shopifyIntegrationStatus = 'no_products';
              }
              
              console.log(`Fetching related collections from Shopify store: ${shopDomain}`);
              
              // Search for collections using multiple approaches
              const collections = await searchShopifyCollections(shopDomain, shopifyAccessToken, searchTerms, availableVendors);
              
              if (collections.length > 0) {
                console.log(`Found ${collections.length} related collections`);
                relatedCollectionsList = '"relatedCollections"\n' + collections.map((c: any) => `<a href='${shopifyStoreUrl}/collections/${c.handle}'>${c.title}</a>`).join('\n');
                
                // Log the collections being included
                console.log('Including collections:');
                collections.forEach((c: any) => console.log(`- ${c.title}`));
                if (shopifyIntegrationStatus !== 'success') {
                  shopifyIntegrationStatus = 'success';
                }
              } else {
                console.log('No related collections found in Shopify store');
                if (shopifyIntegrationStatus !== 'success') {
                  shopifyIntegrationStatus = 'no_collections';
                }
              }
              
              // Create shopifyPrompt for store mode with products and collections
              if (relatedProductsList || relatedCollectionsList) {
                shopifyPrompt = `
Here are related products and collections from the store. Use these throughout the article where relevant:

${relatedProductsList ? relatedProductsList : ''}
${relatedCollectionsList ? relatedCollectionsList : ''}

IMPORTANT INTEGRATION INSTRUCTIONS:
1. Naturally incorporate these products and collections throughout your article.
2. Replace generic mentions of terms like "${identifiedVendor || keyword.split(' ')[0]}" with the specific branded collection links when appropriate.
3. When discussing specific parts or components, reference the relevant products by name and link.
4. Ensure every section of the article includes at least one relevant product or collection reference where it makes sense.
5. Use the exact collection and product names when referring to them.
6. IMPORTANT: Only mention collections that are directly related to the main topic "${keyword}". Do not include collections like "Pizza Group" if the article is about "${keyword}".
7. Focus primarily on collections that contain the brand name "${identifiedVendor || keyword.split(' ')[0]}" as these are most relevant to the article topic.
8. When mentioning collections, explain their relevance to the article topic to maintain article focus.
`;
                console.log('Successfully added Shopify products/collections to prompt with enhanced integration instructions');
              } else {
                console.log('No Shopify products/collections found to add to prompt');
              }
              
            } else if (articleMode === 'service') {
              console.log(`Fetching related pages from Shopify store: ${shopDomain}`);
              
              // First, fetch all vendors from the store
              console.log('Fetching all vendors before extracting key terms...');
              const availableVendors = await fetchShopifyVendors(shopDomain, shopifyAccessToken);
              console.log(`Found ${availableVendors.length} vendors in the store.`);
              
              // Extract key terms with vendor awareness
              const keyTermsResult = await extractKeyTerms(topicBreakdown || '', keyword, availableVendors);
              const searchTerms = keyTermsResult.searchTerms;
              
              // Always include the original keyword
              if (!searchTerms.includes(keyword)) {
                searchTerms.unshift(keyword);
              }
              
              // Fetch pages
              try {
                const pagesRes = await fetch(`https://${shopDomain}/admin/api/2023-01/pages.json?title=${encodeURIComponent(searchTerms[0])}`, {
                  headers: {
                    'X-Shopify-Access-Token': shopifyAccessToken,
                    'Content-Type': 'application/json',
                  },
                });
                
                console.log('Shopify pages API response status:', pagesRes.status);
                
                if (!pagesRes.ok) {
                  const errorText = await pagesRes.text();
                  console.error(`Shopify API error (${pagesRes.status}):`, errorText);
                  shopifyIntegrationStatus = 'api_error';
                } else {
                  const pagesData = await pagesRes.json();
                  console.log('Shopify pages API response shape:', Object.keys(pagesData));
                  
                  if (pagesData.pages && pagesData.pages.length > 0) {
                    console.log(`Found ${pagesData.pages.length} related pages, using top ${Math.min(5, pagesData.pages.length)}`);
                    const selectedPages = pagesData.pages.slice(0, 5);
                    relatedPagesList = '"relatedPages"\n' + selectedPages.map((pg: any) => `<a href='${shopifyStoreUrl}/pages/${pg.handle}'>${pg.title}</a>`).join('\n');
                    
                    // Log the pages being included
                    console.log('Including pages:');
                    selectedPages.forEach((pg: any) => console.log(`- ${pg.title}`));
                    shopifyIntegrationStatus = 'success';
                  } else {
                    console.log('No related pages found in Shopify store or empty response');
                    console.log('API response preview:', JSON.stringify(pagesData).substring(0, 200) + '...');
                    shopifyIntegrationStatus = 'no_pages';
                  }
                  
                  if (relatedPagesList) {
                    shopifyPrompt = `
Here are related service pages from the store. Use these throughout the article where relevant:

${relatedPagesList}

IMPORTANT INTEGRATION INSTRUCTIONS:
1. Naturally incorporate these service pages throughout your article.
2. Replace generic mentions of services with specific page links when appropriate.
3. When discussing specific services or solutions, reference the relevant pages by name and link.
4. Ensure every section of the article includes at least one relevant page reference where it makes sense.
5. Use the exact page names when referring to them.
`;
                    console.log('Successfully added Shopify pages to prompt with enhanced integration instructions');
                  } else {
                    console.log('No Shopify pages found to add to prompt');
                  }
                }
              } catch (error) {
                console.error('Error fetching Shopify pages:', error);
                shopifyIntegrationStatus = 'api_error';
              }
            }
          } catch (err) {
            console.error('Error during Shopify data processing:', err);
            shopifyIntegrationStatus = 'api_error';
          }
        }
      } catch (error) {
        console.error('Error verifying Shopify connection:', error);
        shopifyIntegrationStatus = 'error';
        console.log('Will continue without Shopify product integration');
      }
    } else if (articleMode) {
      console.log(`Shopify integration requested (${articleMode} mode) but store URL or access token missing`);
      shopifyIntegrationStatus = 'missing_credentials';
    }

    console.log('Starting article generation with Claude');
    // 3. Construct the Claude prompt, including the topic breakdown and Shopify context
    
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
      ${shopifyPrompt}

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
      console.log('Calling Claude API for article generation');
      const message = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 8192,
        messages: [
          {
            role: "user",
            content: userPrompt
          }
        ]
      });

      // Get the generated content from the response
      const generatedContent = message.content[0].type === 'text' ? message.content[0].text : '';
      console.log('Successfully generated article content');

      // Extract title from the first <h1> tag
      const titleMatch = generatedContent.match(/<h1>(.*?)<\/h1>/);
      const title = titleMatch ? titleMatch[1] : `${keyword} - ${contentType}`;

      console.log('Article generation completed successfully');
      
      // Return the response including Shopify integration status
      return NextResponse.json({
        title,
        content: generatedContent,
        shopifyIntegration: {
          status: shopifyIntegrationStatus,
          message: getShopifyStatusMessage(shopifyIntegrationStatus)
        }
      });
    } catch (error) {
      console.error('Error generating article with Claude:', error);
      return NextResponse.json(
        { 
          error: 'Failed to generate article content',
          shopifyIntegration: {
            status: shopifyIntegrationStatus,
            message: getShopifyStatusMessage(shopifyIntegrationStatus)
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