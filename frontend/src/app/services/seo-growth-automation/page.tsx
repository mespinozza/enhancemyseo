import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  BadgeCheck,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  Eye,
  FileText,
  ImageIcon,
  Layers,
  Link2,
  ListChecks,
  MousePointerClick,
  Search,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Type,
  Workflow,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EVIDENCE } from '@/lib/proof/content';
import { describeAutomationLimit } from '@/lib/automation/limits';
import { FAQS, FEATURES, PROBLEMS, SAFEGUARDS, SOURCES, STEPS, planRows } from '@/lib/automation/landing';
import { CASE_STUDY_ARTICLES } from '@/lib/thumbnail/landing';
import { CtaButton, Reveal } from '@/components/proof/ProofProvider';
import PlanCards from '@/components/proof/PlanCards';
import AutomationRunPreview from '@/components/automation/landing/AutomationRunPreview';
import LandingView from '@/components/landing/LandingView';
import SectionHeading from '@/components/landing/SectionHeading';

const PATH = '/services/seo-growth-automation';
const [CASE_STUDY_SLUG] = Object.keys(EVIDENCE);
const evidence = EVIDENCE[CASE_STUDY_SLUG];
const ARTICLES = CASE_STUDY_ARTICLES;

const TITLE = 'SEO Growth Automation: Scheduled Blog Articles for Shopify | EnhanceMySEO';
const DESCRIPTION = `Put your store's blog on autopilot. SEO growth automation picks keywords, writes fact-checked articles around your products, adds a featured image and publishes to Shopify on your schedule. The approach behind ${evidence.totals.impressions} Google impressions.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'SEO automation',
    'automated blog posts',
    'Shopify blog automation',
    'AI blog writer for Shopify',
    'scheduled SEO articles',
    'SEO content automation',
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: 'SEO Growth Automation: Your Blog, Publishing on Schedule | EnhanceMySEO',
    description: DESCRIPTION,
    url: PATH,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SEO Growth Automation: Your Blog, Publishing on Schedule | EnhanceMySEO',
    description: DESCRIPTION,
  },
};

const SOURCE_ICONS: Record<(typeof SOURCES)[number]['icon'], LucideIcon> = {
  list: ListChecks,
  search: Search,
  collection: Layers,
};

const FEATURE_ICONS: Record<(typeof FEATURES)[number]['icon'], LucideIcon> = {
  shopify: ShoppingBag,
  image: ImageIcon,
  type: FileText,
  voice: Type,
  links: Link2,
  brands: Workflow,
};

function structuredData() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://enhancemyseo.com';
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'EnhanceMySEO SEO Growth Automation',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: `${site}${PATH}`,
      description: DESCRIPTION,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        lowPrice: '23',
        highPrice: '99',
        offerCount: 2,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: site },
        { '@type': 'ListItem', position: 2, name: 'SEO Growth Automation', item: `${site}${PATH}` },
      ],
    },
  ];
}

export default function SeoGrowthAutomationPage() {
  const stats: { icon: LucideIcon; value: string; label: string }[] = [
    { icon: FileText, value: String(ARTICLES), label: 'Articles published on schedule' },
    { icon: Eye, value: evidence.totals.impressions, label: 'Google impressions' },
    { icon: MousePointerClick, value: evidence.totals.clicks, label: 'Organic clicks' },
    { icon: TrendingUp, value: evidence.totals.position, label: 'Average position' },
  ];
  const plans = planRows();

  return (
    <>
      <LandingView name="seo_growth_automation" />
      {structuredData().map((data) => (
        <script key={data['@type']} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-blue-50/70 to-white" />
        <div aria-hidden className="absolute -left-40 -top-40 -z-10 h-[32rem] w-[32rem] rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="max-w-xl">
            <a
              href="#case-study"
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:ring-blue-300 sm:text-sm"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700">
                <TrendingUp className="h-3 w-3" />
              </span>
              {ARTICLES} articles published, {evidence.totals.impressions} impressions
            </a>
            <h1 className="mt-5 text-[2.1rem] font-bold leading-[1.12] text-gray-900 sm:text-5xl sm:leading-[1.08]">
              Your Blog Keeps Growing,{' '}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">Even When You&apos;re Busy</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 sm:text-xl">
              SEO growth automation picks the next keyword, writes a fact-checked article around your
              products, adds a featured image and publishes it to Shopify, on the schedule you set.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CtaButton label="Start Automating" target="signup" location="auto_hero_primary" />
              <CtaButton label="See How It Works" target="how" location="auto_hero_secondary" tone="secondary" />
            </div>

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500">
              {['Drafts by default', 'Monthly caps you control', 'Pause any time'].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-green-500" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mx-auto w-full max-w-md lg:max-w-none">
            <AutomationRunPreview />
          </div>
        </div>
      </section>

      {/* ── Proof band ── */}
      <section className="bg-gray-900">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          {stats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="px-2 py-8 text-center sm:py-10">
              <Icon className="mx-auto h-5 w-5 text-blue-300" />
              <div className="mt-2 text-3xl font-bold tabular-nums text-white sm:text-4xl">{value}</div>
              <div className="mt-1 text-xs text-gray-400 sm:text-sm">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Why automate" title="SEO Rewards Consistency. Most Stores Can't Keep Up.">
              Google trusts sites that publish useful content steadily. The hard part isn&apos;t writing one
              article, it&apos;s writing the fiftieth.
            </SectionHeading>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PROBLEMS.map((problem, index) => (
              <Reveal key={problem.title} delay={index * 80} className="h-full">
                <div className="h-full rounded-2xl bg-gray-50 p-6 ring-1 ring-gray-200">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-500">
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                  <h3 className="mt-4 font-semibold text-gray-900">{problem.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{problem.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Case study ── */}
      <section id="case-study" className="scroll-mt-20 bg-gradient-to-b from-white to-blue-50/60 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="The case study" title={`${ARTICLES} Articles, Published on a Schedule`}>
              A commercial kitchen parts store on {evidence.platform}. Their product catalogue became a
              steady stream of SEO articles while their team ran the store. {evidence.range}.
            </SectionHeading>
          </Reveal>

          <Reveal className="mt-12 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center" event="proof_view" params={{ part: 'automation_chart' }}>
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-blue-900/10">
              <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
                <span className="ml-3 truncate text-xs text-gray-400">search.google.com/search-console</span>
              </div>
              <Image
                src={evidence.chart.url}
                alt={evidence.chart.alt}
                width={evidence.chart.width}
                height={evidence.chart.height}
                sizes="(min-width: 1024px) 600px, 100vw"
                className="h-auto w-full"
              />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">Steady publishing compounds</h3>
              <p className="mt-3 text-gray-600">
                Each article targeted a specific buyer question around their parts and brands. Published
                one after another, they added up to a blog Google sends traffic to every day.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-gray-700">
                {[
                  `${evidence.totals.impressions} impressions and ${evidence.totals.clicks} organic clicks`,
                  '150 keywords on page one of Google',
                  'Every article built from their own products, with a featured image',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" strokeWidth={2.5} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href={`/results/${CASE_STUDY_SLUG}`} className="mt-6 inline-flex items-center text-sm font-semibold text-blue-600 hover:underline">
                Read the full case study
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="scroll-mt-20 bg-gray-900 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="How it works" title="Set It Up Once in About Five Minutes" dark>
              After that, every run happens on its own. You get the articles, the run history, and the final say.
            </SectionHeading>
          </Reveal>
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Reveal delay={index * 100} className="h-full rounded-2xl border border-white/10 bg-white/5 p-6">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-sm font-bold text-white shadow-lg shadow-blue-500/30">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-300">{step.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Sources ── */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="What to write about" title="Three Ways to Feed It Keywords">
              Use one, or run separate automations for each.
            </SectionHeading>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {SOURCES.map((source, index) => {
              const Icon = SOURCE_ICONS[source.icon];
              return (
                <Reveal key={source.title} delay={index * 80} className="h-full">
                  <div className="h-full rounded-2xl bg-gradient-to-b from-blue-50/70 to-white p-6 ring-1 ring-blue-100">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-lg font-semibold text-gray-900">{source.title}</h3>
                    <p className="mt-2 text-sm text-gray-600">{source.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Safeguards ── */}
      <section className="bg-gray-50 py-16 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:px-8">
          <Reveal className="lg:sticky lg:top-24">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100 text-green-700">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-3xl font-bold text-gray-900 sm:text-4xl">Hands-Free Doesn&apos;t Mean Out of Control</h2>
            <p className="mt-4 text-lg text-gray-600">
              Automation is only useful if you can trust it. Every automation comes with limits and a
              paper trail, so you always know what was published and why.
            </p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {SAFEGUARDS.map((item, index) => (
              <Reveal key={item.title} delay={(index % 2) * 80} className="h-full">
                <div className="h-full rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                  <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                    <BadgeCheck className="h-5 w-5 flex-shrink-0 text-green-500" />
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Every article" title="Written Like Your Best Marketer Would" />
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => {
              const Icon = FEATURE_ICONS[feature.icon];
              return (
                <Reveal key={feature.title} delay={(index % 3) * 80} className="h-full">
                  <div className="group h-full rounded-2xl p-6 ring-1 ring-gray-200 transition hover:bg-blue-50/40 hover:ring-blue-200">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white transition group-hover:bg-blue-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-semibold text-gray-900">{feature.title}</h3>
                    <p className="mt-2 text-sm text-gray-600">{feature.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="plans" className="scroll-mt-20 bg-gradient-to-b from-blue-50/60 to-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal event="pricing_view" params={{ page: 'seo_growth_automation' }}>
            <SectionHeading eyebrow="Plans" title="Automations on Every Paid Plan">
              Each plan runs a set number of automations at once. Automated articles come out of your
              plan&apos;s monthly articles.
            </SectionHeading>
          </Reveal>

          <Reveal className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            {plans.map((plan) => (
              <div key={plan.key} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <CalendarClock className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-500">{plan.name}</p>
                  <p className="text-lg font-bold text-gray-900">{describeAutomationLimit(plan.key)}</p>
                  <p className="text-sm text-gray-600">Up to {plan.articles} articles a month</p>
                </div>
              </div>
            ))}
          </Reveal>
          <p className="mt-4 text-center text-sm text-gray-500">
            <Clock className="mr-1 inline h-4 w-4 align-[-3px]" />
            The free plan lets you try article writing by hand. Automations start on Kickstart.
          </p>

          <div className="mt-10">
            <PlanCards recommended="seo_takeover" />
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="FAQ" title="Automation Questions, Answered" />
          </Reveal>
          <div className="mt-10 divide-y divide-gray-200 rounded-2xl bg-white ring-1 ring-gray-200">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group px-5 sm:px-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <ChevronDown className="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="-mt-1 pb-5 text-gray-600">{faq.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-gray-600">
            Want the featured images on their own?{' '}
            <Link href="/services/thumbnail-generation" className="font-semibold text-blue-600 hover:underline">
              See the thumbnail generator
            </Link>
          </p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gray-900 px-6 py-14 text-center text-white sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(110% 75% at 50% -15%, rgba(96, 165, 250, 0.3), rgba(96, 165, 250, 0) 70%)' }}
          />
          <div className="relative">
            <h2 className="mx-auto max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">Set Up Your First Automation Today.</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-300">
              Pick your keywords and a schedule. Your next article will be waiting for you, written,
              illustrated and ready to publish.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <CtaButton label="Start Automating" target="signup" location="auto_final_primary" />
              <CtaButton
                label="Compare Plans"
                target="plans"
                location="auto_final_secondary"
                tone="secondary"
                className="!bg-white/10 !text-white !ring-white/20 hover:!bg-white/20"
              />
            </div>
            <p className="mt-5 text-sm text-gray-400">
              Results come from one client&apos;s store and vary by niche, competition and publishing pace.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
