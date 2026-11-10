import type { CatalogProduct } from '@/lib/shopify/catalog';
import { RULE_RELATIONS, type CollectionRule, type RuleColumn, type RuleRelation } from './types';

/** One rule against one product, the way Shopify evaluates it: case-insensitive. */
function test(product: CatalogProduct, rule: CollectionRule): boolean {
  const condition = rule.condition.trim().toLowerCase();
  switch (rule.column) {
    case 'TITLE': {
      const has = product.title.toLowerCase().includes(condition);
      return rule.relation === 'NOT_CONTAINS' ? !has : has;
    }
    case 'VENDOR':
    case 'TYPE': {
      const value = (rule.column === 'VENDOR' ? product.vendor : product.productType).trim().toLowerCase();
      return rule.relation === 'NOT_EQUALS' ? value !== condition : value === condition;
    }
    case 'TAG': {
      const has = product.tags.some((tag) => tag.trim().toLowerCase() === condition);
      return rule.relation === 'NOT_EQUALS' ? !has : has;
    }
    case 'VARIANT_PRICE': {
      const limit = Number(condition);
      return rule.relation === 'GREATER_THAN' ? product.price > limit : product.price < limit;
    }
  }
}

/** Indexes into `catalog` of every product the rules would put in the collection. */
export function matchProducts(catalog: CatalogProduct[], rules: CollectionRule[], disjunctive: boolean): number[] {
  const matched: number[] = [];
  catalog.forEach((product, index) => {
    if (disjunctive ? rules.some((r) => test(product, r)) : rules.every((r) => test(product, r))) matched.push(index);
  });
  return matched;
}

/** A rule from the model, or null when Shopify would not accept it. */
export function cleanRule(raw: { column?: string; relation?: string; condition?: string | number }): CollectionRule | null {
  const column = raw.column?.toUpperCase() as RuleColumn;
  const relation = raw.relation?.toUpperCase() as RuleRelation;
  const condition = String(raw.condition ?? '').trim().slice(0, 255);
  if (!RULE_RELATIONS[column]?.includes(relation) || !condition) return null;
  if (column === 'VARIANT_PRICE' && !(Number(condition) > 0)) return null;
  return { column, relation, condition };
}

/** Share of products two collections have in common, 1 meaning the same set. */
export function overlap(a: number[], b: Set<number>): number {
  if (!a.length || !b.size) return 0;
  let shared = 0;
  for (const index of a) if (b.has(index)) shared += 1;
  return shared / Math.max(a.length, b.size);
}
