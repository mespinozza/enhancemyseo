import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { requireSignedIn } from '@/lib/results/api-auth';
import { getServerUserSubscriptionStatus } from '@/lib/firebase/server-admin-utils';
import { CREDIT_TIERS, packById } from '@/lib/credits/packs';

export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-02-24.acacia' });

/** Only paths inside the app, so the return link can't be pointed at another site. */
function returnPath(value: unknown): string {
  return typeof value === 'string' && /^\/dashboard(\/[\w\-/]*)?$/.test(value) ? value : '/dashboard/settings';
}

/** A one-time Checkout for a credit pack. The webhook adds the credits once it's paid. */
export async function POST(request: NextRequest) {
  const auth = await requireSignedIn(request);
  if ('error' in auth) return auth.error;
  const { uid, email } = auth.caller;

  const body = await request.json().catch(() => ({}));
  const pack = packById(body?.pack);
  if (!pack) return NextResponse.json({ error: 'Unknown pack' }, { status: 400 });

  const tier = await getServerUserSubscriptionStatus(uid, email);
  if (!CREDIT_TIERS.includes(tier)) {
    return NextResponse.json({ error: 'Extra credits are for paid plans. Pick a plan first.', code: 'needs_plan' }, { status: 403 });
  }

  initializeFirebaseAdmin();
  const customer: string | undefined = (await getFirestore().collection('users').doc(uid).get()).get('stripeCustomerId') || undefined;
  const origin = request.headers.get('origin') || new URL(request.url).origin;
  const back = returnPath(body?.returnTo);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: pack.priceId, quantity: 1 }],
      ...(customer ? { customer } : { customer_email: email || undefined, customer_creation: 'always' }),
      metadata: { userId: uid, pack: pack.id },
      payment_intent_data: { metadata: { userId: uid, pack: pack.id } },
      success_url: `${origin}${back}?credits=${pack.id}`,
      cancel_url: `${origin}${back}`,
    });
    return NextResponse.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('Credit checkout failed:', error);
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 });
  }
}
