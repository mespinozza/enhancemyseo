/**
 * Stripe integration for checkout sessions
 */

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

/**
 * Creates a checkout session for subscription payment
 * @param priceId - The Stripe price ID for the subscription plan
 * @param userToken - The Firebase user ID token for authentication
 * @returns The checkout session URL
 */
export const createCheckoutSession = async (priceId: string, userToken: string): Promise<string> => {
  try {
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({ priceId }),
    });

    if (!response.ok) {
      throw new Error('Failed to create checkout session');
    }

    const data = await response.json();
    
    // Redirect to Stripe checkout
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return data.checkoutUrl;
    }
    
    throw new Error('No checkout URL returned');
  } catch (error) {
    console.error('Error creating checkout session:', error);
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