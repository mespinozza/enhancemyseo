/**
 * Long-tail keyword collections for a Shopify store, planned before anything is created.
 *
 * The model proposes collections as smart collection rules. Every rule is then run against
 * the store's real catalogue here, so the preview shows exactly the products Shopify will
 * put in each one, and ideas that are empty, too broad or already in the store are held
 * back. Nothing reaches Shopify until the owner picks what to create.
 */
import { randomUUID } from 'crypto';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { CLAUDE_MODEL } from '@/lib/ai/models';
import { looseKeywordKey } from '@/lib/automation/keyword';
import { anthropic, storefrontFor } from '@/lib/keywords/collection';
import { ShopifyCredentialError, shopifyCredentialsForBrand } from '@/lib/shopify/credentials';
import { fetchCatalog, type CatalogProduct } from '@/lib/shopify/catalog';
import {
  createSmartCollection,
  deleteCollection,
  existingCollections,
  grantedScopes,
  missingScopes,
} from '@/lib/shopify/collections-admin';
import { cleanRule, matchProducts, overlap } from './rules';
import {
  COLLECTION_PLANS,
  CREATE_BATCH,
  RULE_RELATIONS,
  handleize,
  type CollectionPlan,
  type CollectionRule,
  type PlannedCollection,
  type ShopifyAccess,
} from './types';

const MAX_PLAN = 100;
const BATCH_SIZE = 30;
/** Ideas asked for beyond the target, since some come back thin or already covered. */
const OVERSHOOT = 1.4;
const MAX_HELD_BACK = 40;

const STOPWORDS = new Set(
  'the and for with from your our this that set pack piece pcs inch inches feet foot new size style type item model each per one two three four five six all collection series black white'.split(
    ' ',
  ),
);

const TOOL = {
  name: 'save_collections',
  description: 'Save the planned Shopify smart collections.',
  input_schema: {
    type: 'object' as const,
    properties: {
      collections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            theme: { type: 'string', description: 'The vendor, category or use this belongs under, for grouping.' },
            title: { type: 'string', description: 'Collection title, 3 to 7 words, phrased like a shopper search.' },
            keyword: { type: 'string', description: 'The long-tail search phrase this page targets, lower case.' },
            match: { type: 'string', enum: ['all', 'any'], description: 'Whether products must match all rules or any one.' },
            rules: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  column: { type: 'string', enum: Object.keys(RULE_RELATIONS) },
                  relation: { type: 'string', enum: Array.from(new Set(Object.values(RULE_RELATIONS).flat())) },
                  condition: { type: 'string' },
                },
                required: ['column', 'relation', 'condition'],
              },
            },
            seo_title: { type: 'string', description: 'Under 60 characters.' },
            seo_description: { type: 'string', description: '140 to 155 characters.' },
            description: { type: 'string', description: 'Two sentences shown at the top of the collection page.' },
          },
          required: ['theme', 'title', 'keyword', 'match', 'rules', 'seo_title', 'seo_description', 'description'],
        },
      },
    },
    required: ['collections'],
  },
};

function adminDb() {
  initializeFirebaseAdmin();
  return getFirestore();
}

/** Whether the brand's store can be read, and whether collections can be created in it. */
export async function shopifyAccess(uid: string, brandId: string): Promise<ShopifyAccess> {
  let shopDomain: string | null = null;
  try {
    const credentials = await shopifyCredentialsForBrand(uid, brandId);
    shopDomain = credentials.shopDomain;
    const missing = missingScopes(await grantedScopes(credentials.shopDomain, credentials.accessToken));
    return { connected: true, shopDomain, canCreate: missing.length === 0, missingScopes: missing, reason: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reach Shopify';
    return {
      connected: false,
      shopDomain,
      canCreate: false,
      missingScopes: [],
      reason: shopDomain && !(error instanceof ShopifyCredentialError) ? `Shopify refused the connection: ${message}` : message,
    };
  }
}

/** How often each word and two-word phrase appears across product titles. */
function titleTerms(catalog: CatalogProduct[]) {
  const unigrams = new Map<string, number>();
  const bigrams = new Map<string, number>();
  for (const product of catalog) {
    const tokens = product.title.toLowerCase().split(/[^a-z0-9'-]+/);
    const keep = (t: string | undefined) => !!t && t.length > 2 && !STOPWORDS.has(t) && !/\d/.test(t);
    const seen = new Set<string>();
    tokens.forEach((token, i) => {
      if (keep(token)) seen.add(token);
      if (keep(token) && keep(tokens[i + 1])) seen.add(`${token} ${tokens[i + 1]}`);
    });
    for (const term of seen) (term.includes(' ') ? bigrams : unigrams).set(term, ((term.includes(' ') ? bigrams : unigrams).get(term) ?? 0) + 1);
  }
  const top = (map: Map<string, number>, n: number) =>
    Array.from(map)
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  return { unigrams: top(unigrams, 150), bigrams: top(bigrams, 150) };
}

function tally(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) if (value.trim()) counts.set(value.trim(), (counts.get(value.trim()) ?? 0) + 1);
  return Array.from(counts).sort((a, b) => b[1] - a[1]);
}

function catalogSummary(catalog: CatalogProduct[], brand: { name: string; businessType?: string }, existing: string[]) {
  const vendors = tally(catalog.map((p) => p.vendor));
  const terms = titleTerms(catalog);
  const prices = catalog.map((p) => p.price).filter((p) => p > 0).sort((a, b) => a - b);
  const quantile = (q: number) => (prices.length ? Math.round(prices[Math.floor(q * (prices.length - 1))]) : 0);
  const fmt = (pairs: [string, number][]) => pairs.map(([name, n]) => `${name} (${n})`).join('; ') || '(none)';

  // A big vendor's own words show what it sells; the storewide list is dominated by the biggest.
  const perVendor = vendors.slice(0, 12).map(([vendor]) => {
    const own = titleTerms(catalog.filter((p) => p.vendor === vendor));
    return `- ${vendor}: ${fmt([...own.bigrams.slice(0, 12), ...own.unigrams.slice(0, 12)])}`;
  });

  return {
    vendors,
    terms,
    text: [
      `Store: ${brand.name}${brand.businessType ? `, ${brand.businessType}` : ''}. ${catalog.length} active products.`,
      `Vendors (products): ${fmt(vendors.slice(0, 60))}`,
      `Product types (products): ${fmt(tally(catalog.map((p) => p.productType)).slice(0, 40))}`,
      `Tags (products): ${fmt(tally(catalog.flatMap((p) => p.tags)).slice(0, 60))}`,
      `Price spread: 10% under $${quantile(0.1)}, median $${quantile(0.5)}, 90% under $${quantile(0.9)}.`,
      `Words in product titles (products containing them): ${fmt(terms.unigrams.slice(0, 120))}`,
      `Phrases in product titles: ${fmt(terms.bigrams.slice(0, 120))}`,
      `What the biggest vendors' titles say:\n${perVendor.join('\n')}`,
      `Collections the store already has (do not repeat): ${existing.slice(0, 200).join('; ') || '(none)'}`,
    ].join('\n'),
  };
}

function prompt(summary: string, count: number, focus: string | null, anchors: string[]) {
  return `You plan Shopify smart collections that each target one long-tail search, so the store's products appear on many more pages that can rank in Google.

${summary}
${focus ? `\nThe owner wants these to focus on: ${focus}.` : ''}
${anchors.length ? `\nBuild this batch around these vendors and terms (others are planned separately): ${anchors.join('; ')}` : ''}

Propose ${count} collections. Rules:
- Each collection is a narrow, specific page a shopper would search for: a product kind plus a material, style, finish, room, use, vendor or price band. "Tiffany Dragonfly Table Lamps", "Bronze Outdoor Wall Sconces", "Patio Heaters Under $1,000". Not broad pages like "Lighting".
- Products join automatically through rules, so rules must use words that really appear in the product titles, vendors, types or tags above. TITLE CONTAINS matches any part of the title, case-insensitive, so use the shortest word that is still specific ("sconce" catches "sconces").
- Prefer match "all" with 2 or 3 rules, e.g. TITLE CONTAINS "pendant" plus TITLE CONTAINS "tiffany". Use match "any" only for synonyms of one thing. VARIANT_PRICE takes a plain number.
- Aim for roughly 6 to 300 products per collection.
- Nothing that repeats a collection the store already has, and no two ideas showing the same products.
- The title, keyword and descriptions must be true for every product the rules would catch.

Call ${TOOL.name} with the result.`;
}

type RawIdea = {
  theme?: string;
  title?: string;
  keyword?: string;
  match?: string;
  rules?: { column?: string; relation?: string; condition?: string }[];
  seo_title?: string;
  seo_description?: string;
  description?: string;
};

async function askForIdeas(summary: string, count: number, focus: string | null, anchors: string[]): Promise<RawIdea[]> {
  const message = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 12000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: prompt(summary, count, focus, anchors) }],
  });
  const call = message.content.find((block) => block.type === 'tool_use');
  let ideas: unknown = ((call && 'input' in call ? call.input : {}) as { collections?: unknown }).collections;
  // The model sometimes sends the array, or the whole input, as a JSON string.
  if (typeof ideas === 'string') ideas = JSON.parse(ideas.trim());
  if (ideas && !Array.isArray(ideas) && typeof ideas === 'object') ideas = (ideas as { collections?: unknown }).collections;
  return Array.isArray(ideas) ? (ideas as RawIdea[]) : [];
}

const clip = (text: string | undefined, max: number) => (text ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

export async function planCollections(input: {
  uid: string;
  brandId: string;
  focus?: string | null;
  count?: number;
  minProducts?: number;
}): Promise<CollectionPlan> {
  const db = adminDb();
  const brand = await db.collection('brandProfiles').doc(input.brandId).get();
  if (!brand.exists || brand.get('userId') !== input.uid) throw new Error('Brand profile not found');

  const { shopDomain, accessToken } = await shopifyCredentialsForBrand(input.uid, input.brandId);
  const [catalog, existing] = await Promise.all([fetchCatalog(shopDomain, accessToken), existingCollections(shopDomain, accessToken)]);
  if (catalog.length < 5) throw new Error('This store has too few active products to plan collections around.');

  const count = Math.min(MAX_PLAN, Math.max(5, input.count ?? 25));
  const minProducts = Math.max(2, input.minProducts ?? 4);
  const focus = input.focus?.trim().slice(0, 200) || null;
  const storefront = storefrontFor(brand.get('websiteUrl'), shopDomain);
  const summary = catalogSummary(catalog, { name: brand.get('brandName'), businessType: brand.get('businessType') }, existing.map((c) => c.title));

  // Large plans are split so each batch explores different vendors and terms in parallel.
  const wanted = Math.ceil(count * OVERSHOOT);
  const batches = Math.ceil(wanted / BATCH_SIZE);
  const anchors = [
    ...summary.vendors.slice(0, 20).map(([v]) => `vendor ${v}`),
    ...summary.terms.bigrams.slice(0, 60).map(([t]) => t),
    ...summary.terms.unigrams.slice(0, 40).map(([t]) => t),
  ];
  const lanes = Array.from({ length: batches }, (_, lane) => (batches > 1 ? anchors.filter((_, i) => i % batches === lane) : []));
  const raw = (
    await Promise.all(
      lanes.map((lane) =>
        askForIdeas(summary.text, Math.ceil(wanted / batches), focus, lane).catch((error) => {
          console.warn('[collections] a planning batch failed:', error instanceof Error ? error.message : error);
          return [] as RawIdea[];
        }),
      ),
    )
  ).flat();
  console.log(`[collections] ${raw.length} ideas from ${batches} batch(es) for ${count} wanted`);
  if (!raw.length) throw new Error('No collection ideas came back. Try again, or try a different focus.');

  const existingHandles = new Map(existing.map((c) => [c.handle, c.title]));
  const existingTitles = new Map(existing.map((c) => [looseKeywordKey(c.title), c.title]));
  const existingSets = existing
    .filter((c) => c.rules && c.rules.every((r) => cleanRule(r)))
    .map((c) => ({ title: c.title, products: new Set(matchProducts(catalog, c.rules as CollectionRule[], c.disjunctive)) }));

  const accepted: { title: string; handle: string; products: Set<number> }[] = [];
  const ready: PlannedCollection[] = [];
  const heldBack: PlannedCollection[] = [];

  for (const idea of raw) {
    const title = clip(idea.title, 70);
    const rules = (idea.rules ?? []).map(cleanRule).filter((r): r is CollectionRule => r !== null).slice(0, 5);
    if (!title || !rules.length) continue;
    const handle = handleize(title);
    if (!handle) continue;
    const disjunctive = idea.match === 'any';
    const matched = matchProducts(catalog, rules, disjunctive);

    let status: PlannedCollection['status'] = 'ready';
    let note: string | null = null;
    const sameAs = (sets: { title: string; products: Set<number> }[], threshold: number) => sets.find((s) => overlap(matched, s.products) >= threshold);
    if (matched.length < minProducts) {
      status = 'thin';
      note = matched.length ? `Only ${matched.length} product${matched.length === 1 ? '' : 's'} match` : 'No products match these rules';
    } else if (catalog.length > 50 && matched.length > catalog.length * 0.6) {
      status = 'broad';
      note = `Catches ${Math.round((matched.length / catalog.length) * 100)}% of the store`;
    } else if (existingHandles.has(handle) || existingTitles.has(looseKeywordKey(title))) {
      status = 'duplicate';
      note = `Already in your store as “${existingHandles.get(handle) ?? existingTitles.get(looseKeywordKey(title))}”`;
    } else {
      const twin = sameAs(existingSets, 0.9);
      const earlier = twin ? null : accepted.find((a) => a.handle === handle || overlap(matched, a.products) >= 0.85);
      if (twin) {
        status = 'duplicate';
        note = `Same products as your “${twin.title}” collection`;
      } else if (earlier) {
        status = 'duplicate';
        note = `Same products as “${earlier.title}” above`;
      }
    }

    if (status === 'ready' && ready.length >= count) continue;
    if (status !== 'ready' && heldBack.length >= MAX_HELD_BACK) continue;

    const item: PlannedCollection = {
      id: randomUUID().slice(0, 8),
      theme: clip(idea.theme, 60) || 'Other',
      title,
      keyword: clip(idea.keyword, 120).toLowerCase() || title.toLowerCase(),
      handle,
      rules,
      disjunctive,
      seoTitle: clip(idea.seo_title, 70) || title,
      seoDescription: clip(idea.seo_description, 320),
      description: clip(idea.description, 600),
      products: matched.length,
      samples: matched.slice(0, 4).map((i) => ({
        title: catalog[i].title,
        image: catalog[i].image,
        url: `${storefront}/products/${catalog[i].handle}`,
      })),
      status,
      note,
      created: null,
      error: null,
    };
    if (status === 'ready') {
      ready.push(item);
      accepted.push({ title, handle, products: new Set(matched) });
    } else heldBack.push(item);
  }

  if (!ready.length) {
    throw new Error('Every idea was empty or already covered by an existing collection. Try a different focus.');
  }

  const ref = db.collection(COLLECTION_PLANS).doc();
  const now = Timestamp.now();
  const record = {
    userId: input.uid,
    brandId: input.brandId,
    name: focus ? `Collections: ${focus}` : 'Whole store',
    focus,
    requested: count,
    items: [...ready.sort((a, b) => a.theme.localeCompare(b.theme) || b.products - a.products), ...heldBack],
    stats: { catalog: catalog.length, existingCollections: existing.length },
    storefront,
    createdAt: now,
  };
  await ref.set(record);
  return { id: ref.id, ...record, createdAt: now.toDate().toISOString() };
}

function toPlan(id: string, data: FirebaseFirestore.DocumentData): CollectionPlan {
  return {
    id,
    brandId: data.brandId,
    name: data.name,
    focus: data.focus ?? null,
    requested: data.requested ?? 0,
    items: data.items ?? [],
    stats: data.stats,
    storefront: data.storefront ?? '',
    createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
  };
}

export async function listPlans(uid: string, brandId?: string | null): Promise<CollectionPlan[]> {
  let query = adminDb().collection(COLLECTION_PLANS).where('userId', '==', uid);
  if (brandId) query = query.where('brandId', '==', brandId);
  const snap = await query.get();
  return snap.docs
    .map((doc) => toPlan(doc.id, doc.data()))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 30);
}

async function ownedPlan(uid: string, id: string) {
  const ref = adminDb().collection(COLLECTION_PLANS).doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.get('userId') !== uid) throw new Error('Plan not found');
  return { ref, plan: toPlan(snap.id, snap.data()!) };
}

export async function deletePlan(uid: string, id: string): Promise<void> {
  const { ref } = await ownedPlan(uid, id);
  await ref.delete();
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function adminUrl(shopDomain: string, gid: string) {
  return `https://admin.shopify.com/store/${shopDomain.replace(/\.myshopify\.com$/, '')}/collections/${gid.split('/').pop()}`;
}

/** Creates up to CREATE_BATCH planned collections, recording each result on the plan. */
export async function createPlanned(uid: string, planId: string, itemIds: string[], titles: Record<string, string> = {}) {
  const { ref, plan } = await ownedPlan(uid, planId);
  const { shopDomain, accessToken } = await shopifyCredentialsForBrand(uid, plan.brandId);
  const missing = missingScopes(await grantedScopes(shopDomain, accessToken));
  if (missing.length) {
    throw new ShopifyCredentialError(`Reconnect Shopify to allow creating collections (missing ${missing.join(', ')}).`, 403);
  }

  const wanted = new Set(itemIds.slice(0, CREATE_BATCH));
  for (const item of plan.items) {
    if (!wanted.has(item.id) || item.status !== 'ready' || item.created) continue;
    const renamed = clip(titles[item.id], 70);
    if (renamed && renamed !== item.title) {
      item.title = renamed;
      item.handle = handleize(renamed) || item.handle;
      item.seoTitle = renamed;
    }
    try {
      const created = await createSmartCollection(shopDomain, accessToken, {
        title: item.title,
        handle: item.handle,
        descriptionHtml: item.description ? `<p>${escapeHtml(item.description)}</p>` : '',
        seoTitle: item.seoTitle,
        seoDescription: item.seoDescription,
        rules: item.rules,
        disjunctive: item.disjunctive,
      });
      item.created = {
        id: created.id,
        handle: created.handle,
        url: `${plan.storefront}/collections/${created.handle}`,
        adminUrl: adminUrl(shopDomain, created.id),
        at: new Date().toISOString(),
      };
      item.error = created.published ? null : 'Created, but not published to the Online Store. Publish it in Shopify.';
    } catch (error) {
      item.error = error instanceof Error ? error.message.slice(0, 300) : 'Shopify did not create it';
    }
  }
  await ref.update({ items: plan.items });
  return plan.items;
}

/** Deletes created collections from Shopify and returns the ideas to the plan. */
export async function removeCreated(uid: string, planId: string, itemIds: string[]) {
  const { ref, plan } = await ownedPlan(uid, planId);
  const { shopDomain, accessToken } = await shopifyCredentialsForBrand(uid, plan.brandId);
  const wanted = new Set(itemIds.slice(0, CREATE_BATCH * 2));
  for (const item of plan.items) {
    if (!wanted.has(item.id) || !item.created) continue;
    try {
      await deleteCollection(shopDomain, accessToken, item.created.id);
      item.created = null;
      item.error = null;
    } catch (error) {
      item.error = error instanceof Error ? error.message.slice(0, 300) : 'Shopify did not remove it';
    }
  }
  await ref.update({ items: plan.items });
  return plan.items;
}
