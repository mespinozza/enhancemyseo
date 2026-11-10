import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  BadgeCheck,
  Bot,
  Check,
  ChevronDown,
  Compass,
  Eye,
  FileText,
  ImageIcon,
  LayoutGrid,
  MousePointerClick,
  Palette,
  Pencil,
  Share2,
  ShoppingBag,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EVIDENCE } from '@/lib/proof/content';
import { USAGE_LIMITS } from '@/lib/usage-limits';
import { THUMBNAIL_LAYOUTS } from '@/lib/thumbnail/design';
import {
  CASE_STUDY_SAMPLES,
  FAQS,
  FEATURES,
  STEPS,
  STYLE_SAMPLE_TITLE,
  WHY_POINTS,
} from '@/lib/thumbnail/landing';
import { CtaButton, Reveal } from '@/components/proof/ProofProvider';
import PlanCards from '@/components/proof/PlanCards';
import ThumbnailCanvas from '@/components/thumbnail/landing/ThumbnailCanvas';
import ThumbnailPlayground from '@/components/thumbnail/landing/ThumbnailPlayground';
import LandingView from '@/components/thumbnail/landing/LandingView';

const PATH = '/services/thumbnail-generation';
const [CASE_STUDY_SLUG] = Object.keys(EVIDENCE);
const evidence = EVIDENCE[CASE_STUDY_SLUG];
const ARTICLES = 250;

const TITLE = 'AI Blog Thumbnail Generator for Featured Images | EnhanceMySEO';
const DESCRIPTION = `Create on-brand blog thumbnails and featured images with AI: a photo made for each topic, your title, colours and logo, pushed to Shopify in one click. The format behind ${evidence.totals.impressions} Google impressions.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'AI thumbnail generator',
    'blog thumbnail generator',
    'featured image generator',
    'blog featured image',
    'Shopify blog images',
    'AI blog images',
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: 'AI Blog Thumbnails That Get Your Articles Seen | EnhanceMySEO',
    description: DESCRIPTION,
    url: PATH,
    type: 'website',
    images: [{ url: '/thumbnails/og-thumbnail-generation.jpg', width: 1600, height: 900, alt: 'A blog thumbnail designed by EnhanceMySEO' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Blog Thumbnails That Get Your Articles Seen | EnhanceMySEO',
    description: DESCRIPTION,
    images: ['/thumbnails/og-thumbnail-generation.jpg'],
  },
};

const WHY_ICONS: Record<(typeof WHY_POINTS)[number]['icon'], LucideIcon> = {
  discover: Compass,
  image: ImageIcon,
  share: Share2,
  brand: BadgeCheck,
};

const FEATURE_ICONS: Record<(typeof FEATURES)[number]['icon'], LucideIcon> = {
  sparkles: Sparkles,
  palette: Palette,
  layout: LayoutGrid,
  pencil: Pencil,
  shopify: ShoppingBag,
  bot: Bot,
};

function structuredData() {
  const site = process.env.NEXT_PUBLIC_SITE_URL || 'https://enhancemyseo.com';
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'EnhanceMySEO Thumbnail Generator',
      applicationCategory: 'DesignApplication',
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
        { '@type': 'ListItem', position: 2, name: 'Thumbnail Generation', item: `${site}${PATH}` },
      ],
    },
  ];
}

function SectionHeading({
  eyebrow,
  title,
  children,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className={`text-sm font-semibold uppercase tracking-wider ${dark ? 'text-blue-300' : 'text-blue-600'}`}>{eyebrow}</p>
      <h2 className={`mt-2 text-3xl font-bold leading-tight sm:text-4xl ${dark ? 'text-white' : 'text-gray-900'}`}>{title}</h2>
      {children && <p className={`mt-4 text-lg ${dark ? 'text-gray-300' : 'text-gray-600'}`}>{children}</p>}
    </div>
  );
}

export default function ThumbnailGenerationPage() {
  const stats: { icon: LucideIcon; value: string; label: string }[] = [
    { icon: Eye, value: evidence.totals.impressions, label: 'Google impressions' },
    { icon: MousePointerClick, value: evidence.totals.clicks, label: 'Organic clicks' },
    { icon: FileText, value: String(ARTICLES), label: 'Articles, each with a thumbnail' },
    { icon: TrendingUp, value: evidence.totals.position, label: 'Average position' },
  ];
  const kickstart = USAGE_LIMITS.kickstart.thumbnails;
  const takeover = USAGE_LIMITS.seo_takeover.thumbnails;

  return (
    <>
      <LandingView name="thumbnail_generation" />
      {structuredData().map((data) => (
        <script key={data['@type']} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      ))}

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-blue-50/70 to-white" />
        <div
          aria-hidden
          className="absolute -right-40 -top-40 -z-10 h-[32rem] w-[32rem] rounded-full bg-blue-200/40 blur-3xl"
        />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:px-8 lg:pb-24 lg:pt-20">
          <div className="max-w-xl">
            <a
              href="#case-study"
              className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:ring-blue-300 sm:text-sm"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-green-700">
                <TrendingUp className="h-3 w-3" />
              </span>
              The format behind {evidence.totals.impressions} Google impressions
            </a>
            <h1 className="mt-5 text-[2.1rem] font-bold leading-[1.12] text-gray-900 sm:text-5xl sm:leading-[1.08]">
              AI Blog Thumbnails That Get Your Articles{' '}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">Seen</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 sm:text-xl">
              Every article gets a featured image made for its topic, with your title, colours and
              logo. It&apos;s the same tool that designed the thumbnails for all {ARTICLES} articles in
              our Shopify case study.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CtaButton label="Create Your First Thumbnail" target="signup" location="thumb_hero_primary" />
              <CtaButton label="See the Case Study" target="case-study" location="thumb_hero_secondary" tone="secondary" />
            </div>

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500">
              {['1600 × 900, Discover-ready', 'Pushes to Shopify', 'Edit anything'].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-green-500" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <ThumbnailPlayground />
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

      {/* ── Case study ── */}
      <section id="case-study" className="scroll-mt-20 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading
              eyebrow="The case study"
              title={`${ARTICLES} Articles. ${ARTICLES} Thumbnails. ${evidence.totals.impressions} Impressions.`}
            >
              A commercial kitchen parts store on {evidence.platform}. Every article we published for
              them went out with a thumbnail designed in EnhanceMySEO, in the layout now called the
              Parts Plus Format. {evidence.range}.
            </SectionHeading>
          </Reveal>

          <Reveal className="mt-12 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-center" event="proof_view" params={{ part: 'thumb_chart' }}>
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
              <h3 className="text-2xl font-bold text-gray-900">One look, on every post</h3>
              <p className="mt-3 text-gray-600">
                The same torn brand-colour panel, bold title and logo on every article. Across the
                blog index, in Google and in shared links, readers learned to spot the store&apos;s
                articles at a glance.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-gray-700">
                {[
                  `${evidence.totals.clicks} organic clicks and a ${evidence.totals.ctr} average click-through rate`,
                  '150 keywords on page one of Google',
                  'Thumbnails made in seconds, not by a designer',
                ].map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" strokeWidth={2.5} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                href={`/results/${CASE_STUDY_SLUG}`}
                className="mt-6 inline-flex items-center text-sm font-semibold text-blue-600 hover:underline"
              >
                Read the full case study
              </Link>
            </div>
          </Reveal>

          <Reveal className="mt-14">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CASE_STUDY_SAMPLES.map((sample) => (
                <article key={sample.title} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-1 hover:shadow-lg">
                  <ThumbnailCanvas
                    title={sample.title}
                    layout={sample.layout}
                    color={sample.color}
                    brand={sample.brand}
                    seed={sample.seed}
                    label={`Example thumbnail: ${sample.title}`}
                  />
                  <div className="p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Blog · Guides</p>
                    <p className="mt-1 text-sm font-semibold leading-snug text-gray-900">{sample.title}</p>
                  </div>
                </article>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-gray-500">
              Examples in the Parts Plus Format. The client&apos;s own titles are kept private, and
              their thumbnails use an AI photo made for each article.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── Why ── */}
      <section className="bg-gradient-to-b from-white to-blue-50/60 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Why it matters" title="An Article Without an Image Is Easy to Scroll Past">
              The featured image is the first thing people see in Google Discover, image search, your
              blog index and every shared link.
            </SectionHeading>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_POINTS.map((point, index) => {
              const Icon = WHY_ICONS[point.icon];
              return (
                <Reveal key={point.title} delay={index * 80} className="h-full">
                  <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 font-semibold text-gray-900">{point.title}</h3>
                    <p className="mt-2 text-sm text-gray-600">{point.body}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Styles ── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Styles" title="Four Layouts. All Yours.">
              Pick one for the whole blog or mix them per article. Every layout uses your colour and logo.
            </SectionHeading>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {THUMBNAIL_LAYOUTS.map((option, index) => (
              <Reveal key={option.value} delay={(index % 2) * 80}>
                <figure className="group overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 transition hover:shadow-xl">
                  <div className="overflow-hidden">
                    <ThumbnailCanvas
                      title={STYLE_SAMPLE_TITLE}
                      layout={option.value}
                      color={['#2563eb', '#f97316', '#111827', '#db2777'][index] ?? '#2563eb'}
                      brand="Your Brand"
                      seed={index + 3}
                      label={`${option.label} thumbnail style example`}
                      className="transition duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <figcaption className="flex items-center justify-between gap-3 p-5">
                    <span>
                      <span className="block font-semibold text-gray-900">{option.label}</span>
                      <span className="mt-0.5 block text-sm text-gray-600">{option.description}</span>
                    </span>
                    {option.value === 'parts-plus' && (
                      <span className="flex-shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-200">
                        Case study format
                      </span>
                    )}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="scroll-mt-20 bg-gray-900 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="How it works" title="From Article to Featured Image in Under a Minute" dark />
          </Reveal>
          <ol className="mt-12 grid gap-5 md:grid-cols-3">
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
          <div className="mt-10 flex justify-center">
            <CtaButton label="Try It on Your Next Article" target="signup" location="thumb_how" />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Features" title="Everything a Designer Would Do, Built In" />
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
          <Reveal event="pricing_view" params={{ page: 'thumbnail_generation' }}>
            <SectionHeading eyebrow="Plans" title="Thumbnails Come With Every Paid Plan">
              Kickstart includes {kickstart} thumbnail photos a month and SEO Takeover includes {takeover},
              alongside your articles. Need more? 20 extra photos are $10 and never expire.
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
            <SectionHeading eyebrow="FAQ" title="Thumbnail Questions, Answered" />
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
              Give Every Article the Thumbnail It Deserves.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-300">
              The same format behind {evidence.totals.impressions} impressions, on your blog, in your
              colours, without opening a design tool.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <CtaButton label="Create Your First Thumbnail" target="signup" location="thumb_final_primary" />
              <CtaButton
                label="Compare Plans"
                target="plans"
                location="thumb_final_secondary"
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
