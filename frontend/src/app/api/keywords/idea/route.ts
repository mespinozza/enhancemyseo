import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireSignedIn } from '@/lib/results/api-auth';
import { CLAUDE_MODEL } from '@/lib/ai/models';
import { meterAs, meteredFetch } from '@/lib/ai/meter';

export const dynamic = 'force-dynamic';

// Per server instance: enough for someone trying a few ideas, not for scripting.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const recent = new Map<string, number[]>();

function rateLimited(uid: string): boolean {
  const now = Date.now();
  const hits = (recent.get(uid) ?? []).filter((at) => now - at < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    recent.set(uid, hits);
    return true;
  }
  recent.set(uid, [...hits, now]);
  return false;
}

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * One article keyword for a brand. With a seed, it is refined into a keyword worth writing
 * for; without one, it is picked from the brand profile. Keywords the brand already has
 * articles for, and any in `avoid`, are avoided. Without a seed, `count` > 1 returns that
 * many distinct keywords as `keywords`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;
  const { uid } = auth.caller;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Keyword ideas are not available right now' }, { status: 503 });
  }
  if (rateLimited(uid)) {
    return NextResponse.json({ error: 'That is a lot of ideas in a short time. Try again in a few minutes.' }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const brandId = clean(body.brandId, 128);
  const seed = clean(body.seed, 200);
  const count = Math.min(10, Math.max(1, Math.floor(Number(body.count) || 1)));
  const avoid: string[] = Array.isArray(body.avoid)
    ? body.avoid.map((k: unknown) => clean(k, 120).toLowerCase()).filter(Boolean).slice(0, 20)
    : [];
  if (!brandId) return NextResponse.json({ error: 'Pick a brand profile first' }, { status: 400 });

  initializeFirebaseAdmin();
  const db = getFirestore();
  const brand = await db.collection('brandProfiles').doc(brandId).get();
  if (!brand.exists || brand.get('userId') !== uid) {
    return NextResponse.json({ error: 'Brand profile not found' }, { status: 404 });
  }

  const blogs = await db.collection('blogs').where('userId', '==', uid).limit(300).get();
  const existing = Array.from(
    new Set(
      blogs.docs
        .filter((doc) => doc.get('brandId') === brandId)
        .map((doc) => clean(doc.get('keyword'), 120).toLowerCase())
        .filter(Boolean)
    )
  )
    .slice(0, 60)
    .concat(avoid);

  const profile = [
    `Brand: ${clean(brand.get('brandName'), 120) || 'Not specified'}`,
    `Business type: ${clean(brand.get('businessType'), 200) || 'Not specified'}`,
    `What they do and sell: ${clean(brand.get('brandGuidelines'), 1500) || 'Not specified'}`,
    `Website: ${clean(brand.get('shopifyStoreUrl'), 200) || clean(brand.get('websiteUrl'), 200) || 'Not specified'}`,
  ].join('\n');

  const many = !seed && count > 1;
  const task = many
    ? `Pick ${count} keywords for this brand's next articles: questions or needs its customers search for before buying, that an article can answer and link to what the brand sells. Each must cover a different topic or intent, not reworded versions of one idea.`
    : seed
    ? `The writer typed this idea: "${seed}". Turn it into the single best article keyword for this brand: keep its meaning and topic, make it a phrase real customers type into Google, and fit it to what the brand sells. If it is already a good keyword, return it tidied up.`
    : 'Pick the single best keyword for this brand\'s next article: a question or need its customers search for before buying, that an article can answer and link to what the brand sells.';

  const prompt = `You choose blog article keywords for small businesses.

${profile}

${existing.length ? `Already written about (do not repeat or closely duplicate):\n${existing.map((k) => `- ${k}`).join('\n')}\n` : ''}
${task}

Rules:
- 3 to 8 words, lowercase, no quotes or punctuation at the end.
- Long-tail and specific, with clear search intent; no brand names unless the writer used one.
${many ? `- Reply with exactly ${count} keywords, one per line, nothing else.` : '- Reply with the keyword only, nothing else.'}`;

  meterAs(uid);
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, fetch: meteredFetch });
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: many ? 40 * count : 60,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content.find((block) => block.type === 'text');
    const taken = new Set(existing);
    const keywords = (text && text.type === 'text' ? text.text : '')
      .split('\n')
      .map((line) =>
        line
          .replace(/^\s*(\d+[.)]|[-*•])\s*/, '')
          .replace(/^["'\s-]+|["'.\s]+$/g, '')
          .toLowerCase()
          .slice(0, 120)
      )
      .filter((k) => k.split(/\s+/).length >= 2 && (!many || (!taken.has(k) && Boolean(taken.add(k)))))
      .slice(0, many ? count : 1);
    if (!keywords.length) throw new Error('No keyword came back');
    return NextResponse.json(many ? { keywords } : { keyword: keywords[0] });
  } catch (error) {
    console.error('Keyword idea failed:', error);
    return NextResponse.json({ error: 'Could not come up with a keyword. Try again.' }, { status: 502 });
  }
}
