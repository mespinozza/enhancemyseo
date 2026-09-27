'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import {
  createCheckoutSession,
  getPriceId,
  getDisplayPrice,
  getOriginalPrice,
  getAnnualPrice,
} from '@/lib/stripe';
import {
  Check,
  X,
  Zap,
  Shield,
  Clock,
  Star,
  ChevronDown,
  ArrowRight,
  Mail,
} from 'lucide-react';
import Reviews from '@/components/home/Reviews';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  key: string;
  name: string;
  badge?: string;
  description: string;
  cta: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  annualTotal: number;
  features: { label: string; included: boolean }[];
  highlight: boolean;
}

// ─── Plan definitions ─────────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    key: 'free',
    name: 'Free',
    description: 'Try the tool with no commitment.',
    cta: 'Get Started Free',
    monthlyPrice: 0,
    annualMonthlyPrice: 0,
    annualTotal: 0,
    highlight: false,
    features: [
      { label: '2 articles per month', included: true },
      { label: 'Shopify product integration', included: true },
      { label: 'Basic SEO formatting', included: true },
      { label: 'Community support', included: true },
      { label: 'Bulk generation', included: false },
      { label: 'Automated scheduling', included: false },
      { label: 'Priority support', included: false },
    ],
  },
  {
    key: 'kickstart',
    name: 'Kickstart',
    description: 'For brands ready to grow their organic reach.',
    cta: 'Get a Kickstart',
    monthlyPrice: getDisplayPrice('kickstart', false),
    annualMonthlyPrice: getDisplayPrice('kickstart', true),
    annualTotal: getAnnualPrice('kickstart'),
    highlight: false,
    features: [
      { label: '25 articles per month', included: true },
      { label: 'Shopify product integration', included: true },
      { label: 'Advanced SEO optimization', included: true },
      { label: 'Bulk article generation', included: true },
      { label: 'Product & collection linking', included: true },
      { label: 'Priority email support', included: true },
      { label: 'Automated scheduling', included: false },
    ],
  },
  {
    key: 'seo_takeover',
    name: 'SEO Takeover',
    badge: 'Most Popular',
    description: 'Hands-free content at serious scale.',
    cta: 'Takeover Your Niche',
    monthlyPrice: getDisplayPrice('seo_takeover', false),
    annualMonthlyPrice: getDisplayPrice('seo_takeover', true),
    annualTotal: getAnnualPrice('seo_takeover'),
    highlight: true,
    features: [
      { label: '90 articles per month', included: true },
      { label: 'Shopify product integration', included: true },
      { label: 'Premium SEO optimization', included: true },
      { label: 'Bulk article generation', included: true },
      { label: 'Product & collection linking', included: true },
      { label: '24/7 Priority support', included: true },
      { label: 'Automated scheduling', included: true },
    ],
  },
];

const FAQS = [
  {
    q: 'Can I cancel anytime?',
    a: 'Yes — no contracts, no cancellation fees. Cancel from your account settings and your plan stays active until the end of the billing period.',
  },
  {
    q: 'Do unused articles roll over?',
    a: 'Article credits reset each month. We set the limits high enough that most users never hit them, but unused credits do not carry forward.',
  },
  {
    q: 'What happens when I hit my article limit?',
    a: "You'll see a friendly message letting you know. You can upgrade at any time mid-month and the new limit applies immediately.",
  },
  {
    q: 'Is the content actually good quality?',
    a: "Yes — and we've engineered it to be. Our pipeline combines Anthropic's Claude for long-form writing, Perplexity AI for real-time fact research, and ChatGPT for additional cross-referencing, so every article is grounded in accurate, up-to-date information with proper attribution. Before writing a single word, the tool researches your own website to understand your brand, products, and tone — meaning the output is tailored content, not generic filler. The result consistently passes AI-detection tools and human review alike, giving you articles that are trustworthy to readers and authoritative to search engines.",
  },
  {
    q: 'Does it work with any Shopify store?',
    a: 'Yes. Connect your store URL and we pull in your products, collections, and pages automatically to weave accurate links into every article.',
  },
  {
    q: 'What is automated scheduling?',
    a: 'SEO Takeover users can set a publishing schedule — daily or weekly — and the tool generates and optionally pushes articles to Shopify with no manual input needed.',
  },
  {
    q: 'Do you offer refunds?',
    a: "If you're not happy in your first 7 days, reach out and we'll make it right. Our goal is for the tool to pay for itself many times over.",
    cta: { label: 'Email Us', href: 'mailto:enhancemyseoplz@gmail.com' },
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────


function FaqItem({ q, a, cta }: { q: string; a: string; cta?: { label: string; href: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        className="flex w-full items-center justify-between py-5 text-left text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {q}
        <ChevronDown className={`ml-4 h-4 w-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pb-5">
          <p className="text-sm text-gray-600 leading-relaxed mb-3">{a}</p>
          {cta && (
            <a
              href={cta.href}
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Mail className="w-4 h-4" />
              {cta.label}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [isAnnual, setIsAnnual] = useState(true);

  const handlePlanClick = async (plan: Plan) => {
    if (plan.monthlyPrice === 0) {
      router.push(user ? '/dashboard' : '/login');
      return;
    }

    if (!user) {
      const priceId = getPriceId(plan.key, isAnnual) ?? '';
      const params = new URLSearchParams({ intent: 'purchase', priceId, tierName: plan.name, isAnnual: String(isAnnual) });
      router.push(`/login?${params.toString()}`);
      return;
    }

    try {
      const priceId = getPriceId(plan.key, isAnnual);
      if (!priceId) throw new Error('Price ID not found');
      const token = await user.getIdToken();
      await createCheckoutSession(priceId, token);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <main className="bg-white">

      {/* ── Hero ── */}
      <section className="bg-gradient-to-b from-blue-50 to-white pt-20 pb-12 px-4 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-xs font-semibold text-blue-700 mb-6">
          <Zap className="w-3.5 h-3.5" /> Simple, transparent pricing
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 leading-tight">
          Content that ranks.<br />
          <span className="text-blue-600">Pricing that makes sense.</span>
        </h1>
        <p className="text-lg text-gray-500 max-w-xl mx-auto mb-8">
          From your first article to fully automated publishing — pick the plan that fits where you are today.
        </p>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500 mb-10">
          <span className="flex items-center gap-1.5"><Shield className="w-4 h-4 text-green-500" /> No contracts</span>
          <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-blue-500" /> Cancel anytime</span>
          <span className="flex items-center gap-1.5"><Star className="w-4 h-4 text-yellow-400" /> 7-day happiness guarantee</span>
        </div>

        {/* Billing toggle */}
        <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 p-1 mb-4">
          <button
            onClick={() => setIsAnnual(false)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 ${
              !isAnnual
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setIsAnnual(true)}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 ${
              isAnnual
                ? 'bg-blue-600 text-white shadow'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Annual
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              isAnnual ? 'bg-blue-500 text-white' : 'bg-green-100 text-green-700'
            }`}>
              Save 20%
            </span>
          </button>
        </div>
        {isAnnual && <p className="text-xs text-gray-400">Billed as one annual payment</p>}
      </section>

      {/* ── Pricing cards ── */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const price = isAnnual ? plan.annualMonthlyPrice : plan.monthlyPrice;
            const originalMonthly = getOriginalPrice(plan.key);
            return (
              <div
                key={plan.key}
                className={`relative flex flex-col rounded-2xl border p-8 transition-shadow hover:shadow-lg ${
                  plan.highlight
                    ? 'border-blue-500 ring-2 ring-blue-500 bg-white shadow-xl'
                    : 'border-gray-200 bg-white shadow-sm'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white shadow">
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h2>
                  <p className="text-sm text-gray-500 mb-4">{plan.description}</p>

                  <div className="flex items-end gap-1 mb-1">
                    {isAnnual && originalMonthly > 0 && (
                      <span className="text-xl font-semibold text-gray-300 line-through mr-1">
                        ${originalMonthly}
                      </span>
                    )}
                    <span className="text-4xl font-extrabold text-gray-900">
                      {price === 0 ? 'Free' : `$${price}`}
                    </span>
                    {price > 0 && <span className="text-gray-400 mb-1">/mo</span>}
                  </div>

                  {isAnnual && plan.annualTotal > 0 && (
                    <p className="text-xs text-blue-600 font-medium">
                      Billed as ${plan.annualTotal}/year
                    </p>
                  )}
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.label} className="flex items-start gap-2.5 text-sm">
                      {f.included
                        ? <Check className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                        : <X className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />}
                      <span className={f.included ? 'text-gray-700' : 'text-gray-400'}>{f.label}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handlePlanClick(plan)}
                  className={`w-full rounded-lg py-3 text-sm font-semibold transition-colors ${
                    plan.highlight
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : plan.monthlyPrice === 0
                      ? 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      : 'border border-blue-600 text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            );
          })}
        </div>

        {/* Enterprise row */}
        <div className="mt-6 rounded-2xl bg-gray-900 p-8 flex flex-col sm:flex-row items-center justify-between gap-6 text-white">
          <div>
            <h3 className="text-xl font-bold mb-1">Agency / Enterprise</h3>
            <p className="text-gray-400 text-sm">Unlimited content, custom integrations, and a dedicated success manager.</p>
          </div>
          <button
            onClick={() => router.push('/contact')}
            className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg bg-white text-gray-900 px-6 py-3 text-sm font-semibold hover:bg-gray-100 transition-colors"
          >
            Talk to us <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ── Feature comparison table ── */}
      <section className="bg-gray-50 py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Everything in the box</h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-4 px-6 text-left font-semibold text-gray-700 w-1/2">Feature</th>
                  <th className="py-4 px-4 text-center font-semibold text-gray-500">Free</th>
                  <th className="py-4 px-4 text-center font-semibold text-gray-700">Kickstart</th>
                  <th className="py-4 px-4 text-center font-bold text-blue-600">SEO Takeover</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Articles per month', '2', '25', '90'],
                  ['Shopify integration', true, true, true],
                  ['AI-written, brand-aware content', true, true, true],
                  ['Embedded product & collection links', true, true, true],
                  ['Bulk generation', false, true, true],
                  ['Automated publishing schedule', false, false, true],
                  ['Priority support', false, true, true],
                  ['24/7 support', false, false, true],
                  ['Access to new features first', false, false, true],
                ].map(([feature, free, kick, seo], i) => (
                  <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="py-3.5 px-6 text-gray-700">{feature}</td>
                    {[free, kick, seo].map((val, j) => (
                      <td key={j} className="py-3.5 px-4 text-center">
                        {typeof val === 'boolean' ? (
                          val
                            ? <Check className="w-4 h-4 text-blue-500 mx-auto" />
                            : <X className="w-4 h-4 text-gray-300 mx-auto" />
                        ) : (
                          <span className={`font-medium ${j === 2 ? 'text-blue-600' : 'text-gray-700'}`}>{val}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <Reviews />

      {/* ── FAQ ── */}
      <section className="bg-gray-50 py-16 px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">Common questions</h2>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6">
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} cta={faq.cta} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="py-20 px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
          Ready to start ranking?
        </h2>
        <p className="text-gray-500 mb-8 max-w-md mx-auto">
          Join brands already generating articles that land on page one. Start free — no card required.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => router.push('/login')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
          >
            Get started free <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => router.push('/contact')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-8 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Talk to sales
          </button>
        </div>
        <p className="mt-4 text-xs text-gray-400">No credit card required · Cancel anytime · 7-day guarantee</p>
      </section>
    </main>
  );
}
