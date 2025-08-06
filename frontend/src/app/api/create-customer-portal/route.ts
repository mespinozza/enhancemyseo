import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';

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

    // Get or create Stripe customer
    let customer;
    const customers = await stripe.customers.list({
      email: decodedToken.email!,
      limit: 1,
    });

    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      // Create customer if doesn't exist
      customer = await stripe.customers.create({
        email: decodedToken.email!,
        metadata: {
          userId: decodedToken.uid,
        },
      });
    }

    // Create customer portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${request.headers.get('origin')}/dashboard/settings`,
    });

    return NextResponse.json({
      portalUrl: session.url,
    });
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    return NextResponse.json(
      { error: 'Failed to create customer portal session' },
      { status: 500 }
    );
  }
} 