/**
 * Choosing which store products an article gets to work with.
 *
 * The store search finds products matching the keyword. What suits the article depends
 * on its content type: a versus article needs both sides, a how-to needs the supplies
 * the task uses, and nothing should recommend a product nobody can buy.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { CLAUDE_MODEL } from '@/lib/ai/models';
import { textFromMessage } from '@/lib/ai/text';
import type { ProductDetails } from '@/lib/shopify/product-details';
import type { CatalogProduct } from './types';

/** How many products the writer is shown. */
export const MAX_ARTICLE_PRODUCTS = 12;

/** Round-robin across lists, dropping repeats, so no single list crowds out the rest. */
export function interleaveProducts(lists: CatalogProduct[][], cap = MAX_ARTICLE_PRODUCTS): CatalogProduct[] {
  const seen = new Set<string>();
  const merged: CatalogProduct[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest && merged.length < cap; i += 1) {
    for (const list of lists) {
      const product = list[i];
      if (!product || seen.has(product.handle)) continue;
      seen.add(product.handle);
      merged.push(product);
      if (merged.length >= cap) break;
    }
  }
  return merged;
}

/**
 * One store search per side of a versus article, each carrying the product type the
 * keyword names: "Hoshizaki vs Manitowoc ice machines" searches "Hoshizaki ice
 * machines" and "Manitowoc ice machines", not just the brand names.
 */
export function versusSearches(keyword: string, subjects: [string, string]): string[] {
  const [a, b] = subjects;
  const lower = keyword.toLowerCase();
  const bAt = lower.indexOf(b.toLowerCase());
  // What follows both sides in the keyword, e.g. "ice machines" in "A vs B ice machines".
  const trailing =
    lower.includes(a.toLowerCase()) && bAt !== -1
      ? keyword.slice(bAt + b.length).replace(/[?:].*$/, '').trim()
      : '';
  // "A vs B ice machines" parses as ["A", "B ice machines"]: a one-word A gets B's product type.
  const borrowed = !trailing && !/\s/.test(a) ? b.split(/\s+/).slice(1).join(' ') : '';

  return [a, b].map((side) => {
    const extra = trailing || (side === a ? borrowed : '');
    return extra && !side.toLowerCase().includes(extra.toLowerCase()) ? `${side} ${extra}` : side;
  });
}

/**
 * Adds the looked-up details, then puts products that can be bought first, keeping the
 * search's relevance order within each group. Out-of-stock products are dropped when
 * enough others remain, and otherwise kept (marked) so the article can still name them.
 */
export function rankForArticle(
  products: CatalogProduct[],
  details: Map<string, ProductDetails>,
  cap = MAX_ARTICLE_PRODUCTS
): CatalogProduct[] {
  const seen = new Set<string>();
  const detailed = products
    .filter((p) => !seen.has(p.handle) && seen.add(p.handle))
    .map((product) => {
      const found = product.id ? details.get(product.id) : undefined;
      if (!found) return { ...product, inStock: product.inStock ?? null };
      return {
        ...product,
        vendor: product.vendor || found.vendor,
        productType: product.productType || found.productType,
        description: product.description || found.description,
        inStock: found.inStock,
      };
    });

  const rank = (p: CatalogProduct) => (p.inStock === true ? 0 : p.inStock === false ? 2 : 1);
  const sorted = detailed
    .map((product, index) => ({ product, index }))
    .sort((a, b) => rank(a.product) - rank(b.product) || a.index - b.index)
    .map(({ product }) => product);

  const available = sorted.filter((p) => p.inStock !== false);
  return (available.length >= 3 ? available : sorted).slice(0, cap);
}

/**
 * What a store would sell for doing this task: cleaners, tools, parts, filters. The
 * keyword itself finds the equipment, which a how-to reader usually already owns.
 */
export async function suggestSupplySearches(
  anthropic: Anthropic,
  keyword: string,
  businessType: string
): Promise<string[]> {
  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content:
            `A ${businessType || 'store'} is publishing a how-to article for the search "${keyword}". ` +
            'List up to 4 product searches for the supplies, tools, parts or consumables a reader needs to do ' +
            'this task, the kind of thing the store would sell, not the equipment the task is performed on. ' +
            'Word each the way it would appear in a product title: 1-2 words, the product noun first ' +
            '("descaler", "water filter", "sanitizer"), with the equipment brand only when supplies are ' +
            'brand-specific ("Hoshizaki cleaner"). Reply with a JSON array of strings only.',
        },
      ],
    });
    const text = textFromMessage(message);
    const json = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter((s) => s && s.length <= 40)
      .slice(0, 4);
  } catch {
    return [];
  }
}
