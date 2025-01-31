'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { ArrowRight, Check, Image, BarChart3, FileText, Table, Link2, Search } from 'lucide-react';
import { createCheckoutSession } from '@/lib/stripe';
import { useState } from 'react';

interface PricingTier {
  name: string;
  price: string;
  description: string;
  features: string[];
  buttonText: string;
  popular?: boolean;
  priceId?: string;
}

export default function Pricing() {
  const router = useRouter();
  const { user } = useAuth();
  const [isAnnual, setIsAnnual] = useState(true);

  const getPrice = (monthlyPrice: number, isAnnual: boolean) => {
    if (isAnnual) {
      const annualDiscount = 0.20; // 20% discount
      const discountedMonthly = monthlyPrice * (1 - annualDiscount);
      return discountedMonthly.toFixed(0);
    }
    return monthlyPrice.toString();
  };

  const pricingTiers: PricingTier[] = [
    {
      name: "Free",
      price: "0",
      description: "Perfect for trying out our platform",
      features: [
        "5 generations per day",
        "Basic keyword research",
        "Basic Article Generation",
        "Contains Ads"
      ],
      buttonText: "Get Started",
    },
    {
      name: "Kickstart",
      price: getPrice(29, isAnnual),
      description: "Ideal for growing businesses",
      features: [
        "12,000 words per month",
        "Unlimited Article Revisions",
        "200 keyword suggestions",
        "All API costs included",
        "Priority support",
        "No Ads"
      ],
      buttonText: "Get Started",
      popular: true,
      priceId: isAnnual 
        ? process.env.NEXT_PUBLIC_KICKSTART_ANNUAL_PRICE_ID 
        : process.env.NEXT_PUBLIC_KICKSTART_PRICE_ID,
    },
    {
      name: "SEO Takeover",
      price: getPrice(99, isAnnual),
      description: "For serious content creators",
      features: [
        "30,000 words per month",
        "Unlimited Article Revisions",
        "400 keyword suggestions",
        "24/7 Priority support",
        "Article Scheduling",
        "Access to new features first"
      ],
      buttonText: "Get Started",
      priceId: isAnnual 
        ? process.env.NEXT_PUBLIC_SEO_TAKEOVER_ANNUAL_PRICE_ID 
        : process.env.NEXT_PUBLIC_SEO_TAKEOVER_PRICE_ID,
    },
  ];

  const handlePricingClick = async (tier: PricingTier) => {
    if (!user) {
      router.push('/register');
      return;
    }

    if (tier.price === "0") {
      // Handle free tier
      router.push('/dashboard');
      return;
    }

    try {
      if (!tier.priceId) {
        throw new Error('Price ID not found');
      }
      await createCheckoutSession(tier.priceId, user.uid);
    } catch (error) {
      console.error('Error:', error);
      alert('Something went wrong. Please try again.');
    }
  };

  const handleEnterpriseClick = () => {
    router.push('/contact');
  };

  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Pricing Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl mb-3">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            Choose the perfect plan for your content needs
          </p>
          
          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-3">
            <span className={`text-sm ${!isAnnual ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
              Monthly billing
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 bg-gray-200"
              role="switch"
              aria-checked={isAnnual}
            >
              <span
                className={`${
                  isAnnual ? 'translate-x-6' : 'translate-x-1'
                } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
              />
            </button>
            <span className={`text-sm ${isAnnual ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
              Annual billing
              <span className="ml-1.5 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                Save 20%
              </span>
            </span>
          </div>
        </div>

        {/* Pricing Tiers */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {pricingTiers.map((tier) => (
            <div
              key={tier.name}
              className={`relative bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 ${
                tier.popular ? 'ring-2 ring-blue-600' : ''
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-600 text-white text-sm font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{tier.name}</h3>
                <div className="flex flex-col mb-2">
                  <div className="flex items-baseline">
                    <span className="text-4xl font-bold text-gray-900">${tier.price}</span>
                    <span className="text-gray-600 ml-2">/month</span>
                  </div>
                  {isAnnual && tier.price !== "0" && (
                    <span className="text-sm text-blue-600 mt-1">
                      (Billed at ${(Number(tier.price) * 12).toFixed(0)} per year)
                    </span>
                  )}
                </div>
                <p className="text-gray-600">{tier.description}</p>
              </div>
              <ul className="space-y-4 mb-8">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex items-start">
                    <Check className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" />
                    <span className="text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handlePricingClick(tier)}
                className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                  tier.popular
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                {tier.buttonText}
              </button>
            </div>
          ))}
        </div>

        {/* Enterprise Section */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-400 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden mb-12">
          <div className="md:flex items-center justify-between">
            <div className="mb-6 md:mb-0">
              <h3 className="text-2xl font-bold mb-2">Agency / Enterprise</h3>
              <ul className="space-y-2">
                <li className="flex items-center">
                  <Check className="w-5 h-5 mr-2" />
                  <span>Unlimited content</span>
                </li>
                <li className="flex items-center">
                  <Check className="w-5 h-5 mr-2" />
                  <span>Custom integrations</span>
                </li>
                <li className="flex items-center">
                  <Check className="w-5 h-5 mr-2" />
                  <span>Built for scale</span>
                </li>
              </ul>
            </div>
            <button
              onClick={handleEnterpriseClick}
              className="bg-white text-blue-600 py-2 px-6 rounded-lg font-medium hover:bg-blue-50 transition-colors inline-flex items-center"
            >
              Speak to someone!
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>

        {/* Feature Showcase Section */}
        <div id="features" className="mb-12 bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl p-12">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-16 text-center">
              <h2 className="text-4xl font-bold inline-flex flex-col items-center">
                <span className="relative inline-block mb-2">
                  <span className="relative z-10">Our tool</span>
                  <div className="absolute -inset-1 bg-blue-200 rounded-lg transform -rotate-2"></div>
                </span>
                <span>thrives even when</span>
                <span>updates 
                  <span className="relative inline-block mx-2">
                    <span className="relative z-10 text-white">destroy</span>
                    <div className="absolute -inset-1 bg-red-500 rounded-lg transform -rotate-1"></div>
                  </span>
                other tools</span>
              </h2>
            </div>

            {/* Features Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Image className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="ml-3 font-semibold text-gray-900">Embedded products images & text</h3>
                </div>
                <p className="text-gray-600">Our tool will accurately embed product links within images and text for you</p>
              </div>

              {/* Feature 2 */}
              <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <BarChart3 className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="ml-3 font-semibold text-gray-900">Interactive charts and graphs</h3>
                </div>
                <p className="text-gray-600">Our tool takes any relevant data found for your article to create beautiful graphs and charts</p>
              </div>

              {/* Feature 3 */}
              <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="ml-3 font-semibold text-gray-900">Uses your content</h3>
                </div>
                <p className="text-gray-600">Our tool researches your website and understand when to use relevant information</p>
              </div>

              {/* Feature 4 */}
              <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Table className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="ml-3 font-semibold text-gray-900">Custom tables and infographics</h3>
                </div>
                <p className="text-gray-600">Our tool uses meaningful information to create stunning visuals</p>
              </div>

              {/* Feature 5 */}
              <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Link2 className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="ml-3 font-semibold text-gray-900">Internal links that boost your content</h3>
                </div>
                <p className="text-gray-600">Our tool is trained to create topical authority and internally link to the correct pages</p>
              </div>

              {/* Feature 6 */}
              <div className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Search className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="ml-3 font-semibold text-gray-900">Built for SEO</h3>
                </div>
                <p className="text-gray-600">Our tool generates content designed for humans and search engines</p>
              </div>
            </div>
          </div>
        </div>

        {/* Statistics Showcase Section */}
        <div className="mb-12 bg-gray-900 rounded-3xl shadow-xl p-12 text-white overflow-hidden relative">
          {/* Add fade effect to border */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-white via-transparent to-transparent opacity-5"></div>
          
          <div className="absolute top-0 left-0 w-full h-32 overflow-hidden">
            <div className="absolute top-8 left-1/2 transform -translate-x-1/2 w-3/4">
              <svg viewBox="0 0 1000 100" className="text-blue-500/10">
                <path
                  d="M 0 50 C 250 0, 750 100, 1000 50 L 1000 0 L 0 0"
                  fill="currentColor"
                />
              </svg>
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-full h-full">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-blue-400/20 blur-xl"></div>
              </div>
            </div>
          </div>

          <div className="relative z-10 max-w-7xl mx-auto text-center">
            <div className="inline-flex items-center px-4 py-2 bg-gray-800/50 rounded-full backdrop-blur-sm mb-8">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
              <span className="text-sm text-gray-300">See results from Our tool</span>
            </div>

            <h2 className="text-5xl font-bold mb-4">
              Thousands of articles
              <br />
              <span className="relative inline-block mt-2">
                <span className="relative z-10">on page #1</span>
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-blue-400 rounded-lg opacity-50 blur"></div>
              </span>
            </h2>

            <p className="text-gray-400 text-lg mb-8">
              We have taken tons of brands from page 100 on google to #1.
              <br />Start using the tool that will help you thrive today
              <svg className="w-5 h-5 inline-block ml-2 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </p>

            <button
              onClick={() => router.push('/login')}
              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-400 text-white font-medium rounded-lg hover:from-blue-700 hover:to-blue-500 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <span className="mr-2">Generate now</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
} 