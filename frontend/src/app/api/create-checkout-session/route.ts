import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { ATTRIBUTION_FIELDS } from '@/lib/analytics';
import { describePrice } from '@/lib/stripe';

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
    let subscriptionId: string | null = null;
    try {
      const profile = await getFirestore().collection('users').doc(decodedToken.uid).get();
      const status = profile.get('subscription_status');
      currentPlan = typeof status === 'string' ? status : null;
      const id = profile.get('subscriptionId');
      subscriptionId = typeof id === 'string' && id ? id : null;
    } catch (error) {
      console.error('Checkout: could not read current plan:', error);
    }

    const metadata = {
      userId: decodedToken.uid,
      ...attribution,
      ...(currentPlan ? { from_plan: currentPlan } : {}),
    };

    // A second checkout would leave the old subscription billing alongside the new one, so a
    // subscriber's plan is changed in place instead.
    const current = subscriptionId ? await liveSubscription(subscriptionId, decodedToken.uid) : null;
    if (current) {
      if (!describePrice(priceId)) {
        return NextResponse.json({ error: 'That plan is not available' }, { status: 400 });
      }
      const item = current.items.data[0];
      if (item.price.id === priceId) {
        return NextResponse.json({ error: "You're already on this plan" }, { status: 400 });
      }

      if (!body.confirm) {
        const prorationDate = Math.floor(Date.now() / 1000);
        const preview = await stripe.invoices.retrieveUpcoming({
          customer: current.customer as string,
          subscription: current.id,
          subscription_items: [{ id: item.id, price: priceId }],
          subscription_proration_behavior: 'always_invoice',
          subscription_proration_date: prorationDate,
        });
        return NextResponse.json({ confirm: { amountDue: preview.amount_due, prorationDate }, currentPlan });
      }

      const prorationDate = Number(body.prorationDate);
      const updated = await stripe.subscriptions.update(current.id, {
        items: [{ id: item.id, price: priceId }],
        proration_behavior: 'always_invoice',
        // The charge confirmed in the browser was priced at this moment.
        ...(Number.isInteger(prorationDate) && prorationDate > 0 ? { proration_date: prorationDate } : {}),
        // Without payment the plan stays as it was, rather than switching on an unpaid invoice.
        payment_behavior: 'error_if_incomplete',
        cancel_at_period_end: false,
        metadata: { ...current.metadata, ...metadata },
        expand: ['latest_invoice'],
      });
      const invoice = updated.latest_invoice as Stripe.Invoice | null;
      return NextResponse.json({
        checkoutUrl: `/dashboard?success=true&session_id=${encodeURIComponent(invoice?.id ?? updated.id)}`,
        currentPlan,
        switched: true,
        charged: (invoice?.amount_paid ?? 0) / 100,
      });
    }

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
    if (error instanceof Stripe.errors.StripeCardError) {
      return NextResponse.json({ error: `Your card was declined, so your plan was not changed. ${error.message}` }, { status: 402 });
    }
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

/** The account's subscription if it is still running and belongs to this user. */
async function liveSubscription(id: string, uid: string): Promise<Stripe.Subscription | null> {
  try {
    const subscription = await stripe.subscriptions.retrieve(id);
    const live = subscription.status === 'active' || subscription.status === 'trialing';
    return live && subscription.metadata?.userId === uid && subscription.items.data.length === 1 ? subscription : null;
  } catch (error) {
    console.error('Checkout: could not load the current subscription:', error);
    return null;
  }
}