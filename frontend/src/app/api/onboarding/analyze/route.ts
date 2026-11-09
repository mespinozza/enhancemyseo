/**
 * The tutorial's first step: learn enough about a new customer's business to fill in their
 * brand profile and suggest a first article, from their website or from what they typed.
 *
 * Nothing is saved here. The answer is a draft the customer confirms on the next screen,
 * so a wrong guess costs them one edit rather than a bad profile.
 */
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { CLAUDE_MODEL } from '@/lib/ai/models';
import { meterAs, meteredFetch } from '@/lib/ai/meter';
import {
  ScanError,
  normalizeSiteInput,
  readHomepage,
  readSitemap,
  safeGet,
  type HomepageInfo,
  type SitemapSummary,
} from '@/lib/onboarding/site-scan';

initializeFirebaseAdmin();

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 8;
const recentScans = new Map<string, number[]>();

/** Per instance, which is enough to stop a script looping the scanner at other sites. */
function allowScan(uid: string): boolean {
  const now = Date.now();
  const recent = (recentScans.get(uid) || []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    recentScans.set(uid, recent);
    return false;
  }
  recent.push(now);
  recentScans.set(uid, recent);
  return true;
}

export interface TopicSuggestion {
  keyword: string;
  why: string;
}

export interface AnalyzeResponse {
  source: 'website' | 'manual';
  websiteUrl: string | null;
  sitemapUrl: string | null;
  isShopify: boolean;
  shopDomain: string | null;
  counts: SitemapSummary['counts'] | null;
  /** The counts are a floor: the site lists more sitemap files than were read. */
  countsPartial: boolean;
  business: {
    brandName: string;
    businessType: string;
    kind: 'ecommerce' | 'service';
    description: string;
    tone: string;
  };
  topics: TopicSuggestion[];
  /** Set when the site could only be partly read, so the UI can say why. */
  warning?: string;
}

interface ManualInput {
  brandName?: string;
  description?: string;
  kind?: string;
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function guessBrandName(home: HomepageInfo | null, origin: string | null): string {
  if (home?.siteName) return home.siteName;
  const fromTitle = home?.title.split(/\s[|–—-]\s/).map((part) => part.trim()).filter(Boolean);
  if (fromTitle && fromTitle.length > 1) return fromTitle[fromTitle.length - 1];
  if (fromTitle?.[0] && fromTitle[0].length < 40) return fromTitle[0];
  if (!origin) return '';
  const host = new URL(origin).hostname.replace(/^www\./, '').split('.')[0];
  return host.charAt(0).toUpperCase() + host.slice(1);
}

function fallbackTopics(names: string[], description: string): TopicSuggestion[] {
  const base = names.slice(0, 3).map((name) => name.toLowerCase());
  if (base.length === 0 && description) base.push(description.split(/[.,]/)[0].toLowerCase().slice(0, 50));
  return base.map((name, index) => ({
    keyword: [`how to choose ${name}`, `${name} buying guide`, `best ${name} for beginners`][index % 3],
    why: 'Based on what your site offers.',
  }));
}

function anthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey, fetch: meteredFetch }) : null;
}

async function draftWithAi(context: string): Promise<Partial<AnalyzeResponse['business']> & { topics?: TopicSuggestion[] }> {
  const anthropic = anthropicClient();
  if (!anthropic) return {};

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 900,
    messages: [
      {
        role: 'user',
        content: `You are setting up an SEO blog writer for a new customer. From what we know about their business, draft their profile and three first-article topics.

${context}

Return ONLY a JSON object, no other text:
{
  "brandName": "the business's name as customers know it",
  "kind": "ecommerce" or "service",
  "businessType": "one short phrase, e.g. 'Online store selling waterproof outdoor gear' or 'Residential plumbing company in Denver'",
  "description": "two sentences on what they sell or do and who for, written in plain language",
  "tone": "two or three words for the voice their site uses, e.g. 'friendly, expert'",
  "topics": [
    { "keyword": "a search phrase of 3 to 7 words a potential customer would type into Google", "why": "one short sentence on why this topic fits them" }
  ]
}

Topic rules: tie each one to something they actually sell or do. Prefer questions and comparisons a buyer researches before purchasing (how to choose, best X for Y, X vs Y, how to fix). Never include the brand's own name. Lowercase keywords. Exactly three topics, each with a different angle.`,
      },
    ],
  });

  const text = response.content.find((block) => block.type === 'text');
  const raw = text && text.type === 'text' ? text.text : '';
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const topics = Array.isArray(parsed.topics)
      ? (parsed.topics as Record<string, unknown>[])
          .map((topic) => ({ keyword: clean(topic.keyword, 90).toLowerCase(), why: clean(topic.why, 160) }))
          .filter((topic) => topic.keyword.length > 3)
          .slice(0, 3)
      : [];
    return {
      brandName: clean(parsed.brandName, 80),
      kind: parsed.kind === 'service' ? 'service' : 'ecommerce',
      businessType: clean(parsed.businessType, 120),
      description: clean(parsed.description, 400),
      tone: clean(parsed.tone, 60),
      topics,
    };
  } catch {
    return {};
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(authHeader.split('Bearer ')[1])).uid;
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  meterAs(uid);

  if (!allowScan(uid)) {
    return NextResponse.json(
      { error: 'That is a lot of scans in a row. Wait a few minutes and try again.' },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { url?: string; manual?: ManualInput };

  // Manual path: the customer has no site, or would rather type it.
  if (!body.url) {
    const manual = body.manual || {};
    const brandName = clean(manual.brandName, 80);
    const description = clean(manual.description, 600);
    if (!brandName || !description) {
      return NextResponse.json({ error: 'Add your business name and what you sell or do.' }, { status: 400 });
    }
    const kind = manual.kind === 'service' ? 'service' : 'ecommerce';
    const draft = await draftWithAi(
      `Business name: ${brandName}\nType: ${kind === 'service' ? 'service business' : 'sells products'}\nIn their words: ${description}`
    ).catch((error) => {
      console.error('[onboarding] draft failed', error);
      return {} as Awaited<ReturnType<typeof draftWithAi>>;
    });

    const result: AnalyzeResponse = {
      source: 'manual',
      websiteUrl: null,
      sitemapUrl: null,
      isShopify: false,
      shopDomain: null,
      counts: null,
      countsPartial: false,
      business: {
        brandName,
        kind,
        businessType: draft.businessType || description.slice(0, 120),
        description: draft.description || description,
        tone: draft.tone || 'friendly, helpful',
      },
      topics: draft.topics?.length ? draft.topics : fallbackTopics([], description),
    };
    return NextResponse.json(result);
  }

  let origin: string;
  let givenSitemap: string | null;
  try {
    ({ origin, sitemapUrl: givenSitemap } = normalizeSiteInput(body.url));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid address' }, { status: 400 });
  }

  let home: HomepageInfo | null = null;
  let warning: string | undefined;
  try {
    const page = await safeGet(origin);
    if (page.status >= 400) throw new ScanError(`The website answered with an error (${page.status}).`);
    home = readHomepage(page.body, page.url);
    // Follow the canonical host (www or not) for the sitemap, since some sites only serve it there.
    origin = new URL(page.url).origin;
  } catch (error) {
    const message = error instanceof ScanError ? error.message : 'We could not reach that website.';
    // Unreachable and not a sitemap either: nothing to work with, so let the customer fix it.
    if (!givenSitemap) {
      return NextResponse.json({ error: `${message} Check the address, or enter your details by hand.` }, { status: 422 });
    }
    warning = message;
  }

  const sitemap = await readSitemap(origin, givenSitemap).catch((error) => {
    console.error('[onboarding] sitemap read failed', error);
    return null;
  });
  if (!sitemap?.sitemapUrl) {
    warning = warning || 'We found your site but not its sitemap, so suggestions are based on your homepage.';
  }

  const samples = sitemap?.samples;
  const counts = sitemap?.counts ?? null;
  const context = [
    `Website: ${origin}`,
    home?.title && `Homepage title: ${home.title}`,
    home?.description && `Homepage description: ${home.description}`,
    home?.headings.length && `Homepage headings: ${home.headings.join(' | ')}`,
    home?.isShopify && 'Platform: Shopify store',
    counts && `Sitemap${sitemap?.partial ? ' (at least)' : ''}: ${counts.product} products, ${counts.collection} collections, ${counts.page} pages, ${counts.blog} blog posts`,
    samples?.product.length && `Some products: ${samples.product.slice(0, 25).join('; ')}`,
    samples?.collection.length && `Some collections: ${samples.collection.slice(0, 15).join('; ')}`,
    samples?.page.length && `Some pages: ${samples.page.slice(0, 20).join('; ')}`,
    samples?.blog.length && `Existing blog posts (avoid repeating these): ${samples.blog.slice(0, 15).join('; ')}`,
  ]
    .filter(Boolean)
    .join('\n');

  const draft = await draftWithAi(context).catch((error) => {
    console.error('[onboarding] draft failed', error);
    return {} as Awaited<ReturnType<typeof draftWithAi>>;
  });

  const isEcommerce = Boolean(home?.isShopify) || (counts?.product ?? 0) > 0;
  const result: AnalyzeResponse = {
    source: 'website',
    websiteUrl: origin,
    sitemapUrl: sitemap?.sitemapUrl ?? null,
    isShopify: Boolean(home?.isShopify),
    shopDomain: home?.shopDomain ?? null,
    counts,
    countsPartial: Boolean(sitemap?.partial),
    business: {
      brandName: draft.brandName || guessBrandName(home, origin),
      kind: draft.kind || (isEcommerce ? 'ecommerce' : 'service'),
      businessType: draft.businessType || '',
      description: draft.description || home?.description || '',
      tone: draft.tone || 'friendly, helpful',
    },
    topics: draft.topics?.length
      ? draft.topics
      : fallbackTopics([...(samples?.collection ?? []), ...(samples?.product ?? []), ...(samples?.page ?? [])], home?.description || ''),
    ...(warning && { warning }),
  };

  return NextResponse.json(result);
}
