/**
 * Stripe integration for checkout sessions
 */

import { readAttribution, rememberCheckout, track } from '@/lib/analytics';

// Stripe Price Configuration
export const STRIPE_PRICES = {
  free: {
    priceId: "price_1Rr1TNDAs3fJVx01ZQv3vehS",
    monthlyPrice: 0,
    annualPrice: 0,
  },
  kickstart: {
    monthly: {
      priceId: "price_1Rr1TsDAs3fJVx0166aj2A2g",
      price: 29,
      discountedPrice: 23,
    },
    annual: {
      priceId: "price_1Rr1WhDAs3fJVx01CWG4O9c4",
      price: 276, // Annual billing amount
      monthlyPrice: 29, // Original monthly price
      discountedMonthlyPrice: 23, // Discounted monthly equivalent
    },
  },
  seo_takeover: {
    monthly: {
      priceId: "price_1Rr1UVDAs3fJVx01bM18CiAG",
      price: 99,
      discountedPrice: 79,
    },
    annual: {
      priceId: "price_1Rr1XuDAs3fJVx01cRt6Wosa",
      price: 948, // Annual billing amount
      monthlyPrice: 99, // Original monthly price
      discountedMonthlyPrice: 79, // Discounted monthly equivalent
    },
  },
};

/**
 * The done-for-you service. Its Stripe price must be a recurring monthly price, since
 * checkout runs in subscription mode. Until NEXT_PUBLIC_STRIPE_DONE_FOR_YOU_PRICE_ID is
 * set, the offer sends people to the contact form instead of checkout.
 */
export const DONE_FOR_YOU = {
  priceId: process.env.NEXT_PUBLIC_STRIPE_DONE_FOR_YOU_PRICE_ID || null,
  monthlyPrice: 3000,
  name: 'Done-For-You SEO',
};

// Helper function to get price ID based on plan and billing interval
export const getPriceId = (plan: string, isAnnual: boolean = false): string | null => {
  if (plan === 'free') return STRIPE_PRICES.free.priceId;
  
  if (plan === 'kickstart') {
    return isAnnual ? STRIPE_PRICES.kickstart.annual.priceId : STRIPE_PRICES.kickstart.monthly.priceId;
  }
  
  if (plan === 'seo_takeover') {
    return isAnnual ? STRIPE_PRICES.seo_takeover.annual.priceId : STRIPE_PRICES.seo_takeover.monthly.priceId;
  }
  
  return null;
};

// Helper function to get display price
export const getDisplayPrice = (plan: string, isAnnual: boolean = false): number => {
  if (plan === 'free') return 0;
  
  if (plan === 'kickstart') {
    return isAnnual ? STRIPE_PRICES.kickstart.annual.discountedMonthlyPrice : STRIPE_PRICES.kickstart.monthly.price;
  }
  
  if (plan === 'seo_takeover') {
    return isAnnual ? STRIPE_PRICES.seo_takeover.annual.discountedMonthlyPrice : STRIPE_PRICES.seo_takeover.monthly.price;
  }
  
  return 0;
};

// Helper function to get original monthly price (for strikethrough)
export const getOriginalPrice = (plan: string): number => {
  if (plan === 'kickstart') return STRIPE_PRICES.kickstart.annual.monthlyPrice;
  if (plan === 'seo_takeover') return STRIPE_PRICES.seo_takeover.annual.monthlyPrice;
  return 0;
};

// Helper function to get annual billing amount
export const getAnnualPrice = (plan: string): number => {
  if (plan === 'kickstart') return STRIPE_PRICES.kickstart.annual.price;
  if (plan === 'seo_takeover') return STRIPE_PRICES.seo_takeover.annual.price;
  return 0;
};

/** What a Stripe price ID buys, for analytics. The amount is what the first invoice charges. */
export const describePrice = (
  priceId: string
): { plan: string; interval: 'month' | 'year'; value: number } | null => {
  for (const plan of ['kickstart', 'seo_takeover'] as const) {
    const prices = STRIPE_PRICES[plan];
    if (prices.monthly.priceId === priceId) return { plan, interval: 'month', value: prices.monthly.price };
    if (prices.annual.priceId === priceId) return { plan, interval: 'year', value: prices.annual.price };
  }
  if (DONE_FOR_YOU.priceId && DONE_FOR_YOU.priceId === priceId) {
    return { plan: 'done_for_you', interval: 'month', value: DONE_FOR_YOU.monthlyPrice };
  }
  return null;
};

/**
 * Creates a checkout session for subscription payment
 * @param priceId - The Stripe price ID for the subscription plan
 * @param userToken - The Firebase user ID token for authentication
 * @returns The checkout session URL
 */
export const createCheckoutSession = async (
  priceId: string,
  userToken: string,
  options: { cancelPath?: string } = {}
): Promise<string> => {
  try {
    console.log('Creating checkout session for priceId:', priceId);
    
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      // The ad that brought the visitor rides along into the Stripe metadata, so a
      // subscription can be traced back to its campaign.
      body: JSON.stringify({ priceId, attribution: readAttribution(), cancelPath: options.cancelPath }),
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('API Error:', errorData);
      throw new Error(`Failed to create checkout session: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    console.log('Response data:', data);
    
    // Redirect to Stripe checkout
    if (data.checkoutUrl) {
      const price = describePrice(priceId);
      if (price) {
        const fromPlan = typeof data.currentPlan === 'string' ? data.currentPlan : null;
        rememberCheckout({ priceId, ...price, fromPlan });
        track(
          'begin_checkout',
          { currency: 'USD', value: price.value, plan: price.plan, interval: price.interval, from_plan: fromPlan },
          // The pricing pages already send Meta's InitiateCheckout when the button is pressed.
          { meta: false }
        );
      }
      console.log('Redirecting to:', data.checkoutUrl);
      window.location.href = data.checkoutUrl;
      return data.checkoutUrl;
    }
    
    throw new Error('No checkout URL returned from API');
  } catch (error) {
    console.error('Detailed createCheckoutSession error:', error);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to payment service');
    }
    throw error;
  }
};

/**
 * Creates a customer portal session for billing management
 * @param userToken - The Firebase user ID token for authentication
 * @returns The customer portal URL
 */
export const createCustomerPortalSession = async (userToken: string): Promise<string> => {
  try {
    const response = await fetch('/api/create-customer-portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to create customer portal session');
    }

    const { portalUrl } = await response.json();
    window.location.href = portalUrl;
    return portalUrl;
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    throw error;
  }
}; 