export interface ShopifyProduct {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  price: string;
  variants: Array<{
    id: string;
    price: string;
  }>;
}

export interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  description?: string;
}

export interface ShopifyPage {
  id: string;
  title: string;
  handle: string;
  url: string;
}

// New: Website content interfaces
export interface WebsitePage {
  id: string;
  title: string;
  url: string;
  description?: string;
  pageType: 'product' | 'service' | 'blog' | 'category' | 'about' | 'other';
  relevanceScore?: number;
}

export interface AutomaticOptions {
  // Shopify content (existing - backward compatible)
  includeProducts: boolean;
  includeCollections: boolean;
  includePages: boolean;
  
  // Website content (unified approach)
  includeWebsiteContent?: boolean;      // All website pages (products, services, support, etc. - excluding blogs)
}

export interface ManualSelections {
  // Shopify content (existing - backward compatible)
  products: ShopifyProduct[];
  collections: ShopifyCollection[];
  pages: ShopifyPage[];
  
  // Website content (unified approach)
  websiteContent?: WebsitePage[];      // All website pages (products, services, support, etc. - excluding blogs)
}

export interface ContentSelection {
  mode: 'automatic' | 'manual';
  automaticOptions: AutomaticOptions;
  manualSelections: ManualSelections;
  usesSitemap: boolean;
}

export interface ContentSearchResults {
  // Shopify content (existing - backward compatible)
  products: ShopifyProduct[];
  collections: ShopifyCollection[];
  pages: ShopifyPage[];
  
  // Website content (new)
  websitePages?: WebsitePage[];
  
  hasNextPage: boolean;
  nextCursor?: string;
}

// New: Integration type detection
export type IntegrationType = 'shopify' | 'website' | 'both' | 'none';

// New: Unified content interface for easier handling
export interface UnifiedContent {
  id: string;
  title: string;
  url: string;
  description?: string;
  type: 'product' | 'collection' | 'page' | 'service' | 'blog' | 'category';
  source: 'shopify' | 'website';
  relevanceScore?: number;
} 