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

// Enhance the vendor identification function
async function identifyVendorFromKeyword(shopDomain: string, token: string, keyword: string, availableVendors: string[] = []): Promise<{ vendor: string | null; searchTerms: string[] }> {
  let vendorsList = availableVendors;
  
  if (vendorsList.length === 0) {
    console.log('No vendors list provided, fetching vendors from store...');
    vendorsList = await fetchShopifyVendors(shopDomain, token);
  }
  
  const keywordLower = keyword.toLowerCase();
  console.log(`Checking keyword "${keyword}" against ${vendorsList.length} vendors`);
  
  // First check for exact brand names in the full keyword
  const exactMatches = vendorsList.filter(vendor => 
    keywordLower.includes(vendor.toLowerCase())
  ).sort((a, b) => b.length - a.length); // Sort by length to prefer longer matches
  
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

// Function to search products using GraphQL for better performance
async function searchProductsWithGraphQL(shopDomain: string, token: string, searchTerms: string[], identifiedVendor: string | null = null): Promise<any[]> {
  console.log('Searching products using GraphQL with targeted queries...');
  console.log(`Using matching strategy: ${identifiedVendor ? `Flexible (vendor: "${identifiedVendor}")` : 'Strict (no vendor identified)'}`);
  const matchedProducts: any[] = [];
  
  // Search all terms - don't artificially limit to avoid missing important matches
  console.log(`Will search all ${searchTerms.length} generated terms:`, searchTerms.join(', '));
  
  for (const term of searchTerms) {
    if (matchedProducts.length >= 5) break; // Stop once we have enough products
    
    // Skip very short or common terms
    if (term.length < 4 || COMMON_WORDS.includes(term.toLowerCase())) {
      console.log(`Skipping GraphQL search for common/short term: "${term}"`);
      continue;
    }
    
    console.log(`Searching with GraphQL for term: "${term}"`);
    
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
        if (matchedProducts.length >= 5) break;
        
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
          
          // Filter and add products that haven't been added yet
          products.forEach((edge: any) => {
            const product = edge.node;
            
            // Double-check that product title actually contains our search term (case insensitive)
            // This ensures the GraphQL results are accurate
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
            
            // Add the product if it matches and hasn't been added yet
            if (isMatch && !matchedProducts.some(p => p.id === product.id) && matchedProducts.length < 5) {
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
              
              matchedProducts.push(transformedProduct);
              console.log(`✓ Added product via GraphQL: "${product.title}"`);
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
  }
  
  console.log(`GraphQL search completed. Found ${matchedProducts.length} matching products.`);
  if (matchedProducts.length > 0) {
    console.log('Found products:');
    matchedProducts.forEach((p: any) => console.log(`- ${p.title} (${p.vendor})`));
  }
  return matchedProducts;
}

// Function to search collections using GraphQL for better performance
async function searchCollectionsWithGraphQL(shopDomain: string, token: string, searchTerms: string[], identifiedVendor: string | null = null): Promise<any[]> {
  console.log('Searching collections using GraphQL with targeted queries...');
  console.log(`Using matching strategy for collections: ${identifiedVendor ? `Flexible (vendor: "${identifiedVendor}")` : 'Strict (no vendor identified)'}`);
  const matchedCollections: any[] = [];
  
  // Search all terms - don't artificially limit to avoid missing important matches
  console.log(`Will search all ${searchTerms.length} generated terms for collections:`, searchTerms.join(', '));
  
  for (const term of searchTerms) {
    if (matchedCollections.length >= 5) break; // Stop once we have enough collections
    
    // Skip very short or common terms
    if (term.length < 4 || COMMON_WORDS.includes(term.toLowerCase())) {
      console.log(`Skipping GraphQL search for common/short term: "${term}"`);
      continue;
    }
    
    console.log(`Searching collections with GraphQL for term: "${term}"`);
    
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
        if (matchedCollections.length >= 5) break;
        
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
          
          // Filter and add collections that haven't been added yet
          collections.forEach((edge: any) => {
            const collection = edge.node;
            
            // Check if collection title actually contains our search term (case insensitive)
            const collectionTitle = collection.title.toLowerCase();
            const searchTerm = term.toLowerCase();
            
            let isMatch = false;
            
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
                  console.log(`✓ Flexible collection match (vendor present): All words "${words.join(', ')}" found in collection: "${collection.title}"`);
                } else {
                  console.log(`✗ Flexible collection match failed: Not all words "${words.join(', ')}" found in collection: "${collection.title}"`);
                }
              } 
              // Strategy B: No vendor - strict exact phrase matching
              else {
                isMatch = collectionTitle.includes(searchTerm);
                if (isMatch) {
                  console.log(`✓ Strict exact phrase "${term}" found in collection: "${collection.title}"`);
                } else {
                  console.log(`✗ Strict collection match failed: Exact phrase "${term}" not found in collection: "${collection.title}"`);
                }
              }
            } else {
              // For single words, use word boundary matching if it's a significant term
              if (isSignificantTerm(term)) {
                const pattern = new RegExp(`\\b${escapeRegExp(searchTerm)}\\b`);
                isMatch = pattern.test(collectionTitle);
                if (isMatch) {
                  console.log(`✓ Word "${term}" found in collection: "${collection.title}"`);
                } else {
                  console.log(`✗ Word "${term}" not found in collection: "${collection.title}"`);
                }
              }
            }
            
            if (isMatch && !matchedCollections.some(c => c.id === collection.id) && matchedCollections.length < 5) {
              matchedCollections.push(collection);
              console.log(`✓ Added collection via GraphQL: "${collection.title}"`);
            }
          });
        }
      }
    } catch (error) {
      console.error(`Error in GraphQL search for collections term "${term}":`, error);
      continue;
    }
  }
  
  console.log(`GraphQL collections search completed. Found ${matchedCollections.length} matching collections.`);
  return matchedCollections;
}

// Update the main search functions to use GraphQL only, with REST as fallback
async function searchShopifyProducts(shopDomain: string, token: string, searchTerms: string[], availableVendors: string[] = []): Promise<any[]> {
  // Extract the original keyword from search terms
  const originalKeyword = searchTerms[0];
  
  // First, extract comprehensive terms using AI analysis
  const aiAnalysisResult = await extractKeyTerms('', originalKeyword, availableVendors);
  const aiExtractedTerms = aiAnalysisResult.searchTerms;
  const primaryVendor = aiAnalysisResult.primaryVendor;
  
  // Then, use the vendor identification function to get supplementary product-focused terms
  const { vendor: identifiedVendor, searchTerms: supplementaryTerms } = await identifyVendorFromKeyword(shopDomain, token, originalKeyword, availableVendors);
  
  // Use the vendor from AI analysis if available, otherwise use the identified vendor
  const finalVendor = primaryVendor || identifiedVendor;
  
  console.log(`Primary vendor identified: "${finalVendor || 'None found'}"`);
  console.log(`AI extracted terms (${aiExtractedTerms.length}):`, aiExtractedTerms.slice(0, 8).join(', '), aiExtractedTerms.length > 8 ? '...' : '');
  console.log(`Supplementary terms (${supplementaryTerms.length}):`, supplementaryTerms.join(', '));
  
  // Intelligently merge and prioritize the terms
  const mergedTerms = mergeAndPrioritizeSearchTerms(aiExtractedTerms, supplementaryTerms, originalKeyword, finalVendor);
  
  console.log(`Final merged and prioritized terms (${mergedTerms.length}):`, mergedTerms.join(', '));
  
  // Use GraphQL only - no REST fallback
  try {
    const graphqlResults = await searchProductsWithGraphQL(shopDomain, token, mergedTerms, finalVendor);
    
    if (graphqlResults.length > 0) {
      console.log(`GraphQL found ${graphqlResults.length} products, using these results`);
      return graphqlResults;
    } else {
      console.log('GraphQL search completed but no products matched any of the search terms.');
      console.log('Search terms that were tried:', mergedTerms.join(', '));
      return []; // Return empty array instead of falling back to REST
    }
  } catch (error) {
    console.error('GraphQL search failed:', error);
    console.log('No products found due to GraphQL search failure.');
    return []; // Return empty array instead of falling back to REST
  }
}

// Function to intelligently merge and prioritize search terms
function mergeAndPrioritizeSearchTerms(
  aiExtractedTerms: string[], 
  supplementaryTerms: string[], 
  originalKeyword: string, 
  vendor: string | null
): string[] {
  const finalTerms: string[] = [];
  const addedTerms = new Set<string>();
  
  // Helper function to add term if not already added
  const addTerm = (term: string, priority: string) => {
    const cleanTerm = term.toLowerCase().trim();
    if (cleanTerm.length > 3 && 
        !COMMON_WORDS.includes(cleanTerm) && 
        !addedTerms.has(cleanTerm) &&
        finalTerms.length < 15) { // Limit to 15 total terms for efficiency
      finalTerms.push(term);
      addedTerms.add(cleanTerm);
      console.log(`Added ${priority}: "${term}"`);
    }
  };
  
  // Priority 1: Original keyword (most important)
  addTerm(originalKeyword, 'Priority 1 (original keyword)');
  
  // Priority 2: Vendor + key component combinations from AI analysis
  if (vendor) {
    const vendorLower = vendor.toLowerCase();
    const keyComponents = ['motor', 'mixer', 'dishwasher', 'oven', 'scale', 'pump', 'valve', 'seal'];
    
    // Add vendor + component combinations that exist in AI extracted terms
    aiExtractedTerms.forEach(term => {
      const termLower = term.toLowerCase();
      if (termLower.includes(vendorLower) && 
          keyComponents.some(comp => termLower.includes(comp)) &&
          term.split(' ').length === 2) { // Focus on two-word combinations
        addTerm(term, 'Priority 2 (vendor + component)');
      }
    });
  }
  
  // Priority 3: Individual key terms (vendor and main components)
  if (vendor) {
    addTerm(vendor, 'Priority 3 (vendor)');
  }
  
  // Add key components that appear in the original keyword
  const originalWords = originalKeyword.toLowerCase().split(' ');
  const significantComponents = ['motor', 'mixer', 'dishwasher', 'oven', 'scale', 'pump', 'valve', 'seal'];
  significantComponents.forEach(component => {
    if (originalWords.includes(component)) {
      addTerm(component, 'Priority 3 (key component)');
    }
  });
  
  // Priority 4: Other meaningful multi-word terms from AI analysis
  aiExtractedTerms.forEach(term => {
    const termLower = term.toLowerCase();
    const words = term.split(' ');
    
    // Skip if already added or if it's a meaningless combination
    if (addedTerms.has(termLower)) return;
    
    // Add meaningful multi-word terms (but skip vague ones)
    if (words.length >= 2 && words.length <= 3) {
      const hasVagueWords = words.some(word => 
        ['importance', 'the', 'of', 'a', 'and', 'for', 'with'].includes(word.toLowerCase())
      );
      
      if (!hasVagueWords) {
        addTerm(term, 'Priority 4 (meaningful combination)');
      }
    }
  });
  
  // Priority 5: Supplementary product-focused terms (maintenance, parts)
  supplementaryTerms.forEach(term => {
    if (!addedTerms.has(term.toLowerCase())) {
      addTerm(term, 'Priority 5 (supplementary)');
    }
  });
  
  // Priority 6: Remaining single meaningful words from AI analysis
  aiExtractedTerms.forEach(term => {
    const termLower = term.toLowerCase();
    const words = term.split(' ');
    
    if (words.length === 1 && 
        !addedTerms.has(termLower) && 
        isSignificantTerm(term) &&
        !['importance'].includes(termLower)) {
      addTerm(term, 'Priority 6 (individual component)');
    }
  });
  
  console.log(`\nTerm prioritization complete. Selected ${finalTerms.length} terms from ${aiExtractedTerms.length + supplementaryTerms.length} total options.`);
  
  return finalTerms;
}

async function searchShopifyCollections(shopDomain: string, token: string, searchTerms: string[], availableVendors: string[] = []): Promise<any[]> {
  // Extract the original keyword from search terms
  const originalKeyword = searchTerms[0];
  
  // First, extract comprehensive terms using AI analysis
  const aiAnalysisResult = await extractKeyTerms('', originalKeyword, availableVendors);
  const aiExtractedTerms = aiAnalysisResult.searchTerms;
  const primaryVendor = aiAnalysisResult.primaryVendor;
  
  // Then, use the vendor identification function to get supplementary product-focused terms
  const { vendor: identifiedVendor, searchTerms: supplementaryTerms } = await identifyVendorFromKeyword(shopDomain, token, originalKeyword, availableVendors);
  
  // Use the vendor from AI analysis if available, otherwise use the identified vendor
  const finalVendor = primaryVendor || identifiedVendor;
  
  console.log(`Identified potential vendor for collections: "${finalVendor || 'None found'}"`);
  
  // Intelligently merge and prioritize the terms for collections
  const mergedTerms = mergeAndPrioritizeSearchTerms(aiExtractedTerms, supplementaryTerms, originalKeyword, finalVendor);
  
  // Filter out vague terms that are especially problematic for collections
  const validSearchTerms = mergedTerms.filter(term => {
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
        console.log(`No valid search terms found. Using original keyword: "${originalKeyword}"`);
        validSearchTerms.push(originalKeyword);
      }
    }
  }
  
  console.log(`Using filtered search terms for collections: ${validSearchTerms.join(', ')}`);
  
  // Use GraphQL only - no REST fallback
  try {
    const graphqlResults = await searchCollectionsWithGraphQL(shopDomain, token, validSearchTerms, finalVendor);
    
    if (graphqlResults.length > 0) {
      console.log(`GraphQL found ${graphqlResults.length} collections, using these results`);
      return graphqlResults;
    } else {
      console.log('GraphQL search completed but no collections matched any of the search terms.');
      console.log('Search terms that were tried:', validSearchTerms.join(', '));
      return []; // Return empty array instead of falling back to REST
    }
  } catch (error) {
    console.error('GraphQL collections search failed:', error);
    console.log('No collections found due to GraphQL search failure.');
    return []; // Return empty array instead of falling back to REST
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
      Please use a lot of formatting, tables and visuals are great for ranking on Google. If there is data that can be displayed through a table or other visual, ensure its removed from the text and replaced with the visual.
      Always include a modern styledkey takeaways table at the beginning of the article listing the key points of the topic.

      The article should be written in a ${toneOfVoice || 'professional'} tone and framed as ${contentType}.
      This is a ${businessType} so write from the perspective of that business.
      ${instructions ? `Additional instructions:\n${instructions}` : ''}
    `;

    // Generate content using Claude
    try {
      console.log('Calling Claude API for article generation');
      const message = await anthropic.messages.create({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 7000,
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