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

export const INTENT_LABELS: Record<KeywordIntent, string> = {
  buying: 'Buying',
  comparing: 'Comparing',
  'how-to': 'How-to',
  problem: 'Problem',
  informational: 'Learning',
};
