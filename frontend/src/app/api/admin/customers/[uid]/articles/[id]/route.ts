import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireAdmin } from '@/lib/results/api-auth';
import { toIso } from '@/lib/admin/customers-server';
import type { AdminArticle } from '@/lib/admin/customers';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ uid: string; id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const { uid, id } = await params;

  try {
    initializeFirebaseAdmin();
    const firestore = getFirestore();
    const snap = await firestore.collection('blogs').doc(id).get();
    // Checked against the customer in the URL so this only ever opens that customer's articles.
    if (!snap.exists || snap.get('userId') !== uid) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    const brandId = snap.get('brandId');
    const brand = typeof brandId === 'string' && brandId
      ? await firestore.collection('brandProfiles').doc(brandId).get()
      : null;
    const website = brand?.get('shopifyStoreUrl') || brand?.get('websiteUrl') || null;

    const article: AdminArticle = {
      id: snap.id,
      title: snap.get('title') || 'Untitled',
      content: typeof snap.get('content') === 'string' ? snap.get('content') : '',
      keyword: snap.get('keyword') ?? null,
      status: snap.get('status') ?? null,
      createdAt: toIso(snap.get('createdAt')),
      seo: snap.get('seo') ?? null,
      brandName: brand?.get('brandName') ?? null,
      website: typeof website === 'string' ? website : null,
    };
    return NextResponse.json(article, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to load article:', error);
    return NextResponse.json({ error: 'Failed to load article' }, { status: 500 });
  }
}
