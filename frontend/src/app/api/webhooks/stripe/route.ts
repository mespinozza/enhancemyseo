import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { sendMetaCAPIEvent } from '@/lib/meta-capi';
import { DONE_FOR_YOU } from '@/lib/stripe';
import { CLEARED_BILLING, billingFromSubscription } from '@/lib/stripe/billing';
import { CREDIT_PACKS } from '@/lib/credits/packs';
import { grantPack } from '@/lib/credits/server';

// Initialize Firebase Admin
initializeFirebaseAdmin();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error('No Stripe signature found');
      return NextResponse.json({ error: 'No signature' }, { status: 400 });
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    console.log('🔔 Stripe webhook received:', event.type);

    // Handle the event
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await handleCreditPurchase(event.data.object as Stripe.Checkout.Session);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('✅ Subscription created:', subscription.id);
  await updateUserSubscription(subscription);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log('🔄 Subscription updated:', subscription.id);
  await updateUserSubscription(subscription);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log('❌ Subscription deleted:', subscription.id);
  
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error('No userId found in subscription metadata');
    return;
  }

  const firestore = getFirestore();
  await firestore.collection('users').doc(userId).update({
    subscription_status: 'free',
    subscriptionId: null,
    stripeCustomerId: subscription.customer,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    ...CLEARED_BILLING,
    updatedAt: new Date(),
  });

  console.log(`User ${userId} subscription set to free`);
}

// Price ID → plan metadata for CAPI Purchase event
const PRICE_TO_PLAN: Record<string, { name: string; value: number }> = {
  'price_1Rr1TsDAs3fJVx0166aj2A2g': { name: 'Kickstart Monthly',      value: 29  },
  'price_1Rr1WhDAs3fJVx01CWG4O9c4': { name: 'Kickstart Annual',       value: 276 },
  'price_1Rr1UVDAs3fJVx01bM18CiAG': { name: 'SEO Takeover Monthly',   value: 99  },
  'price_1Rr1XuDAs3fJVx01cRt6Wosa': { name: 'SEO Takeover Annual',    value: 948 },
  ...(DONE_FOR_YOU.priceId
    ? { [DONE_FOR_YOU.priceId]: { name: 'Done-For-You SEO Monthly', value: DONE_FOR_YOU.monthlyPrice } }
    : {}),
};

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log('💰 Payment succeeded for invoice:', invoice.id);
  
  if (invoice.subscription) {
    // Fetch the subscription to get updated info
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
    await updateUserSubscription(subscription);

    // ── Meta CAPI Purchase event ──────────────────────────────────────────
    // Only fire on the very first payment (not recurring renewals).
    if ((invoice as Stripe.Invoice & { billing_reason?: string }).billing_reason === 'subscription_create') {
      try {
        const priceId = subscription.items.data[0]?.price?.id ?? '';
        const plan = PRICE_TO_PLAN[priceId];
        // Amount paid is in cents; fall back to plan value if not on invoice
        const value = plan?.value ?? (invoice.amount_paid ?? 0) / 100;

        await sendMetaCAPIEvent({
          eventName: 'Purchase',
          email: invoice.customer_email ?? undefined,
          value,
          currency: (invoice.currency ?? 'usd').toUpperCase(),
          contentName: plan?.name,
          // Use invoice ID as dedup key — matches the eventId you'd set in fbq()
          eventId: invoice.id ?? undefined,
        });
      } catch (err) {
        // Never let CAPI failure break the webhook response
        console.error('[CAPI] Error sending Purchase event:', err);
      }
    }
  }
}

/**
 * A one-time credit pack. The pack is worked out from what Stripe says was bought, never
 * from the metadata alone, so a session can only grant what was paid for.
 */
async function handleCreditPurchase(session: Stripe.Checkout.Session) {
  if (session.mode !== 'payment' || session.payment_status !== 'paid') return;
  const userId = session.metadata?.userId;
  if (!userId) {
    console.error('Credit purchase without a userId:', session.id);
    return;
  }
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
  for (const item of items.data) {
    const pack = CREDIT_PACKS.find((p) => p.priceId === item.price?.id);
    if (!pack) continue;
    for (let i = 0; i < (item.quantity ?? 1); i += 1) {
      const granted = await grantPack(i ? `${session.id}:${pack.id}:${i}` : `${session.id}:${pack.id}`, userId, pack, item.amount_total ?? null);
      console.log(granted ? `🎟️ Granted ${pack.label} to ${userId}` : `Credit pack already granted for ${session.id}`);
    }
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  console.log('💸 Payment failed for invoice:', invoice.id);
  
  // You might want to send an email or take other action here
  // For now, we'll just log it
}

async function updateUserSubscription(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error('No userId found in subscription metadata');
    return;
  }

  // Determine subscription status based on Stripe price ID
  let subscriptionStatus = 'free';
  if (subscription.items.data.length > 0) {
    const priceId = subscription.items.data[0].price.id;
    
    // Map price IDs to subscription tiers
    const priceToTier: Record<string, string> = {
      'price_1Rr1TsDAs3fJVx0166aj2A2g': 'kickstart', // Kickstart monthly
      'price_1Rr1WhDAs3fJVx01CWG4O9c4': 'kickstart', // Kickstart annual
      'price_1Rr1UVDAs3fJVx01bM18CiAG': 'seo_takeover', // SEO Takeover monthly
      'price_1Rr1XuDAs3fJVx01cRt6Wosa': 'seo_takeover', // SEO Takeover annual
      // Done-for-you clients get the unlimited agency tier, so we can run their
      // account without hitting caps.
      ...(DONE_FOR_YOU.priceId ? { [DONE_FOR_YOU.priceId]: 'agency' } : {}),
    };
    
    subscriptionStatus = priceToTier[priceId] || 'free';
  }

  const firestore = getFirestore();
  await firestore.collection('users').doc(userId).update({
    subscription_status: subscriptionStatus,
    subscriptionId: subscription.id,
    stripeCustomerId: subscription.customer,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    ...billingFromSubscription(subscription),
    updatedAt: new Date(),
  });

  console.log(`✅ User ${userId} subscription updated to ${subscriptionStatus}`);
} 