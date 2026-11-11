import { getAnnualPrice, getDisplayPrice } from '@/lib/stripe';
import { USAGE_LIMITS } from '@/lib/usage-limits';
import { describeAutomationLimit } from '@/lib/automation/limits';

/**
 * The self-serve plans as sold on /pricing and /proof. Prices come from the Stripe
 * config and article counts from the usage limits the API enforces, so a change in
 * either shows up on both pages.
 */
export interface Plan {
  key: 'free' | 'kickstart' | 'seo_takeover';
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

const articles = (plan: Plan['key']) => `${USAGE_LIMITS[plan].articles} articles per month`;
const automations = (plan: Plan['key']) => `${describeAutomationLimit(plan)} running on a schedule`;

export const PLANS: Plan[] = [
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
      { label: articles('free'), included: true },
      { label: 'Shopify product integration', included: true },
      { label: 'Basic SEO formatting', included: true },
      { label: 'Community support', included: true },
      { label: 'Bulk generation', included: false },
      { label: 'Article thumbnails', included: false },
      { label: 'SEO growth automations', included: false },
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
      { label: articles('kickstart'), included: true },
      { label: 'Shopify product integration', included: true },
      { label: 'Advanced SEO optimization', included: true },
      { label: 'Bulk article generation', included: true },
      { label: 'Product & collection linking', included: true },
      { label: 'Article thumbnails with your branding', included: true },
      { label: automations('kickstart'), included: true },
      { label: 'Priority email support', included: true },
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
      { label: articles('seo_takeover'), included: true },
      { label: 'Shopify product integration', included: true },
      { label: 'Premium SEO optimization', included: true },
      { label: 'Bulk article generation', included: true },
      { label: 'Product & collection linking', included: true },
      { label: 'Article thumbnails, made automatically', included: true },
      { label: automations('seo_takeover'), included: true },
      { label: '24/7 Priority support', included: true },
    ],
  },
];
