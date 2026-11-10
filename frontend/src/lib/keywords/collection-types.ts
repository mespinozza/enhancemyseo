export const KEYWORD_COLLECTIONS = 'keywordCollections';

export type KeywordIntent = 'buying' | 'comparing' | 'how-to' | 'problem' | 'informational';

export interface KeywordIdea {
  keyword: string;
  intent: KeywordIntent;
  /** Content type that fits how the keyword is phrased, or null when any would do. */
  contentType: string | null;
  /** The store page an article on this keyword should link to. */
  linkTo: { kind: 'collection' | 'vendor' | 'product_type' | 'page'; name: string } | null;
}

export interface KeywordGroup {
  theme: string;
  keywords: KeywordIdea[];
}

export interface KeywordCollection {
  id: string;
  brandId: string;
  name: string;
  focus: string | null;
  groups: KeywordGroup[];
  stats: {
    products: number;
    collections: number;
    vendors: number;
    pages: number;
    articles: number;
    /** Ideas dropped because an existing article already covers them. */
    alreadyCovered: number;
  };
  /** Parts of the store Shopify would not share. */
  missing: string[];
  createdAt: string | null;
}

/** A collection, vendor or product type, and how many existing articles already cover it. */
export interface StoreTopic {
  name: string;
  products: number;
  /** Articles, in Shopify or written here, whose title or keyword names it. */
  covered: number;
  url: string | null;
}

/** What the store already has, shown before and alongside keyword collections. */
export interface StoreOverview {
  storefront: string;
  counts: {
    products: number;
    vendors: number;
    productTypes: number;
    collections: number;
    pages: number;
    shopifyArticles: number;
    appArticles: number;
  };
  collections: StoreTopic[];
  vendors: StoreTopic[];
  productTypes: StoreTopic[];
  pages: { title: string; url: string }[];
  articles: { title: string; url: string; blog: string }[];
  missing: string[];
}

export const INTENT_LABELS: Record<KeywordIntent, string> = {
  buying: 'Buying',
  comparing: 'Comparing',
  'how-to': 'How-to',
  problem: 'Problem',
  informational: 'Learning',
};
