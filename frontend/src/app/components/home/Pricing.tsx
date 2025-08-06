'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';

const pricingTiers = [
  {
    name: "Free",
    price: "0",
    description: "Perfect for trying out our platform",
    features: [
      "5 generations per day forever",
      "Basic keyword research",
      "Standard support",
      "Ad-supported"
    ],
    buttonText: "Get Started",
  },
  {
    name: "Kickstart",
    price: "49",
    description: "Ideal for growing businesses",
    features: [
      "12,000 words per month",
      "Unlimited free revisions",
      "200 keyword suggestions",
      "All API costs included",
      "Priority support"
    ],
    buttonText: "Start Trial",
    popular: true,
  },
  {
    name: "SEO Takeover",
    price: "99",
    description: "For serious content creators",
    features: [
      "30,000 words per month",
      "Unlimited free revisions",
      "400 keyword suggestions",
      "All API costs included",
      "24/7 Priority support",
      "Advanced analytics"
    ],
    buttonText: "Start Trial",
  },
];

export default function Pricing() {
  const router = useRouter();

  const handlePricingClick = () => {
    router.push('/register');
  };

  const handleEnterpriseClick = () => {
    router.push('/contact');
  };

  return (
    <section className="py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl mb-3">
            Simple, transparent pricing
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Choose the perfect plan for your content needs
          </p>
        </div>

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
                <div className="flex items-baseline mb-2">
                  <span className="text-4xl font-bold text-gray-900">${tier.price}</span>
                  <span className="text-gray-600 ml-2">/month</span>
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
                onClick={() => handlePricingClick()}
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
        <div className="bg-gradient-to-r from-blue-600 to-blue-400 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden">
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
            <div className="flex items-center gap-4">
              <span className="text-white/90">Custom Pricing</span>
              <button
                onClick={handleEnterpriseClick}
                className="bg-white text-blue-600 py-2 px-6 rounded-lg font-medium hover:bg-blue-50 transition-colors inline-flex items-center"
              >
                Speak to someone!
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
} 
