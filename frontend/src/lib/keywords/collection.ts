import Anthropic from '@anthropic-ai/sdk';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { meteredFetch } from '@/lib/ai/meter';
import { CLAUDE_MODEL } from '@/lib/ai/models';
import { looseKeywordKey } from '@/lib/automation/keyword';
import { keywordContentTypes } from '@/lib/automation/content-type';
import { resolveShopifyCredentials } from '@/lib/shopify/credentials';
import { fetchStoreInventory, type StoreInventory } from '@/lib/shopify/inventory';
import {
  KEYWORD_COLLECTIONS,
  type KeywordCollection,
  type KeywordGroup,
  type KeywordIdea,
  type KeywordIntent,
  type StoreOverview,
} from './collection-types';

const INTENTS: KeywordIntent[] = ['buying', 'comparing', 'how-to', 'problem', 'informational'];
const LINK_KINDS = ['collection', 'vendor', 'product_type', 'page'] as const;

/** How much of the store goes into the prompt. Enough to see its shape, not every SKU. */
const PROMPT_LIMITS = { vendors: 60, productTypes: 40, collections: 80, pages: 40, products: 120, articles: 150 };

const TOOL = {
  name: 'save_keyword_collection',
  description: 'Save the long-tail keyword plan for this store.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Short name for this collection, under 60 characters.' },
      groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            theme: { type: 'string', description: 'What ties the keywords together, e.g. a collection, vendor or problem.' },
            keywords: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  keyword: { type: 'string', description: 'Lower case, 4 to 9 words, how a real shopper types it.' },
                  intent: { type: 'string', enum: INTENTS },
                  link_kind: { type: 'string', enum: LINK_KINDS },
                  link_name: { type: 'string', description: 'Exact name of the collection, vendor, product type or page from the store data.' },
                },
                required: ['keyword', 'intent', 'link_kind', 'link_name'],
              },
            },
          },
          required: ['theme', 'keywords'],
        },
      },
    },
    required: ['name', 'groups'],
  },
};

/** Storewide collections every shop has, which say nothing about what it sells. */
const GENERIC_COLLECTIONS = new Set(['frontpage', 'all', 'home-page', 'homepage', 'all-products']);

const INVENTORY_TTL_MS = 10 * 60 * 1000;
const inventoryCache = new Map<string, { at: number; shopDomain: string; inventory: StoreInventory }>();

/** The store's inventory, reused for a few minutes so viewing it and then building doesn't fetch twice. */
async function loadInventory(uid: string, brandId: string, fresh = false) {
  const key = `${uid}:${brandId}`;
  const cached = inventoryCache.get(key);
  if (!fresh && cached && Date.now() - cached.at < INVENTORY_TTL_MS) return cached;
  const { shopDomain, accessToken } = await resolveShopifyCredentials(uid, { brandId });
  const entry = { at: Date.now(), shopDomain, inventory: await fetchStoreInventory(shopDomain, accessToken) };
  inventoryCache.set(key, entry);
  return entry;
}

async function appArticleTitles(uid: string, brandId: string): Promise<string[]> {
  const snap = await getFirestore()
    .collection('blogs')
    .where('userId', '==', uid)
    .where('brandId', '==', brandId)
    .select('keyword', 'title')
    .get();
  return snap.docs
    .flatMap((d) => [d.get('keyword'), d.get('title')])
    .filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
}

/** How many of the articles name every meaningful word of `name`. */
function coverage(name: string, articles: Set<string>[]): number {
  const needed = Array.from(words(name));
  if (!needed.length) return 0;
  return articles.filter((article) => needed.every((w) => article.has(w))).length;
}

function topics(inventory: StoreInventory, titles: string[], storefront: string) {
  const articleWords = titles.map(words);
  // A collection holding nearly the whole catalogue ("Best Selling", "All") is a sort order, not a topic.
  const catchAll = (c: { products: number }) => inventory.totalProducts > 50 && c.products >= inventory.totalProducts * 0.9;
  const collections = inventory.collections
    .filter((c) => !GENERIC_COLLECTIONS.has(c.handle) && !catchAll(c))
    .map((c) => ({ name: c.title, products: c.products, covered: coverage(c.title, articleWords), url: `${storefront}/collections/${c.handle}` }));
  const vendors = inventory.vendors.map((v) => ({
    name: v.name,
    products: v.products,
    covered: coverage(v.name, articleWords),
    url: `${storefront}/collections/vendors?q=${encodeURIComponent(v.name)}`,
  }));
  const productTypes = inventory.productTypes.map((t) => ({
    name: t.name,
    products: t.products,
    covered: coverage(t.name, articleWords),
    url: `${storefront}/collections/types?q=${encodeURIComponent(t.name)}`,
  }));
  return { collections, vendors, productTypes };
}

export const storefrontFor = (website: unknown, shopDomain: string) =>
  (typeof website === 'string' && /^https?:\/\//.test(website.trim()) ? website.trim() : `https://${shopDomain}`).replace(/\/+$/, '');

export async function storeOverview(uid: string, brandId: string, fresh = false): Promise<StoreOverview> {
  initializeFirebaseAdmin();
  const brand = await getFirestore().collection('brandProfiles').doc(brandId).get();
  if (!brand.exists || brand.get('userId') !== uid) throw new Error('Brand profile not found');

  const [{ shopDomain, inventory }, appTitles] = await Promise.all([loadInventory(uid, brandId, fresh), appArticleTitles(uid, brandId)]);
  const storefront = storefrontFor(brand.get('websiteUrl'), shopDomain);
  const titles = [...appTitles, ...inventory.articles.map((a) => a.title)];
  const byProducts = <T extends { products: number }>(list: T[]) => [...list].sort((a, b) => b.products - a.products);
  const { collections, vendors, productTypes } = topics(inventory, titles, storefront);

  return {
    storefront,
    counts: {
      products: inventory.totalProducts,
      vendors: inventory.vendors.length,
      productTypes: inventory.productTypes.length,
      collections: collections.length,
      pages: inventory.pages.length,
      shopifyArticles: inventory.articles.length,
      appArticles: new Set(appTitles.map(looseKeywordKey)).size,
    },
    collections: byProducts(collections),
    vendors: byProducts(vendors),
    productTypes: byProducts(productTypes),
    pages: inventory.pages.map((p) => ({ title: p.title, url: `${storefront}/pages/${p.handle}` })),
    articles: inventory.articles.map((a) => ({
      title: a.title,
      blog: a.blog,
      url: a.blogHandle ? `${storefront}/blogs/${a.blogHandle}/${a.handle}` : storefront,
    })),
    missing: inventory.missing,
  };
}

function storeSummary(
  brand: { name: string; businessType?: string; website?: string },
  inventory: StoreInventory,
  focus: string | null,
  gaps: string[],
) {
  const list = (items: string[], max: number) => (items.length ? items.slice(0, max).join('; ') : '(none)');
  return [
    `Store: ${brand.name}${brand.businessType ? `, ${brand.businessType}` : ''}${brand.website ? ` (${brand.website})` : ''}.`,
    focus ? `Focus requested by the owner: ${focus}.` : '',
    `Vendors (by product count): ${list(inventory.vendors.map((v) => `${v.name} (${v.products})`), PROMPT_LIMITS.vendors)}`,
    `Product types: ${list(inventory.productTypes.map((t) => `${t.name} (${t.products})`), PROMPT_LIMITS.productTypes)}`,
    `Total active products: ${inventory.totalProducts}`,
    `Collections (by product count): ${list([...inventory.collections].sort((a, b) => b.products - a.products).map((c) => `${c.title} (${c.products})`), PROMPT_LIMITS.collections)}`,
    `Pages: ${list(inventory.pages.map((p) => p.title), PROMPT_LIMITS.pages)}`,
    `Sample products: ${list(inventory.products.map((p) => p.title), PROMPT_LIMITS.products)}`,
    `Blog articles already published (do not repeat these topics): ${list(inventory.articles.map((a) => a.title), PROMPT_LIMITS.articles)}`,
    gaps.length
      ? `Content gaps, collections and vendors with products but no article yet (favour these): ${list(gaps, 40)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function prompt(summary: string, count: number, alsoCovered: string[]) {
  return `You plan blog content for an online store. From the store data below, write ${count} long-tail keywords that this store can rank for and that lead readers to what it sells.

${summary}
${alsoCovered.length ? `\nArticles already written in our tool (also do not repeat): ${alsoCovered.slice(0, 150).join('; ')}` : ''}

Rules:
- Long tail: 4 to 9 words, specific, the way a shopper or operator actually searches. Use real brand, model, part and product-type names from the data.
- Every keyword must point to one real place in the store to link: a collection, vendor, product type or page, using its exact name from the data.
- Mix intents: buying ("best ... for ..."), comparing ("x vs y"), how-to, problems and fixes ("... not working"), and learning questions.
- Group them into 4 to 8 themes that follow the store's collections and vendors.
- No topics the store's existing articles already cover, and no near-duplicates of each other.
- Nothing the store cannot back up: if it does not sell or explain it, leave it out.

Call ${TOOL.name} with the result.`;
}

function words(text: string): Set<string> {
  return new Set(looseKeywordKey(text).split(' ').filter((w) => w.length > 2));
}

function similar(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / Math.min(a.size, b.size) >= 0.8 && shared >= 3;
}

let client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!client) {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');
    client = new Anthropic({ apiKey: key, fetch: meteredFetch });
  }
  return client;
}

export async function generateKeywordCollection(input: {
  uid: string;
  brandId: string;
  focus?: string | null;
  count?: number;
}): Promise<KeywordCollection> {
  initializeFirebaseAdmin();
  const db = getFirestore();
  const brand = await db.collection('brandProfiles').doc(input.brandId).get();
  if (!brand.exists || brand.get('userId') !== input.uid) throw new Error('Brand profile not found');

  const [{ shopDomain, inventory }, appTitles] = await Promise.all([
    loadInventory(input.uid, input.brandId),
    appArticleTitles(input.uid, input.brandId),
  ]);
  if (!inventory.products.length && !inventory.collections.length) {
    throw new Error('Shopify returned no products or collections for this store, so there is nothing to plan around yet.');
  }

  const focus = input.focus?.trim().slice(0, 200) || null;
  const count = Math.min(80, Math.max(10, input.count ?? 40));
  const found = topics(inventory, [...appTitles, ...inventory.articles.map((a) => a.title)], storefrontFor(brand.get('websiteUrl'), shopDomain));
  const gaps = Array.from(
    new Set(
      [...found.collections, ...found.vendors]
        .filter((t) => t.products > 0 && t.covered === 0)
        .sort((a, b) => b.products - a.products)
        .map((t) => t.name),
    ),
  );

  const message = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [
      {
        role: 'user',
        content: prompt(
          storeSummary({ name: brand.get('brandName'), businessType: brand.get('businessType'), website: brand.get('websiteUrl') }, inventory, focus, gaps),
          count,
          appTitles,
        ),
      },
    ],
  });
  const call = message.content.find((block) => block.type === 'tool_use');
  const raw = (call && 'input' in call ? call.input : {}) as {
    name?: string;
    groups?: { theme?: string; keywords?: { keyword?: string; intent?: string; link_kind?: string; link_name?: string }[] }[];
  };

  // Every place a keyword may link to, by lower-cased name, so made-up targets are dropped.
  const places = new Map<string, KeywordIdea['linkTo']>();
  for (const c of inventory.collections) places.set(`collection:${c.title.toLowerCase()}`, { kind: 'collection', name: c.title });
  for (const v of inventory.vendors) places.set(`vendor:${v.name.toLowerCase()}`, { kind: 'vendor', name: v.name });
  for (const t of inventory.productTypes) places.set(`product_type:${t.name.toLowerCase()}`, { kind: 'product_type', name: t.name });
  for (const p of inventory.pages) places.set(`page:${p.title.toLowerCase()}`, { kind: 'page', name: p.title });

  const existing = [...appTitles, ...inventory.articles.map((a) => a.title)];
  const existingKeys = new Set(existing.map(looseKeywordKey));
  const existingWords = existing.map(words);
  const seen: Set<string>[] = [];
  let alreadyCovered = 0;

  const groups: KeywordGroup[] = (raw.groups ?? [])
    .map((group) => {
      const keywords: KeywordIdea[] = [];
      for (const idea of group.keywords ?? []) {
        const keyword = idea.keyword?.trim().replace(/\s+/g, ' ').toLowerCase();
        if (!keyword || keyword.split(' ').length < 3) continue;
        const ideaWords = words(keyword);
        if (existingKeys.has(looseKeywordKey(keyword)) || existingWords.some((w) => similar(ideaWords, w))) {
          alreadyCovered += 1;
          continue;
        }
        if (seen.some((w) => similar(ideaWords, w))) continue;
        seen.push(ideaWords);
        keywords.push({
          keyword,
          intent: INTENTS.includes(idea.intent as KeywordIntent) ? (idea.intent as KeywordIntent) : 'informational',
          contentType: keywordContentTypes(keyword)[0] ?? null,
          linkTo: places.get(`${idea.link_kind}:${(idea.link_name ?? '').toLowerCase()}`) ?? null,
        });
      }
      return { theme: group.theme?.trim() || 'Ideas', keywords };
    })
    .filter((group) => group.keywords.length > 0);

  if (!groups.length) throw new Error('No new keywords came back. Try a different focus.');

  const ref = db.collection(KEYWORD_COLLECTIONS).doc();
  const now = Timestamp.now();
  const record = {
    userId: input.uid,
    brandId: input.brandId,
    name: raw.name?.trim().slice(0, 80) || (focus ? `Keywords: ${focus}` : 'Keyword collection'),
    focus,
    groups,
    stats: {
      products: inventory.totalProducts,
      collections: inventory.collections.length,
      vendors: inventory.vendors.length,
      pages: inventory.pages.length,
      articles: inventory.articles.length + new Set(appTitles.map(looseKeywordKey)).size,
      alreadyCovered,
    },
    missing: inventory.missing,
    createdAt: now,
  };
  await ref.set(record);
  return { id: ref.id, ...record, createdAt: now.toDate().toISOString() };
}

export async function listKeywordCollections(uid: string, brandId?: string | null): Promise<KeywordCollection[]> {
  initializeFirebaseAdmin();
  let query = getFirestore().collection(KEYWORD_COLLECTIONS).where('userId', '==', uid);
  if (brandId) query = query.where('brandId', '==', brandId);
  const snap = await query.get();
  return snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        brandId: data.brandId,
        name: data.name,
        focus: data.focus ?? null,
        groups: data.groups ?? [],
        stats: data.stats,
        missing: data.missing ?? [],
        createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
      } as KeywordCollection;
    })
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 50);
}

export async function deleteKeywordCollection(uid: string, id: string): Promise<boolean> {
  initializeFirebaseAdmin();
  const ref = getFirestore().collection(KEYWORD_COLLECTIONS).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.get('userId') !== uid) return false;
  await ref.delete();
  return true;
}
