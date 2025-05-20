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
async function extractKeyTerms(text: string, keyword: string): Promise<string[]> {
  try {
    console.log('Extracting key terms from topic breakdown');
    // Extract the brand name (assuming it's the first word in the keyword)
    const brandName = keyword.split(' ')[0];
    
    const extractionPrompt = `
      For the topic "${keyword}", extract:
      1. The brand name: ${brandName}
      2. 5-8 basic component/part terms that would typically be found in product names for ${brandName} ${keyword.split(' ').slice(1).join(' ')}
      
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
    
    // Combine brand with each component term
    componentTerms.forEach(term => {
      brandComponentTerms.push(`${brandName} ${term}`);
    });
    
    // Also add basic combinations from the keyword
    keywordParts.forEach((part, i) => {
      if (i > 0 && part.length > 3) { // Skip first word (brand) and very short words
        brandComponentTerms.push(`${brandName} ${part}`);
      }
    });
    
    // Create other meaningful combinations from the keyword
    const otherCombinations: string[] = [];
    // Create pairs from adjacent words in the keyword
    for (let i = 0; i < keywordParts.length - 1; i++) {
      if (i !== 0 || keywordParts.length <= 2) { // Avoid duplicating brand component terms
        otherCombinations.push(`${keywordParts[i]} ${keywordParts[i+1]}`);
      }
    }
    
    // Final terms in priority order:
    // 1. Full keyword
    // 2. Brand name
    // 3. Brand + component combinations
    // 4. Component terms by themselves (critical for vendor-specific search)
    // 5. Other meaningful combinations
    // 6. Keyword parts (except very short ones)
    
    const finalTerms: string[] = [keyword, brandName];
    
    // Add brand-component combinations
    finalTerms.push(...brandComponentTerms);
    
    // Add component terms by themselves (critical addition for vendor-specific search)
    finalTerms.push(...componentTerms);
    
    // Add other combinations
    finalTerms.push(...otherCombinations);
    
    // Add individual keyword parts if they're meaningful
    keywordParts.forEach(part => {
      if (part.length > 3 && part !== brandName) {
        finalTerms.push(part);
      }
    });
    
    // Remove duplicates
    const uniqueTerms = Array.from(new Set(finalTerms.map(term => term.toLowerCase())))
      .map(term => term);
    
    console.log('Extracted search terms:', uniqueTerms);
    return uniqueTerms;
  } catch (error) {
    console.error('Error extracting key terms:', error);
    // Fallback to simpler extraction if AI fails
    const keywordParts = keyword.split(' ');
    const brandName = keywordParts[0];
    const fallbackTerms = [keyword, brandName];
    
    // Add brand + remaining keyword parts combinations
    for (let i = 1; i < keywordParts.length; i++) {
      if (keywordParts[i].length > 3) {
        fallbackTerms.push(`${brandName} ${keywordParts[i]}`);
        // Also add the component term by itself
        fallbackTerms.push(keywordParts[i]);
      }
    }
    
    // Add adjacent pairs 
    for (let i = 0; i < keywordParts.length - 1; i++) {
      fallbackTerms.push(`${keywordParts[i]} ${keywordParts[i+1]}`);
    }
    
    // Add some common component terms as a last resort
    if (keyword.toLowerCase().includes('espresso') || keyword.toLowerCase().includes('coffee')) {
      const commonComponents = ['portafilter', 'boiler', 'valve', 'hose', 'gasket', 'group', 'pump', 'seal', 'switch'];
      fallbackTerms.push(...commonComponents);
    }
    
    console.log('Fallback search terms:', fallbackTerms);
    return fallbackTerms;
  }
}

// Function to search Shopify products with vendor-first approach
async function searchShopifyProducts(shopDomain: string, token: string, searchTerms: string[]): Promise<any[]> {
  // Extract potential vendor name - typically the first word in the keyword
  const keywordParts = searchTerms[0].toLowerCase().split(' '); // First term is always the full keyword
  const potentialVendor = keywordParts[0]; // Assume first word is the brand/vendor
  
  console.log(`Using vendor-first approach with potential vendor: "${potentialVendor}"`);
  
  // Check if this vendor exists in the store
  const vendorExists = await checkVendorExists(shopDomain, token, potentialVendor);
  
  if (vendorExists) {
    // If vendor exists, use optimized vendor-specific search
    console.log(`Vendor "${potentialVendor}" exists in store - using targeted search`);
    return searchVendorProducts(shopDomain, token, potentialVendor, searchTerms);
  } else {
    // Fallback to searching all products
    console.log(`No products found for vendor "${potentialVendor}" - falling back to full catalog search`);
    return searchAllProducts(shopDomain, token, searchTerms);
  }
}

// Function to search Shopify collections with vendor-first approach
async function searchShopifyCollections(shopDomain: string, token: string, searchTerms: string[]): Promise<any[]> {
  // Extract potential vendor name - typically the first word in the keyword
  const keywordParts = searchTerms[0].toLowerCase().split(' '); // First term is always the full keyword
  const potentialVendor = keywordParts[0]; // Assume first word is the brand/vendor
  
  console.log(`Using vendor-first approach for collections with potential vendor: "${potentialVendor}"`);
  
  // Check if this vendor exists in the store by checking products
  // We reuse the same vendor check as for products
  const vendorExists = await checkVendorExists(shopDomain, token, potentialVendor);
  
  if (vendorExists) {
    // If vendor exists, try to find collections that match the vendor name first
    console.log(`Vendor "${potentialVendor}" exists in store - prioritizing collections with this vendor name`);
    
    // For collections, we'll modify our search approach to prioritize the vendor name
    // but still use the existing search mechanism, as collections aren't associated with vendors in Shopify API
    
    // Create a prioritized list of search terms with vendor name first
    const prioritizedTerms = [
      potentialVendor, // Just the vendor name
      ...searchTerms.filter(term => term.toLowerCase() !== potentialVendor.toLowerCase()) // All other terms
    ];
    
    // Filter out vague terms more aggressively
    const validSearchTerms = prioritizedTerms.filter(term => {
      // Expanded list of vague terms to filter out
      const vague = [
        'espresso machine', 'machine parts', 'espresso', 'machine', 'parts',
        'group', 'equipment', 'commercial', 'head', 'professional',
        'accessory', 'accessories', 'component', 'components'
      ];
      
      // Remove very short terms (except the vendor name)
      if (term.length < 4 && term.toLowerCase() !== potentialVendor.toLowerCase()) {
        console.log(`Filtering out short term: "${term}"`);
        return false;
      }
      
      // Remove vague terms
      if (vague.includes(term.toLowerCase())) {
        console.log(`Filtering out vague term: "${term}"`);
        return false;
      }
      
      return true;
    });
    
    // Ensure we always include at least the vendor name if all terms were filtered
    if (validSearchTerms.length === 0) {
      console.log(`All search terms were filtered. Falling back to vendor name: "${potentialVendor}"`);
      validSearchTerms.push(potentialVendor);
    }
    
    console.log(`Using filtered search terms for collections: ${validSearchTerms.join(', ')}`);
    return searchAllCollections(shopDomain, token, validSearchTerms);
  } else {
    // Fallback to searching all collections with original terms
    console.log(`No products found for vendor "${potentialVendor}" - using standard collection search`);
    
    // Filter out vague terms more aggressively
    const validSearchTerms = searchTerms.filter(term => {
      // Expanded list of vague terms to filter out
      const vague = [
        'espresso machine', 'machine parts', 'espresso', 'machine', 'parts',
        'group', 'equipment', 'commercial', 'head', 'professional',
        'accessory', 'accessories', 'component', 'components'
      ];
      
      // Remove very short terms
      if (term.length < 4) {
        console.log(`Filtering out short term: "${term}"`);
        return false;
      }
      
      // Remove vague terms
      if (vague.includes(term.toLowerCase())) {
        console.log(`Filtering out vague term: "${term}"`);
        return false;
      }
      
      return true;
    });
    
    // If all terms were filtered, use just the first word of the original keyword
    if (validSearchTerms.length === 0) {
      console.log(`All search terms were filtered. Falling back to first word of keyword: "${keywordParts[0]}"`);
      validSearchTerms.push(keywordParts[0]);
    }
    
    console.log(`Using filtered search terms for collections: ${validSearchTerms.join(', ')}`);
    return searchAllCollections(shopDomain, token, validSearchTerms);
  }
}

// Function to search all Shopify collections (original implementation)
async function searchAllCollections(shopDomain: string, token: string, searchTerms: string[]): Promise<any[]> {
  let matchedCollections: any[] = [];
  
  // Function to search a batch of collections with our terms
  const searchCollectionBatch = (collections: any[]): any[] => {
    const results: any[] = [];
    const scoredCollections: {collection: any, score: number}[] = [];
    
    // Extract primary vendor/brand name (first word in first search term)
    const keywordParts = searchTerms[0].toLowerCase().split(' ');
    const primaryVendor = keywordParts[0]; // e.g., "unic"
    
    console.log(`Primary vendor/brand for relevance filtering: "${primaryVendor}"`);
    
    // Score each collection based on relevance to search terms
    for (const collection of collections) {
      if (!collection.title) continue;
      
      const collectionTitle = collection.title.toLowerCase();
      let score = 0;
      let matchedTerms: string[] = [];
      
      // Check if collection has the primary vendor name - most important criteria
      const vendorPattern = new RegExp(`\\b${escapeRegExp(primaryVendor.toLowerCase())}\\b`);
      if (vendorPattern.test(collectionTitle)) {
        score += 100; // High boost for having the primary vendor name
        matchedTerms.push(primaryVendor);
        console.log(`Collection "${collection.title}" includes primary vendor "${primaryVendor}" (+100 pts)`);
      }
      
      // Check against each search term
      for (const term of searchTerms) {
        const words = term.split(' ');
        
        // Skip scoring against the primary vendor again
        if (term.toLowerCase() === primaryVendor.toLowerCase()) continue;
        
        if (words.length > 1) {
          // For multi-word terms, check if ALL words appear in the title
          const allWordsMatch = words.every(word => {
            const pattern = new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`);
            return pattern.test(collectionTitle);
          });
          
          if (allWordsMatch) {
            score += 50; // Good boost for matching multi-word terms
            matchedTerms.push(term);
            console.log(`Collection "${collection.title}" matches multi-word term "${term}" (+50 pts)`);
          }
        } else {
          // For single-word terms
          const pattern = new RegExp(`\\b${escapeRegExp(term.toLowerCase())}\\b`);
          if (pattern.test(collectionTitle)) {
            score += 25; // Smaller boost for matching single words
            matchedTerms.push(term);
            console.log(`Collection "${collection.title}" matches term "${term}" (+25 pts)`);
          }
        }
      }
      
      // Apply penalties for unrelated collections
      
      // Check for collections that seem unrelated to our primary vendor
      // This is where we filter out cases like "Pizza Group" for "Unic espresso machines"
      if (score < 100 && !matchedTerms.includes(primaryVendor)) {
        // Collection doesn't have primary vendor/brand and only matched on generic terms
        // Penalize heavily to avoid including irrelevant collections
        score -= 50;
        console.log(`Collection "${collection.title}" doesn't match primary vendor - penalized (-50 pts)`);
      }
      
      // Check if collection might be for a completely different brand
      const potentialCompetitors = ["la marzocco", "rocket", "lelit", "breville", "pizza group", "astoria", "slayer", "sanremo"];
      for (const competitor of potentialCompetitors) {
        if (collectionTitle.includes(competitor) && competitor !== primaryVendor.toLowerCase()) {
          score -= 100; // Heavy penalty for collections primarily about other brands
          console.log(`Collection "${collection.title}" appears to be for competing brand "${competitor}" (-100 pts)`);
        }
      }
      
      // Store collection with its score if it's positive
      if (score > 0) {
        scoredCollections.push({ collection, score });
      }
    }
    
    // Sort collections by relevance score (high to low)
    scoredCollections.sort((a, b) => b.score - a.score);
    
    // Log the scored collections for debugging
    console.log("Scored collections:");
    scoredCollections.forEach(item => {
      console.log(`- "${item.collection.title}" (score: ${item.score})`);
    });
    
    // Apply minimum relevance threshold - only include collections with reasonable relevance
    const RELEVANCE_THRESHOLD = 20; // Minimum score to be considered relevant
    
    // Take the top 5 most relevant collections that meet the threshold
    for (const item of scoredCollections) {
      if (item.score >= RELEVANCE_THRESHOLD && results.length < 5) {
        results.push(item.collection);
        console.log(`Selected collection: "${item.collection.title}" (score: ${item.score})`);
      }
    }
    
    return results;
  };
  
  // Fetch and search collections page by page
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
    // No MAX_PAGES limit - continue until we find enough collections or reach the end
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
          const newMatches = searchCollectionBatch(customData.custom_collections);
          
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
      // No MAX_PAGES limit - continue until we find enough collections or reach the end
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
            const newMatches = searchCollectionBatch(smartData.smart_collections);
            
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

// Function to get fallback products if the store has any products at all
async function getFallbackProducts(shopDomain: string, token: string): Promise<any[]> {
  try {
    console.log('Attempting to fetch any products as fallback');
    // Add rate limiting for this API call as well
    await sleep(500);
    
    // Try to get just a few products as fallback content
    const response = await fetch(`https://${shopDomain}/admin/api/2023-01/products.json?limit=5`, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`Fallback product fetch failed with status ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    if (data.products && data.products.length > 0) {
      console.log(`Found ${data.products.length} fallback products`);
      return data.products;
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching fallback products:', error);
    return [];
  }
}

// New function to check if a vendor exists in the store
async function checkVendorExists(shopDomain: string, token: string, vendorName: string): Promise<boolean> {
  try {
    console.log(`Checking if vendor "${vendorName}" exists in the Shopify store...`);
    
    // Rate limiting
    await sleep(500);
    
    // Search specifically for products from this vendor (limited to just 1 product)
    const url = `https://${shopDomain}/admin/api/2023-01/products.json?vendor=${encodeURIComponent(vendorName)}&limit=1`;
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        // Handle rate limiting
        const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
        console.log(`Rate limited during vendor check. Waiting ${retryAfter} seconds before retrying...`);
        await sleep(retryAfter * 1000);
        // Retry this check
        return checkVendorExists(shopDomain, token, vendorName);
      }
      console.error(`Error checking vendor: ${response.status}`);
      return false;
    }
    
    const data = await response.json();
    // Return true if we found at least one product from this vendor
    const exists = data.products && data.products.length > 0;
    if (exists) {
      console.log(`✓ Vendor "${vendorName}" found in store with ${data.products.length} product(s)`);
    } else {
      console.log(`✗ No products found for vendor "${vendorName}"`);
    }
    return exists;
  } catch (error) {
    console.error(`Error checking if vendor "${vendorName}" exists:`, error);
    return false;
  }
}

// Function to search products from a specific vendor
async function searchVendorProducts(shopDomain: string, token: string, vendorName: string, searchTerms: string[]): Promise<any[]> {
  console.log(`Searching products from vendor "${vendorName}"...`);
  let matchedProducts: any[] = [];
  
  // Categorize terms for prioritized searching
  const validSearchTerms = searchTerms.filter(term => {
    // Filter out the vague terms the user specifically doesn't want
    const vague = ['espresso machine', 'machine parts', 'espresso', 'machine', 'parts'];
    return !vague.includes(term.toLowerCase());
  });
  
  // Extract secondary terms (all except the vendor name and full keyword)
  const primaryKeyword = searchTerms[0]; // The full search query
  const secondaryTerms = validSearchTerms.filter(term => 
    term !== primaryKeyword && 
    term.toLowerCase() !== vendorName.toLowerCase() &&
    !term.toLowerCase().startsWith(vendorName.toLowerCase() + ' ') // Exclude compound terms with vendor
  );
  
  // Create compound terms by combining vendor with each secondary term
  const compoundTerms = secondaryTerms.map(term => `${vendorName} ${term}`);
  
  // CRITICAL DEBUG: Log the secondary terms we found
  console.log('Secondary terms identified:');
  secondaryTerms.forEach(term => console.log(`- ${term}`));
  
  // Force extract component terms directly from search terms - this is the key fix
  // Look for terms that start with the vendor name and extract the remainder
  const componentTermsFromCompounds = [];
  for (const term of searchTerms) {
    if (term.toLowerCase().startsWith(vendorName.toLowerCase() + ' ')) {
      const component = term.substring(vendorName.length).trim();
      if (component && component.length > 0) {
        componentTermsFromCompounds.push(component);
      }
    }
  }
  
  // Also add all secondary terms as component terms
  const componentTerms = [...new Set([...componentTermsFromCompounds, ...secondaryTerms])];
  
  // Combine all search terms in priority order
  const prioritizedTerms = [
    primaryKeyword, // Original full keyword
    ...compoundTerms, // Vendor + component terms
    ...validSearchTerms.filter(term => 
      term !== primaryKeyword && 
      !secondaryTerms.includes(term) && 
      term.toLowerCase() !== vendorName.toLowerCase()
    ) // Other terms
  ];
  
  console.log('Searching for the following prioritized terms:');
  prioritizedTerms.forEach(term => console.log(`- ${term}`));
  
  console.log('After filtering by vendor, looking for these component terms:');
  componentTerms.forEach(term => console.log(`- ${term}`));
  
  console.log('Also searching for these secondary terms:');
  secondaryTerms.forEach(term => console.log(`- ${term}`));
  
  // Add an early check for empty component terms
  if (componentTerms.length === 0) {
    console.log('CRITICAL ERROR: No component terms were extracted from search terms. Creating components from keywords.');
    // If we have no component terms but we have keywords, extract parts after vendor name
    const fullKeyword = searchTerms[0]; // e.g., "unic espresso machine parts"
    if (fullKeyword && fullKeyword.toLowerCase().includes(vendorName.toLowerCase())) {
      const afterVendor = fullKeyword.substring(fullKeyword.toLowerCase().indexOf(vendorName.toLowerCase()) + vendorName.length).trim();
      const keywordParts = afterVendor.split(' ').filter(p => p.length > 3);
      componentTerms.push(...keywordParts);
      
      // Also add direct pairs from the keyword
      for (let i = 0; i < keywordParts.length - 1; i++) {
        componentTerms.push(`${keywordParts[i]} ${keywordParts[i+1]}`);
      }
      
      console.log('Created component terms from keyword:');
      componentTerms.forEach(term => console.log(`- ${term}`));
    }
    
    // As a last resort, use some common component terms for this domain
    if (componentTerms.length === 0) {
      const commonComponents = ['portafilter', 'boiler', 'valve', 'hose', 'gasket', 'group', 'pump', 'seal', 'switch'];
      componentTerms.push(...commonComponents);
      console.log('Using common component terms as fallback:');
      componentTerms.forEach(term => console.log(`- ${term}`));
    }
  }
  
  // Track the best match for each secondary term
  type ProductMatch = {
    product: any;
    score: number;
    matchedTerm: string;
  };
  
  // Initialize map to track best match for each term
  const bestMatches = new Map<string, ProductMatch>();
  
  // Keep track of products we've already matched to avoid duplicates
  const matchedProductIds = new Set<number>();
  
  // Function to evaluate a product for all secondary terms
  // CRITICAL FIX: Pass component terms and secondary terms explicitly as arguments
  const evaluateProduct = (product: any, componentTermsToUse: string[], secondaryTermsToUse: string[], compoundTermsToUse: string[]) => {
    if (!product.title) return;
    
    const productTitle = product.title.toLowerCase();
    const productDesc = product.body_html?.toLowerCase() || '';
    
    // Improved debug logging at random intervals
    const shouldLog = Math.random() < 0.01; // Log approximately 1% of products
    if (shouldLog) {
      console.log(`DEBUG - Evaluating product "${product.title}" against ${componentTermsToUse.length} component terms and ${secondaryTermsToUse.length} secondary terms`);
    }
    
    // Always check the component terms - this is our primary matching mechanism
    if (componentTermsToUse.length === 0) {
      console.log(`WARNING: No component terms available to search! This should not happen.`);
      return; // Skip processing if no terms to search
    }
    
    // Check for component terms directly since we already filtered by vendor
    // This is the key change - we're looking for "boiler", not "unic boiler"
    for (let i = 0; i < componentTermsToUse.length; i++) {
      // Skip if we already have 5 products
      if (matchedProductIds.size >= 5) break;
      
      const componentTerm = componentTermsToUse[i]; // e.g., "boiler", "pump"
      const matchTerm = i < compoundTermsToUse.length ? compoundTermsToUse[i] : `${vendorName} ${componentTerm}`; // e.g., "unic boiler" - just for tracking

      // Get individual words from the term
      const words = componentTerm.split(' ').filter(w => w.length > 2); // Filter out very short words
      
      // More detailed debug logging
      if (shouldLog) {
        console.log(`DEBUG - Looking for component "${componentTerm}" in product "${product.title}"`);
      }
      
      // Calculate match score with much higher weight for title matches
      let titleScore = 0;
      let descScore = 0;
      
      // PARTIAL MATCH - Allow more flexible matching
      // First, try a simple case-insensitive substring match (most lenient)
      if (productTitle.includes(componentTerm.toLowerCase())) {
        titleScore += 80; // Good boost for a simple substring match
        console.log(`SUBSTRING MATCH: Found "${componentTerm}" in title of "${product.title}"`);
      }
      
      // Next, try a word boundary match (more strict)
      const exactTermPattern = new RegExp(`\\b${escapeRegExp(componentTerm.toLowerCase())}\\b`);
      if (exactTermPattern.test(productTitle)) {
        titleScore += 50; // Additional boost for exact word boundary match
        console.log(`EXACT MATCH: Found "${componentTerm}" as a whole word in title of "${product.title}"`);
      }
      
      // Check for individual words matches in title
      let wordsFoundInTitle = 0;
      for (const word of words) {
        // Check for simple substring match first
        if (productTitle.includes(word.toLowerCase())) {
          titleScore += 5; // Some points for any word match
          wordsFoundInTitle++;
          
          // Create a regex pattern that matches the word with word boundaries (stricter)
          const pattern = new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`);
          if (pattern.test(productTitle)) {
            titleScore += 5; // Additional points for word boundary match
          }
          
          if (shouldLog) {
            console.log(`DEBUG - Found word "${word}" in title of "${product.title}"`);
          }
        }
      }
      
      // Bonus if ALL words appear in the title
      if (wordsFoundInTitle === words.length && words.length > 0) {
        titleScore += 25; // Additional bonus if all words are present
      }
      
      // Only check description if title score is low
      if (titleScore < 20) {
        // Check for exact term in description (lower priority)
        if (exactTermPattern.test(productDesc)) {
          descScore += 5;
        }
        
        // Check for words in description
        for (const word of words) {
          const pattern = new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`);
          if (pattern.test(productDesc)) {
            descScore += 1; // Much lower weight for description matches
          }
        }
      }
      
      // Combine scores (title is MUCH more important)
      const totalScore = titleScore + descScore;
      
      // If this product is a better match than what we've seen before for this term
      if (totalScore > 0) {
        if (!bestMatches.has(componentTerm) || bestMatches.get(componentTerm)!.score < totalScore) {
          console.log(`New best match for "${componentTerm}": "${product.title}" (score: ${totalScore})`);
          bestMatches.set(componentTerm, {
            product,
            score: totalScore,
            matchedTerm: matchTerm // Store the full compound term for reference
          });
        }
      }
    }
 
    // Also check against individual secondary terms directly (without vendor prefix)
    for (const term of secondaryTermsToUse) {
      // Skip if we already have 5 products
      if (matchedProductIds.size >= 5) break;
      
      const words = term.split(' ').filter(w => w.length > 2);
      
      // More detailed debug logging
      if (shouldLog) {
        console.log(`DEBUG - Looking for secondary term "${term}" in product "${product.title}"`);
      }
      
      // Calculate match score with high emphasis on title
      let titleScore = 0;
      let descScore = 0;
      
      // Check for exact term match in title - highest priority
      const exactTermPattern = new RegExp(`\\b${escapeRegExp(term.toLowerCase())}\\b`);
      if (exactTermPattern.test(productTitle)) {
        titleScore += 50; // High boost but slightly lower than compound terms
        console.log(`EXACT MATCH for term "${term}" in title of "${product.title}"`);
      }
      
      // Check for individual word matches in title
      let allWordsInTitle = true;
      for (const word of words) {
        // Create a regex pattern that matches the word with word boundaries
        const pattern = new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`);
        if (pattern.test(productTitle)) {
          titleScore += 5; // Good weight for title matches
        } else {
          allWordsInTitle = false;
        }
      }
      
      // Bonus if ALL words appear in the title
      if (allWordsInTitle && words.length > 1) {
        titleScore += 15; // Additional bonus
      }
      
      // Only check description if title score is low
      if (titleScore < 10) {
        // Check for exact term in description
        if (exactTermPattern.test(productDesc)) {
          descScore += 3;
        }
        
        for (const word of words) {
          const pattern = new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`);
          if (pattern.test(productDesc)) {
            descScore += 0.5; // Much lower weight for description matches
          }
        }
      }
      
      // Combine scores (title is much more important)
      const totalScore = titleScore + descScore;
      
      // If this product is a better match than what we've seen before for this term
      if (totalScore > 0) {
        if (!bestMatches.has(term) || bestMatches.get(term)!.score < totalScore) {
          console.log(`New best match for secondary term "${term}": "${product.title}" (score: ${totalScore})`);
          bestMatches.set(term, {
            product,
            score: totalScore,
            matchedTerm: term
          });
        }
      }
    }
  };

  try {
    // We're targeting a specific vendor, so we can use the vendor filter in the API
    let nextPageUrl: string | null = `https://${shopDomain}/admin/api/2023-01/products.json?vendor=${encodeURIComponent(vendorName)}&limit=250`;
    let hasNextPage = true;
    let pageCount = 1;
    const TIMEOUT_MS = 60000; // 1 minute timeout for each request
    
    let totalProductsChecked = 0;
    let startTime = Date.now();
    
    // Process all vendor products to find best matches for each term
    // Continue until we've exhausted all pages or found enough matches
    while (hasNextPage && nextPageUrl) {
      console.log(`Fetching page ${pageCount} of products from vendor "${vendorName}"...`);
      
      // Create an abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      try {
        // Rate limiting
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
        
        console.log(`Shopify vendor products API response status (page ${pageCount}):`, productsRes.status);
        
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
          console.log(`Found ${productsData.products.length} vendor products on page ${pageCount}, evaluating matches...`);
          
          // Check each product against our secondary terms
          if (componentTerms.length === 0 && secondaryTerms.length === 0) {
            console.log("CRITICAL: Both component terms and secondary terms are empty. Nothing to search for!");
            
            // Extract component terms directly from the first 10 products
            const sampledProducts = productsData.products.slice(0, 10);
            
            // Use product titles to identify potential component terms
            for (const product of sampledProducts) {
              if (!product.title) continue;
              
              const title = product.title.toLowerCase();
              // Skip the vendor name part
              if (title.startsWith(vendorName.toLowerCase())) {
                const afterVendor = title.substring(vendorName.length).trim();
                // Split into words and filter short ones
                const words = afterVendor.split(/[\s\-_]+/).filter((w: string) => w.length > 3);
                // Add meaningful words as component terms
                words.forEach((word: string) => {
                  if (!commonStopWords.includes(word)) {
                    componentTerms.push(word);
                  }
                });
              }
            }
            
            if (componentTerms.length > 0) {
              console.log("Extracted component terms from product titles:");
              componentTerms.forEach(term => console.log(`- ${term}`));
            } else {
              // Last resort - use common component terms
              const commonComponents = ['portafilter', 'boiler', 'valve', 'hose', 'gasket', 'group', 'pump', 'seal', 'switch'];
              componentTerms.push(...commonComponents);
              console.log('Using common component terms as fallback:');
              componentTerms.forEach(term => console.log(`- ${term}`));
            }
          }
          
          // Now evaluate each product
          productsData.products.forEach((product: any) => evaluateProduct(product, componentTerms, secondaryTerms, compoundTerms));
          
          // Report progress every 5 pages
          if (pageCount % 5 === 0) {
            const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
            console.log(`Progress update: ${totalProductsChecked} products checked in ${elapsedSeconds} seconds, found ${bestMatches.size} term matches so far`);
            
            // Log current best matches
            console.log('Current best matches by term:');
            bestMatches.forEach((match, term) => {
              console.log(`- ${term}: ${match.product.title} (score: ${match.score})`);
            });
          }
          
          // Add more detailed logging after each page processing
          console.log(`After page ${pageCount}, matched terms (${bestMatches.size}):`);
          if (bestMatches.size > 0) {
            bestMatches.forEach((match, term) => {
              console.log(`- ${term}: ${match.product.title} (score: ${match.score})`);
            });
          } else {
            console.log('No matches found yet');
          }
          
          // Check if we've found at least one good match (score >= 20) for each component term
          const goodComponentMatches = componentTerms.filter(term => {
            const match = bestMatches.get(term);
            return match && match.score >= 20;
          });
          
          console.log(`Found ${goodComponentMatches.length}/${componentTerms.length} high-quality component matches`);
          
          // Only exit early if we have good matches AND we have enough for a meaningful selection
          const hasGoodMatchesForComponents = goodComponentMatches.length > 0 && 
                                             (goodComponentMatches.length === componentTerms.length || 
                                              bestMatches.size >= 5);
          
          // Early exit if we've found good matches for all component terms
          if (hasGoodMatchesForComponents) {
            console.log(`Found ${goodComponentMatches.length} high-quality matches for component terms, stopping search.`);
            // List the matched terms and their scores
            goodComponentMatches.forEach(term => {
              const match = bestMatches.get(term)!;
              console.log(`- ${term}: ${match.product.title} (score: ${match.score})`);
            });
            break;
          }
          
          // Alternative check: have we found any matches for each component term?
          const matchedComponentTerms = componentTerms.filter(term => bestMatches.has(term));
          
          // Check secondary terms too
          const matchedSecondaryTerms = secondaryTerms.filter(term => bestMatches.has(term));
          
          console.log(`Found matches for ${matchedComponentTerms.length}/${componentTerms.length} component terms and ${matchedSecondaryTerms.length}/${secondaryTerms.length} secondary terms`);
          
          if ((matchedComponentTerms.length > 0 || matchedSecondaryTerms.length > 0) && bestMatches.size >= 5) {
            console.log(`Found enough matches (${bestMatches.size}) to select products, stopping search.`);
            break;
          }
        } else {
          console.log(`No vendor products found on page ${pageCount}`);
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
    
    // Process best matches, prioritizing products with direct title matches

    // Collect best matches by score
    const productMatches: ProductMatch[] = Array.from(bestMatches.values());
    
    // Group matches by whether they have direct title matches
    // Direct title matches are those with score >= 20 (indicating title relevance)
    const titleMatches = productMatches.filter(match => match.score >= 20);
    const otherMatches = productMatches.filter(match => match.score < 20);
    
    // Sort each group by score
    titleMatches.sort((a, b) => b.score - a.score);
    otherMatches.sort((a, b) => b.score - a.score);
    
    console.log(`Found ${titleMatches.length} products with strong title matches and ${otherMatches.length} other potential matches`);
    
    // Add products to our final list, prioritizing diversity of terms
    const addedTerms = new Set<string>();
    
    // First pass: add best title match for each component term (maintaining diversity)
    for (const componentTerm of componentTerms) {
      // Skip if we already have 5 products
      if (matchedProducts.length >= 5) break;
      
      const match = bestMatches.get(componentTerm);
      if (!match || match.score < 20) continue; // Skip if no strong match for this component
      
      // Skip if we already have this product
      if (matchedProductIds.has(match.product.id)) continue;
      
      // Add this product
      matchedProducts.push(match.product);
      matchedProductIds.add(match.product.id);
      addedTerms.add(componentTerm);
      
      console.log(`Selected product with TITLE match for component "${componentTerm}": ${match.product.title} (score: ${match.score})`);
    }
    
    // Second pass: add best title match for each secondary term not yet covered
    for (const term of secondaryTerms) {
      // Skip if we already have 5 products
      if (matchedProducts.length >= 5) break;
      
      const match = bestMatches.get(term);
      if (!match || match.score < 20) continue; // Skip if no strong match
      
      // Skip if we already have this product
      if (matchedProductIds.has(match.product.id)) continue;
      
      // Add this product
      matchedProducts.push(match.product);
      matchedProductIds.add(match.product.id);
      addedTerms.add(term);
      
      console.log(`Selected product with TITLE match for secondary term "${term}": ${match.product.title} (score: ${match.score})`);
    }
    
    // Third pass: add remaining top scoring title-matched products
    for (const match of titleMatches) {
      // Skip if we already have 5 products
      if (matchedProducts.length >= 5) break;
      
      // Skip if we already have this product
      if (matchedProductIds.has(match.product.id)) continue;
      
      // Add this product
      matchedProducts.push(match.product);
      matchedProductIds.add(match.product.id);
      
      console.log(`Added additional product with TITLE match for "${match.matchedTerm}": ${match.product.title} (score: ${match.score})`);
    }
    
    // Fourth pass: fill any remaining slots with other matches
    for (const match of otherMatches) {
      // Skip if we already have 5 products
      if (matchedProducts.length >= 5) break;
      
      // Skip if we already have this product
      if (matchedProductIds.has(match.product.id)) continue;
      
      // Add this product
      matchedProducts.push(match.product);
      matchedProductIds.add(match.product.id);
      
      console.log(`Added fallback product match for "${match.matchedTerm}": ${match.product.title} (score: ${match.score})`);
    }
    
    // Only if we still don't have enough products after all the above passes,
    // add any vendor products as fallback
    if (matchedProducts.length < 5 && pageCount > 0) {
      console.log(`Still need ${5 - matchedProducts.length} more products, adding generic vendor matches`);
      
      // Reset pagination to first page
      const fallbackUrl = `https://${shopDomain}/admin/api/2023-01/products.json?vendor=${encodeURIComponent(vendorName)}&limit=${5 - matchedProducts.length}`;
      
      try {
        // Rate limiting
        await sleep(500);
        
        const fallbackRes = await fetch(fallbackUrl, {
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          }
        });
        
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          
          if (fallbackData.products && fallbackData.products.length > 0) {
            // Add fallback products that aren't already in our list
            for (const product of fallbackData.products) {
              if (!matchedProductIds.has(product.id)) {
                matchedProducts.push(product);
                matchedProductIds.add(product.id);
                console.log(`Added generic fallback product: ${product.title}`);
                
                if (matchedProducts.length >= 5) break;
              }
            }
          }
        }
      } catch (e) {
        console.error('Error fetching fallback products:', e);
      }
    }
    
    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    console.log(`Completed vendor product search in ${elapsedSeconds} seconds. Checked ${totalProductsChecked} products and found ${matchedProducts.length} matches.`);
    
    console.log('Final product selection:');
    matchedProducts.forEach((p) => console.log(`- ${p.title} (${p.variants[0]?.price || 'N/A'})`));
    
    return matchedProducts.slice(0, 5);
  } catch (error) {
    console.error(`Error searching vendor products for "${vendorName}":`, error);
    return matchedProducts.slice(0, 5); // Return any products we found before the error
  }
}

// Function to search all Shopify products (original implementation, now as fallback)
async function searchAllProducts(shopDomain: string, token: string, searchTerms: string[]): Promise<any[]> {
  console.log('Searching all products across store (vendor-first approach failed)...');
  let matchedProducts: any[] = [];
  
  // Categorize terms into groups for prioritized searching
  const keywordParts = searchTerms[0].toLowerCase().split(' '); // First term is always the full keyword
  const brandName = keywordParts[0]; // Assume first word is the brand
  
  // Group terms for prioritized searching
  const brandCompoundTerms: string[] = [];
  const multiWordTerms: string[] = [];
  
  // Categorize each search term
  const validSearchTerms = searchTerms.filter(term => {
    // Filter out the vague terms the user specifically doesn't want
    const vague = ['espresso machine', 'machine parts', 'espresso', 'machine', 'parts'];
    return !vague.includes(term.toLowerCase());
  });
  
  // Re-organize terms for search
  for (const term of validSearchTerms) {
    const words = term.split(' ');
    
    // Skip the full original keyword as we'll handle it separately
    if (term === searchTerms[0]) continue;
    
    if (words.length > 1) {
      // Check if this is a brand compound term (starts with brand name)
      if (words[0].toLowerCase() === brandName.toLowerCase()) {
        brandCompoundTerms.push(term);
      } else {
        // Other multi-word terms
        multiWordTerms.push(term);
      }
    }
  }
  
  // Search priority order: original keyword, brand compounds, brand name only
  const searchPriority = [
    [searchTerms[0]], // Original full keyword
    brandCompoundTerms, // Brand + component terms (e.g., "unic gasket")
    multiWordTerms,     // Other multi-word terms that aren't in the vague list
    [brandName],        // Just the brand name
  ];
  
  // Function to search a batch of products with our terms
  const searchProductBatch = (products: any[]): any[] => {
    const results: any[] = [];
    
    // Execute searches in priority order
    for (const termGroup of searchPriority) {
      if (results.length >= 5) break; // Stop once we have enough products
      
      for (const term of termGroup) {
        if (results.length >= 5) break; // Stop once we have enough products
        
        console.log(`Searching current batch for term: "${term}"`);
        
        const words = term.split(' ');
        
        if (words.length > 1) {
          // For multi-word terms, implement a broader match where ALL words appear in the title
          // This handles cases like "unic hose" -> "Unic 12707 SILICONE HOSE"
          const titleMatches = products.filter((product: any) => {
            if (!product.title) return false;
            if (results.some(p => p.id === product.id)) return false; // Skip if already matched
            
            const productTitle = product.title.toLowerCase();
            // Check if ALL words in the search term appear as whole words in the title
            return words.every(word => {
              // Create a regex pattern that matches the word with word boundaries
              const pattern = new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`);
              return pattern.test(productTitle);
            });
          });
          
          console.log(`Found ${titleMatches.length} products by combined word match for "${term}" in this batch`);
          
          // Add unique products from title matches
          titleMatches.forEach((product: any) => {
            if (!results.some(p => p.id === product.id)) {
              results.push(product);
              console.log(`Added product by combined word match: "${product.title}"`);
            }
          });
          
          // Same approach for description search
          if (results.length < 5) {
            const descMatches = products.filter((product: any) => {
              if (!product.body_html || results.some(p => p.id === product.id)) return false;
              
              const productDesc = product.body_html.toLowerCase();
              // Check if ALL words in the search term appear as whole words in the description
              return words.every(word => {
                // Create a regex pattern that matches the word with word boundaries
                const pattern = new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`);
                return pattern.test(productDesc);
              });
            });
            
            console.log(`Found ${descMatches.length} products by combined word description match for "${term}" in this batch`);
            
            descMatches.forEach((product: any) => {
              if (!results.some(p => p.id === product.id)) {
                results.push(product);
                console.log(`Added product by combined word description match: "${product.title}"`);
              }
            });
          }
        } else {
          // For single-word terms (like just the brand name), use regex with word boundaries
          const titleMatches = products.filter((product: any) => {
            if (!product.title || results.some(p => p.id === product.id)) return false;
            
            const productTitle = product.title.toLowerCase();
            // Create a regex pattern that matches the word with word boundaries
            const pattern = new RegExp(`\\b${escapeRegExp(term.toLowerCase())}\\b`);
            return pattern.test(productTitle);
          });
          
          console.log(`Found ${titleMatches.length} products by title match for "${term}" in this batch`);
          
          // Add unique products from title matches
          titleMatches.forEach((product: any) => {
            if (!results.some(p => p.id === product.id)) {
              results.push(product);
              console.log(`Added product by title match: "${product.title}"`);
            }
          });
          
          // If we still don't have enough products, try description search
          if (results.length < 5) {
            const descMatches = products.filter((product: any) => {
              if (!product.body_html || results.some(p => p.id === product.id)) return false;
              
              const productDesc = product.body_html.toLowerCase();
              // Create a regex pattern that matches the word with word boundaries
              const pattern = new RegExp(`\\b${escapeRegExp(term.toLowerCase())}\\b`);
              return pattern.test(productDesc);
            });
            
            console.log(`Found ${descMatches.length} products by description match for "${term}" in this batch`);
            
            // Add unique products from description matches
            descMatches.forEach((product: any) => {
              if (!results.some(p => p.id === product.id)) {
                results.push(product);
                console.log(`Added product by description match: "${product.title}"`);
              }
            });
          }
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
          const newMatches = searchProductBatch(productsData.products);
          
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
          if (!searchTerms.includes(keyword)) {
            searchTerms.unshift(keyword);
          }
          
          try {
            if (articleMode === 'store') {
              console.log(`Fetching related products from Shopify store: ${shopDomain}`);
              
              // Search for products using multiple approaches
              const products = await searchShopifyProducts(shopDomain, shopifyAccessToken, searchTerms);
              
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
              const collections = await searchShopifyCollections(shopDomain, shopifyAccessToken, searchTerms);
              
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
              
              if (relatedProductsList || relatedCollectionsList) {
                shopifyPrompt = `
Here are related products and collections from the store. Use these throughout the article where relevant:

${relatedProductsList ? relatedProductsList : ''}
${relatedCollectionsList ? relatedCollectionsList : ''}

IMPORTANT INTEGRATION INSTRUCTIONS:
1. Naturally incorporate these products and collections throughout your article.
2. Replace generic mentions of terms like "${keyword.split(' ')[0]}" with the specific branded collection links when appropriate.
3. When discussing specific parts or components, reference the relevant products by name and link.
4. Ensure every section of the article includes at least one relevant product or collection reference where it makes sense.
5. Use the exact collection and product names when referring to them.
6. IMPORTANT: Only mention collections that are directly related to the main topic "${keyword}". Do not include collections like "Pizza Group" if the article is about "${keyword}".
7. Focus primarily on collections that contain the brand name "${keyword.split(' ')[0]}" as these are most relevant to the article topic.
8. When mentioning collections, explain their relevance to the article topic to maintain article focus.
`;
                console.log('Successfully added Shopify products/collections to prompt with enhanced integration instructions');
              } else {
                console.log('No Shopify products/collections found to add to prompt');
              }
            } else if (articleMode === 'service') {
              console.log(`Fetching related pages from Shopify store: ${shopDomain}`);
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
        console.error('Failed to connect to Shopify store:', error);
        shopifyIntegrationStatus = 'connection_error';
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
        max_tokens: 4000,
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