import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { CLAUDE_MODEL } from '@/lib/ai/models';
import { looseKeywordKey } from '@/lib/automation/keyword';
import type { StoreInventory } from '@/lib/shopify/inventory';
import { anthropic, appArticleTitles, loadInventory, similar, storeSummary, storefrontFor, topics, words } from './collection';

const TOOL = {
  name: 'save_keyword_list',
  description: 'Save the list of article keywords for this brand.',
  input_schema: {
    type: 'object' as const,
    properties: {
      clusters: {
        type: 'array',
        description: 'Topic clusters, each a pillar of the content library.',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'The pillar topic this cluster builds authority in.' },
            keywords: {
              type: 'array',
              items: { type: 'string', description: 'One article keyword: lower case, 4 to 9 words, as a real searcher types it.' },
            },
          },
          required: ['topic', 'keywords'],
        },
      },
    },
    required: ['clusters'],
  },
};

/** The tool's clusters, which the model sometimes sends as a JSON string instead of an array. */
function readClusters(input: unknown, depth = 0): { keywords?: unknown[] }[] {
  if (typeof input === 'string' && depth < 3) {
    try {
      return readClusters(JSON.parse(input), depth + 1);
    } catch {
      return [];
    }
  }
  if (Array.isArray(input)) return input.filter((c) => c && typeof c === 'object' && Array.isArray(c.keywords));
  if (input && typeof input === 'object' && 'clusters' in input) return readClusters((input as { clusters: unknown }).clusters, depth + 1);
  return [];
}

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function profileSummary(brand: FirebaseFirestore.DocumentSnapshot): string {
  return [
    `Brand: ${clean(brand.get('brandName'), 120) || 'Not specified'}`,
    `Business type: ${clean(brand.get('businessType'), 200) || 'Not specified'}`,
    `What they do and sell, in their words: ${clean(brand.get('brandGuidelines'), 2500) || 'Not specified'}`,
    `Website: ${clean(brand.get('websiteUrl'), 200) || clean(brand.get('shopifyStoreUrl'), 200) || 'Not specified'}`,
  ].join('\n');
}

function prompt(input: { profile: string; store: string | null; count: number; focus: string | null; covered: string[]; queued: string[] }) {
  const list = (items: string[]) => items.map((k) => `- ${k}`).join('\n');
  return `You are a senior SEO content strategist. Your job is to plan the next ${input.count} articles for a business's blog: the keywords that will grow its organic traffic the most and bring in readers who are likely to become customers.

## The business
${input.profile}
${input.store ? `\n## What their store actually contains\n${input.store}\n` : ''}${input.focus ? `\n## Focus requested by the owner\n${input.focus}. Every keyword should serve this focus while staying true to what the business sells.\n` : ''}
## Already covered: do not repeat or closely paraphrase any of these
${input.covered.length ? list(input.covered.slice(0, 200)) : '(no articles yet)'}
${input.queued.length ? `\n## Already queued for writing: do not repeat these either\n${list(input.queued.slice(0, 200))}\n` : ''}
## How to choose the keywords
Think like someone building a content library that compounds: topic clusters that make Google see this site as the authority on what the business sells, with each article earning traffic on its own and linking naturally to the business's products or services.

1. Start from the business's real offering. Use real product names, product types, brands, models, services, materials and locations from the information above. Never invent products, services or claims the business could not back up.
2. Group the keywords into 3 to 7 topic clusters, each one a pillar the business can credibly own.
3. Cover the whole customer journey inside each cluster, mixing search intents:
   - buying: "best ... for ...", "... for [specific use or person]", "top ... under $..."
   - comparing: "x vs y", "... alternatives", "is x worth it"
   - how-to: setup, use, installation, maintenance, care
   - problems and fixes: "... not working", "why does my ...", "how to fix ..."
   - learning: "what is ...", "how does ... work", "how long does ... last"
   - local, only if the business serves a place: "... in [city]", "... near [area]"
4. Prefer long-tail keywords: specific phrases with clear intent and realistic competition that a small or mid-sized site can rank for, over broad head terms owned by big publishers.
5. Each keyword must be answerable by one focused article and be a phrase real people type into Google: natural wording, no keyword stuffing, no brand name of this business.
6. No two keywords may target the same search; vary the angle, audience, product or problem instead of reshuffling words.

## Format
Exactly ${input.count} keywords in total, lower case, 4 to 9 words each, no punctuation at the end.

Call ${TOOL.name} with the result.`;
}

/**
 * A ready-to-write list of article keywords for a brand, grounded in its Shopify store when
 * one is connected and in the brand profile otherwise, avoiding anything already written or
 * already queued.
 */
export async function generateKeywordList(input: {
  uid: string;
  brandId: string;
  count: number;
  focus?: string | null;
  queued?: string[];
}): Promise<{ keywords: string[]; usedStore: boolean }> {
  initializeFirebaseAdmin();
  const brand = await getFirestore().collection('brandProfiles').doc(input.brandId).get();
  if (!brand.exists || brand.get('userId') !== input.uid) throw new Error('Brand profile not found');

  const count = Math.min(50, Math.max(5, Math.round(input.count) || 25));
  const focus = clean(input.focus, 200) || null;
  const queued = (input.queued ?? []).map((k) => clean(k, 120)).filter(Boolean);

  const appTitles = await appArticleTitles(input.uid, input.brandId);
  let inventory: StoreInventory | null = null;
  let shopDomain = '';
  if (brand.get('shopifyStoreUrl')) {
    try {
      ({ inventory, shopDomain } = await loadInventory(input.uid, input.brandId));
    } catch (error) {
      console.warn('Keyword list: planning without the store:', error instanceof Error ? error.message : error);
    }
  }

  let store: string | null = null;
  if (inventory && (inventory.products.length || inventory.collections.length)) {
    const found = topics(inventory, [...appTitles, ...inventory.articles.map((a) => a.title)], storefrontFor(brand.get('websiteUrl'), shopDomain));
    const gaps = Array.from(
      new Set([...found.collections, ...found.vendors].filter((t) => t.products > 0 && t.covered === 0).sort((a, b) => b.products - a.products).map((t) => t.name)),
    );
    store = storeSummary({ name: brand.get('brandName'), businessType: brand.get('businessType'), website: brand.get('websiteUrl') }, inventory, null, gaps);
  }

  const covered = Array.from(new Set([...appTitles, ...(inventory?.articles.map((a) => a.title) ?? [])]));
  const message = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: prompt({ profile: profileSummary(brand), store, count, focus, covered, queued }) }],
  });
  const call = message.content.find((block) => block.type === 'tool_use');
  const clusters = readClusters(call && 'input' in call ? call.input : null);

  const taken = [...covered, ...queued];
  const takenKeys = new Set(taken.map(looseKeywordKey));
  const takenWords = taken.map(words);
  const seen: Set<string>[] = [];
  const keywords: string[] = [];
  for (const cluster of clusters) {
    for (const value of cluster.keywords ?? []) {
      const keyword = clean(value, 120).replace(/\s+/g, ' ').replace(/[.?!,;:]+$/, '').toLowerCase();
      if (keyword.split(' ').length < 3) continue;
      const keywordWords = words(keyword);
      if (takenKeys.has(looseKeywordKey(keyword)) || takenWords.some((w) => similar(keywordWords, w))) continue;
      if (seen.some((w) => similar(keywordWords, w))) continue;
      seen.push(keywordWords);
      keywords.push(keyword);
    }
  }
  if (!keywords.length) throw new Error('No new keywords came back. Try a different focus.');
  return { keywords: keywords.slice(0, count), usedStore: Boolean(store) };
}
