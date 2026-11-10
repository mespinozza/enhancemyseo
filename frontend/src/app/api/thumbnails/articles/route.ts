import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireSignedIn } from '@/lib/results/api-auth';

export const dynamic = 'force-dynamic';

export interface StudioArticle {
  id: string;
  title: string;
  keyword: string | null;
  createdAt: string | null;
  thumbnailId: string | null;
  inShopify: boolean;
}

/** A brand's app articles, titles only, for picking what to illustrate. */
export async function GET(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;
  const brandId = request.nextUrl.searchParams.get('brandId');
  if (!brandId) return NextResponse.json({ error: 'Missing brand' }, { status: 400 });

  initializeFirebaseAdmin();
  const snap = await getFirestore()
    .collection('blogs')
    .where('userId', '==', auth.caller.uid)
    .where('brandId', '==', brandId)
    .select('title', 'keyword', 'createdAt', 'thumbnailId', 'shopifyArticleId')
    .get();

  const articles: StudioArticle[] = snap.docs
    .map((doc) => ({
      id: doc.id,
      title: doc.get('title') || doc.get('keyword') || 'Untitled article',
      keyword: doc.get('keyword') ?? null,
      createdAt: doc.get('createdAt')?.toDate?.().toISOString() ?? null,
      thumbnailId: doc.get('thumbnailId') ?? null,
      inShopify: Boolean(doc.get('shopifyArticleId')),
    }))
    .filter((article) => article.title !== 'Untitled article' || article.keyword)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 300);

  return NextResponse.json({ articles }, { headers: { 'Cache-Control': 'no-store' } });
}
