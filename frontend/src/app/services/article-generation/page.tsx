import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  Eye,
  FileText,
  Link2,
  MessageSquareQuote,
  MousePointerClick,
  Search,
  Sparkles,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EVIDENCE, FAQS } from '@/lib/proof/content';
import { COMPARISON, FEATURES, HERO_POINTS } from '@/lib/articles/landing';
import { USAGE_LIMITS } from '@/lib/usage-limits';
import { CtaButton, Reveal } from '@/components/proof/ProofProvider';
import Demo from '@/components/proof/Demo';
import PlanCards from '@/components/proof/PlanCards';
import SectionHeading from '@/components/landing/SectionHeading';
import LandingView from '@/components/landing/LandingView';

const PATH = '/services/article-generation';
const [CASE_STUDY_SLUG] = Object.keys(EVIDENCE);
const evidence = EVIDENCE[CASE_STUDY_SLUG];
const ARTICLES = 250;
const PAGE_ONE = 150;

const TITLE = 'AI Article Generator for Shopify Blogs | EnhanceMySEO';
const DESCRIPTION = `Generate SEO articles from your Shopify products: researched, on-brand, linked to your products and published on a schedule. The tool behind ${evidence.totals.clicks} organic clicks for a client store. Start with 2 free articles.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'AI article generator',
    'SEO article generator',
    'Shopify blog writer',
    'AI blog post generator',
    'ecommerce content generator',
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: 'Turn Your Products Into Articles That Rank | EnhanceMySEO',
    description: DESCRIPTION,
    url: PATH,
    type: 'website',
    images: [{ url: evidence.chart.url, width: evidence.chart.width, height: evidence.chart.height, alt: evidence.chart.alt }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Turn Your Products Into Articles That Rank | EnhanceMySEO',
    description: DESCRIPTION,
    images: [evidence.chart.url],
  },
};

const FEATURE_ICONS: Record<(typeof FEATURES)[number]['icon'], LucideIcon> = {
  store: Store,
  link: Link2,
  voice: MessageSquareQuote,
  search: Search,
  sparkles: Sparkles,
  calendar: CalendarClock,
};

function structuredData() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://enhancemyseo.com';
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'EnhanceMySEO Article Generator',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: `${site}${PATH}`,
      description: DESCRIPTION,
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        lowPrice: '0',
        highPrice: '99',
        offerCount: 3,
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
        { '@type': 'ListItem', position: 2, name: 'Article Generation', item: `${site}${PATH}` },
      ],
    },
  ];
}

function ScreenshotFrame({ children, priority = false }: { children?: React.ReactNode; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-blue-900/15">
      <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
        <span className="ml-3 truncate text-xs text-gray-400">search.google.com/search-console</span>
      </div>
      <div className="relative">
        <Image
          src={evidence.chart.url}
          alt={evidence.chart.alt}
          width={evidence.chart.width}
          height={evidence.chart.height}
          priority={priority}
          sizes="(min-width: 1024px) 620px, 100vw"
          className="h-auto w-full"
        />
        {children}
      </div>
    </div>
  );
}

export default function ArticleGenerationPage() {
  const stats: { icon: LucideIcon; value: string; label: string }[] = [
    { icon: MousePointerClick, value: evidence.totals.clicks, label: 'Organic clicks' },
    { icon: Eye, value: evidence.totals.impressions, label: 'Google impressions' },
    { icon: FileText, value: String(ARTICLES), label: 'Articles published' },
    { icon: Search, value: String(PAGE_ONE), label: 'Keywords on page one' },
  ];
  const kickstart = USAGE_LIMITS.kickstart.articles;
  const takeover = USAGE_LIMITS.seo_takeover.articles;

  return (
    <>
      <LandingView name="article_generation" />
      {structuredData().map((data) => (
        <script key={data['@type']} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-blue-50/70 to-white" />
        <div aria-hidden className="absolute -left-40 -top-40 -z-10 h-[32rem] w-[32rem] rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="max-w-xl">
            <a
              href="#case-study"
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:ring-blue-300 sm:text-sm"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700">
                <TrendingUp className="h-3 w-3" />
              </span>
              {evidence.totals.clicks} organic clicks for one client store
            </a>
            <h1 className="mt-5 text-[2.1rem] font-bold leading-[1.12] text-gray-900 sm:text-5xl sm:leading-[1.08]">
              Turn Your Products Into Articles That{' '}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">Rank on Google</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 sm:text-xl">
              An AI article generator built for Shopify stores. Every article is researched, written
              in your brand voice and linked to the products it covers, then published to your blog
              in one click or on a schedule.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CtaButton label="Start With 2 Free Articles" target="signup" location="article_hero_primary" />
              <CtaButton label="See How It Works" target="how" location="article_hero_secondary" tone="secondary" />
            </div>

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500">
              {HERO_POINTS.map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-green-500" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.2em] text-gray-400 lg:text-left">
              Real store. Real Search Console.
            </p>
            <ScreenshotFrame priority>
              <div className="absolute -bottom-px left-3 right-3 hidden translate-y-1/2 justify-center gap-3 sm:flex">
                {[
                  { label: 'Organic clicks', value: evidence.totals.clicks },
                  { label: 'Impressions', value: evidence.totals.impressions },
                  { label: 'Avg. position', value: evidence.totals.position },
                ].map((chip) => (
                  <span key={chip.label} className="rounded-xl bg-white px-4 py-2 text-center shadow-lg ring-1 ring-gray-200">
                    <span className="block text-lg font-bold tabular-nums text-gray-900">{chip.value}</span>
                    <span className="block text-[11px] text-gray-500">{chip.label}</span>
                  </span>
                ))}
              </div>
            </ScreenshotFrame>
          </div>
        </div>
      </section>

      {/* ── Proof band ── */}
      <section className="bg-gray-900">
        <div className="mx-auto grid max-w-7xl grid-cols-2 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          {stats.map(({ icon: Icon, value, label }) => (
            <div key={label} className="px-2 py-8 text-center sm:py-10">
              <Icon className="mx-auto h-5 w-5 text-blue-300" />
              <div className="mt-2 text-3xl font-bold tabular-nums text-white sm:text-4xl">{value}</div>
              <div className="mt-1 text-xs text-gray-400 sm:text-sm">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Comparison ── */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Why it works" title="Consistent, Helpful Content Without the Hours">
              Organic traffic comes from publishing useful articles week after week. That&apos;s the part
              most stores never get to.
            </SectionHeading>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <Reveal className="h-full">
              <div className="h-full rounded-2xl bg-gray-50 p-6 ring-1 ring-gray-200 sm:p-8">
                <h3 className="text-lg font-bold text-gray-500">{COMPARISON.old.title}</h3>
                <ul className="mt-5 space-y-3.5">
                  {COMPARISON.old.points.map((point) => (
                    <li key={point} className="flex gap-3 text-gray-600">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-500">
                        <X className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal className="h-full" delay={100}>
              <div className="relative h-full overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-6 text-white shadow-xl shadow-blue-600/25 sm:p-8">
                <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
                <h3 className="relative text-lg font-bold">{COMPARISON.new.title}</h3>
                <ul className="relative mt-5 space-y-3.5">
                  {COMPARISON.new.points.map((point) => (
                    <li key={point} className="flex gap-3 text-blue-50">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="scroll-mt-20 bg-gradient-to-b from-white to-blue-50/60 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="How it works" title="From Product to Published Article in Minutes">
              Pick a product, and watch it become an article that links back to it.
            </SectionHeading>
          </Reveal>
          <Reveal className="mt-10">
            <Demo />
          </Reveal>
          <div className="mt-10 flex justify-center">
            <CtaButton label="Generate Your First Article Free" target="signup" location="article_how" />
          </div>
        </div>
      </section>

      {/* ── Case study ── */}
      <section id="case-study" className="scroll-mt-20 bg-gray-900 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="The case study" title={`${ARTICLES} Articles. ${evidence.totals.clicks} Clicks. One Shopify Store.`} dark>
              A commercial kitchen parts store, publishing about 15 articles a month with EnhanceMySEO.{' '}
              {evidence.range}.
            </SectionHeading>
          </Reveal>

          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {evidence.chart.markers.map((marker, index) => (
              <li key={marker.label}>
                <Reveal delay={index * 100} className="h-full rounded-2xl border border-white/10 bg-white/5 p-6">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <p className="mt-4 text-sm font-semibold text-blue-300">{marker.label}</p>
                  <p className="mt-1 text-gray-200">{marker.detail}</p>
                </Reveal>
              </li>
            ))}
          </ol>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {evidence.lessons.map((lesson, index) => (
              <Reveal key={lesson.title} delay={index * 80} className="h-full">
                <div className="h-full rounded-2xl bg-white p-6">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Lesson {index + 1}</p>
                  <h3 className="mt-2 font-bold text-gray-900">{lesson.title}</h3>
                  <p className="mt-1.5 text-sm text-gray-600">{lesson.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <p className="mt-10 text-center text-sm text-gray-400">
            SEO compounds slowly and every store is different. Expect months, not days.{' '}
            <Link href={`/results/${CASE_STUDY_SLUG}`} className="font-semibold text-blue-300 hover:underline">
              Read the full case study
            </Link>
          </p>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Features" title="Everything an SEO Writer Would Do, Built In" />
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

          <Reveal className="mt-8">
            <Link
              href="/services/thumbnail-generation"
              className="group flex flex-col items-start justify-between gap-4 rounded-2xl bg-gradient-to-r from-gray-900 to-gray-800 p-6 text-white transition hover:shadow-xl sm:flex-row sm:items-center sm:p-8"
            >
              <span>
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">Add-on included in paid plans</span>
                <span className="mt-1 block text-xl font-bold">Every article can come with its own thumbnail</span>
                <span className="mt-1 block text-sm text-gray-300">
                  A featured image made for the topic, in your brand colours, set on the article automatically.
                </span>
              </span>
              <span className="inline-flex flex-shrink-0 items-center rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold ring-1 ring-white/20 transition group-hover:bg-white/20">
                See thumbnails
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="plans" className="scroll-mt-20 bg-gradient-to-b from-blue-50/60 to-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal event="pricing_view" params={{ page: 'article_generation' }}>
            <SectionHeading eyebrow="Plans" title="Start Free. Scale When It Works.">
              Two free articles a month to see the quality. Kickstart gives you {kickstart} a month and SEO
              Takeover {takeover}, with scheduled publishing.
            </SectionHeading>
          </Reveal>
          <div className="mt-10">
            <PlanCards recommended="seo_takeover" />
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="FAQ" title="Questions Before You Start" />
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
            <h2 className="mx-auto max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">
              Your Next Customer Could Find You Through an Article You Haven&apos;t Published Yet.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-300">
              Turn your catalog into helpful articles that link straight to what you sell.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <CtaButton label="Start With 2 Free Articles" target="signup" location="article_final_primary" />
              <CtaButton
                label="Compare Plans"
                target="plans"
                location="article_final_secondary"
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
