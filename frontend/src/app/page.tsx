'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import Image from 'next/image';

const features = [
  {
    name: 'AI-Powered Content Generation',
    description:
      'Generate high-quality, SEO-optimized articles in minutes using advanced AI technology.',
  },
  {
    name: 'Shopify Integration',
    description:
      'Seamlessly publish articles to your Shopify blog with one click.',
  },
  {
    name: 'Brand Voice Control',
    description:
      'Maintain consistent brand messaging with customizable tone and style settings.',
  },
  {
    name: 'SEO Optimization',
    description:
      'Articles are automatically optimized for search engines with proper structure and formatting.',
  },
  {
    name: 'Content Management',
    description:
      'Easily manage, edit, and organize your generated articles in one place.',
  },
  {
    name: 'Real-time Preview',
    description:
      'Preview your articles in real-time before publishing to ensure quality.',
  },
];

const pricing = {
  tiers: [
    {
      name: 'Basic',
      price: 29,
      features: [
        '50 articles per month',
        'Basic SEO optimization',
        'Standard templates',
        'Email support',
      ],
      cta: 'Start Basic',
      mostPopular: false,
    },
    {
      name: 'Professional',
      price: 79,
      features: [
        '200 articles per month',
        'Advanced SEO optimization',
        'Custom templates',
        'Priority support',
        'Shopify integration',
      ],
      cta: 'Start Professional',
      mostPopular: true,
    },
    {
      name: 'Enterprise',
      price: 199,
      features: [
        'Unlimited articles',
        'Premium SEO optimization',
        'Custom AI training',
        '24/7 support',
        'API access',
      ],
      cta: 'Contact Sales',
      mostPopular: false,
    },
  ],
};

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="bg-white">
      {/* Hero section */}
      <div className="relative isolate overflow-hidden bg-gradient-to-b from-indigo-100/20">
        <div className="mx-auto max-w-7xl pb-24 pt-10 sm:pb-32 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:px-8 lg:py-40">
          <div className="px-6 lg:px-0 lg:pt-4">
            <div className="mx-auto max-w-2xl">
              <div className="max-w-lg">
                <Image
                  width={40}
                  height={40}
                  className="h-11 w-auto"
                  src="/logo.png"
                  alt="EnhanceMySEO"
                />
                <h1 className="mt-10 text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
                  Generate SEO-optimized content with AI
                </h1>
                <p className="mt-6 text-lg leading-8 text-gray-600">
                  Create high-quality, SEO-optimized articles for your blog or
                  Shopify store in minutes. Let AI do the heavy lifting while you
                  focus on growing your business.
                </p>
                <div className="mt-10 flex items-center gap-x-6">
                  <Link
                    href={user ? '/dashboard' : '/register'}
                    className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                  >
                    Get started
                  </Link>
                  <Link
                    href="#features"
                    className="text-sm font-semibold leading-6 text-gray-900"
                  >
                    Learn more <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature section */}
      <div id="features" className="mx-auto mt-32 max-w-7xl px-6 sm:mt-56 lg:px-8">
        <div className="mx-auto max-w-2xl lg:text-center">
          <h2 className="text-base font-semibold leading-7 text-indigo-600">
            Everything you need
          </h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Powerful features for content creation
          </p>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Our platform provides all the tools you need to create, manage, and
            publish high-quality content that ranks well in search engines.
          </p>
        </div>
        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
          <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.name} className="flex flex-col">
                <dt className="text-base font-semibold leading-7 text-gray-900">
                  {feature.name}
                </dt>
                <dd className="mt-1 flex flex-auto flex-col text-base leading-7 text-gray-600">
                  <p className="flex-auto">{feature.description}</p>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Pricing section */}
      <div className="py-24 sm:pt-48">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-base font-semibold leading-7 text-indigo-600">
              Pricing
            </h2>
            <p className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
              Choose the right plan for&nbsp;you
            </p>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-gray-600">
            Choose an affordable plan that's packed with the best features for your
            content needs.
          </p>
          <div className="isolate mx-auto mt-16 grid max-w-md grid-cols-1 gap-y-8 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {pricing.tiers.map((tier, tierIdx) => (
              <div
                key={tier.name}
                className={`flex flex-col justify-between rounded-3xl bg-white p-8 ring-1 ring-gray-200 xl:p-10 ${
                  tier.mostPopular
                    ? 'lg:z-10 lg:rounded-b-none'
                    : 'lg:mt-8'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-x-4">
                    <h3 className="text-lg font-semibold leading-8 text-gray-900">
                      {tier.name}
                    </h3>
                    {tier.mostPopular ? (
                      <p className="rounded-full bg-indigo-600/10 px-2.5 py-1 text-xs font-semibold leading-5 text-indigo-600">
                        Most popular
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-6 flex items-baseline gap-x-1">
                    <span className="text-4xl font-bold tracking-tight text-gray-900">
                      ${tier.price}
                    </span>
                    <span className="text-sm font-semibold leading-6 text-gray-600">
                      /month
                    </span>
                  </p>
                  <ul
                    role="list"
                    className="mt-8 space-y-3 text-sm leading-6 text-gray-600"
                  >
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex gap-x-3">
                        <svg
                          className="h-6 w-5 flex-none text-indigo-600"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href={user ? '/dashboard' : '/register'}
                  className={`mt-8 block rounded-md px-3 py-2 text-center text-sm font-semibold leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    tier.mostPopular
                      ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-indigo-600'
                      : 'bg-white text-indigo-600 ring-1 ring-inset ring-indigo-200 hover:ring-indigo-300'
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-32 bg-gray-900 sm:mt-56" aria-labelledby="footer-heading">
        <h2 id="footer-heading" className="sr-only">
          Footer
        </h2>
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-24 lg:px-8 lg:py-32">
          <div className="xl:grid xl:grid-cols-3 xl:gap-8">
            <div className="mt-16 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
              <div className="md:grid md:grid-cols-2 md:gap-8">
                <div>
                  <h3 className="text-sm font-semibold leading-6 text-white">
                    Solutions
                  </h3>
                  <ul role="list" className="mt-6 space-y-4">
                    <li>
                      <Link
                        href="#"
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        Content Generation
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="#"
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        SEO Optimization
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="#"
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        Shopify Integration
                      </Link>
                    </li>
                  </ul>
                </div>
                <div className="mt-10 md:mt-0">
                  <h3 className="text-sm font-semibold leading-6 text-white">
                    Support
                  </h3>
                  <ul role="list" className="mt-6 space-y-4">
                    <li>
                      <Link
                        href="#"
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        Documentation
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="#"
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        Guides
                      </Link>
                    </li>
                    <li>
                      <Link
                        href="#"
                        className="text-sm leading-6 text-gray-300 hover:text-white"
                      >
                        API Status
                      </Link>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="mt-10 xl:mt-0">
              <h3 className="text-sm font-semibold leading-6 text-white">
                Subscribe to our newsletter
              </h3>
              <p className="mt-2 text-sm leading-6 text-gray-300">
                Get the latest news and updates about our product.
              </p>
              <form className="mt-6 sm:flex sm:max-w-md">
                <label htmlFor="email-address" className="sr-only">
                  Email address
                </label>
                <input
                  type="email"
                  name="email-address"
                  id="email-address"
                  autoComplete="email"
                  required
                  className="w-full min-w-0 appearance-none rounded-md border-0 bg-white/5 px-3 py-1.5 text-base text-white shadow-sm ring-1 ring-inset ring-white/10 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:w-64 sm:text-sm sm:leading-6"
                  placeholder="Enter your email"
                />
                <div className="mt-4 sm:ml-4 sm:mt-0 sm:flex-shrink-0">
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  >
                    Subscribe
                  </button>
                </div>
              </form>
            </div>
          </div>
          <div className="mt-16 border-t border-white/10 pt-8 sm:mt-20 lg:mt-24">
            <p className="text-xs leading-5 text-gray-400">
              &copy; {new Date().getFullYear()} EnhanceMySEO. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
