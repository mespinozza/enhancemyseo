export const COLLECTION_PLANS = 'collectionPlans';

export const PLAN_SIZES = [10, 25, 50, 100];
/** Collections created per request, so a big plan shows progress and survives a dropped call. */
export const CREATE_BATCH = 5;

/** The smart collection conditions we plan with: the ones a store's own data can back up. */
export type RuleColumn = 'TITLE' | 'VENDOR' | 'TYPE' | 'TAG' | 'VARIANT_PRICE';
export type RuleRelation = 'CONTAINS' | 'NOT_CONTAINS' | 'EQUALS' | 'NOT_EQUALS' | 'GREATER_THAN' | 'LESS_THAN';

export interface CollectionRule {
  column: RuleColumn;
  relation: RuleRelation;
  condition: string;
}

export const RULE_RELATIONS: Record<RuleColumn, RuleRelation[]> = {
  TITLE: ['CONTAINS', 'NOT_CONTAINS'],
  VENDOR: ['EQUALS', 'NOT_EQUALS'],
  TYPE: ['EQUALS', 'NOT_EQUALS'],
  TAG: ['EQUALS', 'NOT_EQUALS'],
  VARIANT_PRICE: ['GREATER_THAN', 'LESS_THAN'],
};

/**
 * ready: will be created. thin: too few products to be worth a page. broad: nearly the whole
 * store. duplicate: an existing collection, or an earlier idea, already shows these products.
 */
export type PlannedStatus = 'ready' | 'thin' | 'broad' | 'duplicate';

export interface PlannedCollection {
  id: string;
  theme: string;
  title: string;
  /** The search phrase the collection page is meant to rank for. */
  keyword: string;
  handle: string;
  rules: CollectionRule[];
  /** True when a product needs to match any rule rather than all of them. */
  disjunctive: boolean;
  seoTitle: string;
  seoDescription: string;
  description: string;
  products: number;
  samples: { title: string; image: string | null; url: string }[];
  status: PlannedStatus;
  /** Why an idea is not ready, e.g. "Same products as Flushmounts". */
  note: string | null;
  created: { id: string; handle: string; url: string; adminUrl: string; at: string } | null;
  error: string | null;
}

export interface CollectionPlan {
  id: string;
  brandId: string;
  name: string;
  focus: string | null;
  requested: number;
  items: PlannedCollection[];
  stats: { catalog: number; existingCollections: number };
  storefront: string;
  createdAt: string | null;
}

export interface ShopifyAccess {
  connected: boolean;
  shopDomain: string | null;
  /** Granted scopes allow creating and publishing collections. */
  canCreate: boolean;
  missingScopes: string[];
  /** Why the store cannot be reached, when it cannot. */
  reason: string | null;
}

const COLUMN_LABELS: Record<RuleColumn, string> = {
  TITLE: 'Title',
  VENDOR: 'Vendor',
  TYPE: 'Type',
  TAG: 'Tag',
  VARIANT_PRICE: 'Price',
};

const RELATION_LABELS: Record<RuleRelation, string> = {
  CONTAINS: 'contains',
  NOT_CONTAINS: 'does not contain',
  EQUALS: 'is',
  NOT_EQUALS: 'is not',
  GREATER_THAN: 'over',
  LESS_THAN: 'under',
};

export function describeRule(rule: CollectionRule): string {
  const value = rule.column === 'VARIANT_PRICE' ? `$${Number(rule.condition).toLocaleString()}` : `“${rule.condition}”`;
  return `${COLUMN_LABELS[rule.column]} ${RELATION_LABELS[rule.relation]} ${value}`;
}

export function handleize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
