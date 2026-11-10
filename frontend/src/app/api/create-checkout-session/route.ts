import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { ATTRIBUTION_FIELDS } from '@/lib/analytics';

/**
 * The browser sends whatever it stored, so only known campaign fields get through, as
 * short strings: Stripe rejects metadata values over 500 characters.
 */
function attributionMetadata(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  const source = input as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const field of [...ATTRIBUTION_FIELDS, 'landing_page'] as const) {
    const value = source[field];
    if (typeof value === 'string' && value.trim()) out[field] = value.trim().slice(0, 100);
  }
  return out;
}

// Initialize Firebase Admin
initializeFirebaseAdmin();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

export async function POST(request: Request) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { priceId } = body;

    if (!priceId) {
      return NextResponse.json(
        { error: 'Missing price ID' },
        { status: 400 }
      );
    }

    const attribution = attributionMetadata(body.attribution);
    // Only a dashboard path on this site, so the parameter can't send a cancelled checkout elsewhere.
    const cancelPath =
      typeof body.cancelPath === 'string' && /^\/dashboard(\/[\w-]+)*(\?[\w=&-]*)?$/.test(body.cancelPath)
        ? body.cancelPath
        : '/pricing?canceled=true';

    // A missing profile just means we can't tell an upgrade from a first purchase.
    let currentPlan: string | null = null;
    try {
      const profile = await getFirestore().collection('users').doc(decodedToken.uid).get();
      const status = profile.get('subscription_status');
      currentPlan = typeof status === 'string' ? status : null;
    } catch (error) {
      console.error('Checkout: could not read current plan:', error);
    }

    const metadata = {
      userId: decodedToken.uid,
      ...attribution,
      ...(currentPlan ? { from_plan: currentPlan } : {}),
    };

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${request.headers.get('origin')}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.headers.get('origin')}${cancelPath}`,
      metadata,
      subscription_data: {
        metadata,
      },
      customer_email: decodedToken.email || undefined,
    });

    return NextResponse.json({
      checkoutUrl: session.url,
      currentPlan,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
} 