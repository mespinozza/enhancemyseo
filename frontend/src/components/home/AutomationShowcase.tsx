import Link from 'next/link';
import { ArrowRight, CalendarClock, FileCheck2, Search, ShieldCheck, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { describeAutomationLimit } from '@/lib/automation/limits';
import { Reveal } from '@/components/proof/ProofProvider';
import AutomationRunPreview from '@/components/automation/landing/AutomationRunPreview';

const POINTS: { icon: LucideIcon; text: string }[] = [
  { icon: Search, text: 'Works from your topic list, a keyword collection or your Search Console data' },
  { icon: FileCheck2, text: 'Writes and fact-checks each article around your products, with a featured image' },
  { icon: CalendarClock, text: 'Publishes to Shopify daily or on the weekdays you choose' },
  { icon: ShieldCheck, text: 'Drafts by default, with a monthly cap and a full run history' },
];

const PLANS = [
  { name: 'Kickstart', tier: 'kickstart' },
  { name: 'SEO Takeover', tier: 'seo_takeover' },
];

/** SEO growth automation: the blog keeps publishing without anyone at the keyboard. */
export default function AutomationShowcase() {
  return (
    <section id="automation" aria-labelledby="automation-heading" className="relative scroll-mt-24 py-12">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-14 lg:px-8">
        <Reveal className="order-last mx-auto w-full max-w-md lg:order-first lg:max-w-none">
          <AutomationRunPreview />
        </Reveal>

        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
            <Workflow className="h-3.5 w-3.5" />
            SEO growth automation
          </span>
          <h2 id="automation-heading" className="mt-4 text-3xl font-bold leading-tight text-gray-900 sm:text-4xl">
            Put your blog on autopilot
          </h2>
          <p className="mt-4 text-gray-600">
            Rankings come from publishing steadily, month after month. Set up an automation once and it picks
            the next keyword, writes the article and publishes it on schedule, while you run your store.
          </p>

          <ul className="mt-6 space-y-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-gray-700">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-7 grid grid-cols-2 divide-x divide-gray-200 rounded-xl bg-white/80 py-3 shadow-sm ring-1 ring-gray-200">
            {PLANS.map((plan) => (
              <div key={plan.tier} className="px-3 text-center">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs">{plan.name}</dt>
                <dd className="mt-0.5 text-lg font-bold text-gray-900 sm:text-xl">{describeAutomationLimit(plan.tier)}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link
              href="/services/seo-growth-automation"
              className="inline-flex items-center whitespace-nowrap rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              See SEO growth automation
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <p className="text-sm text-gray-500">Not included on the free plan.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
