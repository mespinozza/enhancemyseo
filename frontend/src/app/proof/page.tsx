import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import {
  BarChart3,
  Boxes,
  Check,
  Clock,
  Eye,
  FileText,
  Info,
  MousePointerClick,
  Search,
  Swords,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { listPublishedCaseStudies } from '@/lib/results/server';
import { engagementLabel, formatCompact, isActiveClient, type CaseStudy } from '@/lib/results/types';
import {
  DEFAULT_VARIANTS,
  VARIANT_HEADER,
  decodeVariants,
  parseAngle,
  type Angle,
  type Variants,
} from '@/lib/proof/experiments';
import { EVIDENCE, FREE_CTA, PROBLEMS, heroCopy, type Evidence } from '@/lib/proof/content';
import { CtaButton, ProofProvider, Reveal } from '@/components/proof/ProofProvider';
import Demo from '@/components/proof/Demo';
import Faq from '@/components/proof/Faq';
import PlanCards from '@/components/proof/PlanCards';
import StickyCta from '@/components/proof/StickyCta';
import ScreenshotGallery from '@/components/results/ScreenshotGallery';
import VerifiedBadge from '@/components/results/VerifiedBadge';
import ActiveClientBadge from '@/components/results/ActiveClientBadge';

// Per request: the case study comes from Firestore and the variant from the middleware.
export const dynamic = 'force-dynamic';

const TITLE = 'Real Shopify SEO Results From AI Blog Content | EnhanceMySEO';
const DESCRIPTION =
  'See the actual Google Search Console numbers a Shopify store earned by turning its products into SEO articles with EnhanceMySEO — then try it with 2 free articles.';

// One canonical URL for every ad variant: ?angle=, UTM tags and test arms all collapse to /proof.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/proof' },
  openGraph: {
    title: 'Real Store. Real Results. | EnhanceMySEO',
    description: DESCRIPTION,
    url: '/proof',
    type: 'website',
    images: [{ url: '/case-studies/malachy-clicks-impressions.png', width: 872, height: 363 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Real Store. Real Results. | EnhanceMySEO',
    description: DESCRIPTION,
    images: ['/case-studies/malachy-clicks-impressions.png'],
  },
};

const PROBLEM_ICONS: Record<(typeof PROBLEMS)[number]['icon'], LucideIcon> = {
  swords: Swords,
  wallet: Wallet,
  clock: Clock,
  boxes: Boxes,
};

const RECOMMENDED: Record<Angle, 'kickstart' | 'seo_takeover'> = {
  traffic: 'seo_takeover',
  automation: 'seo_takeover',
  cost: 'kickstart',
  'case-study': 'seo_takeover',
};

/** The study with hand-checked evidence wins; otherwise the featured-first ordering does. */
async function loadProof(): Promise<{ study: CaseStudy | null; evidence: Evidence | null }> {
  try {
    const studies = await listPublishedCaseStudies();
    const study = studies.find((s) => EVIDENCE[s.slug]) ?? studies[0] ?? null;
    return { study, evidence: study ? EVIDENCE[study.slug] ?? null : null };
  } catch (error) {
    // The page still sells without the live record; the evidence is static.
    console.error('Proof page: could not load case studies:', error);
    const [slug] = Object.keys(EVIDENCE);
    return { study: null, evidence: EVIDENCE[slug] ?? null };
  }
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && (
        <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">{eyebrow}</p>
      )}
      <h2 className="mt-2 text-3xl font-bold leading-tight text-gray-900 sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-lg text-gray-600">{children}</p>}
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 sm:text-sm">
        <Icon className="h-4 w-4 text-blue-600" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums text-gray-900 sm:text-3xl">{value}</div>
    </div>
  );
}

function ScreenshotFrame({
  url,
  alt,
  width,
  height,
  priority,
  children,
}: {
  url: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl shadow-blue-900/10">
      <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
        <span className="ml-3 truncate text-xs text-gray-400">search.google.com/search-console</span>
      </div>
      <div className="relative">
        <Image
          src={url}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes="(min-width: 1024px) 640px, 100vw"
          className="h-auto w-full"
        />
        {children}
      </div>
    </div>
  );
}

export default async function ProofPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const angle = parseAngle(typeof query.angle === 'string' ? query.angle : null);
  const variants: Variants = {
    ...DEFAULT_VARIANTS,
    ...decodeVariants((await headers()).get(VARIANT_HEADER)),
  };

  const { study, evidence } = await loadProof();
  const metrics = study?.metrics;
  const storeName = study?.storeName ?? 'our store';

  // Search Console's own tiles beat the rounded case study figures when we have them.
  const clicks = evidence?.totals.clicks ?? (metrics?.clicksAfter ? formatCompact(metrics.clicksAfter) : null);
  const impressions =
    evidence?.totals.impressions ?? (metrics?.impressionsAfter ? formatCompact(metrics.impressionsAfter) : null);
  const articles = metrics?.articlesPublished ? String(metrics.articlesPublished) : null;
  const pageOne = metrics?.keywordsOnPageOne ? String(metrics.keywordsOnPageOne) : null;

  const hero = heroCopy(angle, variants, {
    clicks: clicks ?? 'Thousands of',
    impressions: impressions ?? 'Millions of',
    articles: articles ?? 'Hundreds of',
    store: storeName,
  });
  const freeCta = FREE_CTA[variants.cta];
  // When the angle's recommended CTA already is the free signup, the second button explains.
  const secondary =
    hero.primary.target === 'signup'
      ? { label: 'See How It Works', target: 'how' as const }
      : { label: freeCta, target: 'signup' as const };

  const featuredShot = evidence ? (hero.featured === 'pages' ? evidence.pages : evidence.chart) : null;
  const engagement = study ? engagementLabel(study) : null;
  const topTotal = evidence?.topPages.reduce((sum, page) => sum + page.clicks, 0) ?? 0;

  const heroStats = [
    clicks && { icon: MousePointerClick, value: clicks, label: 'Organic clicks' },
    impressions && { icon: Eye, value: impressions, label: 'Impressions' },
    articles && { icon: FileText, value: articles, label: 'Articles published' },
    pageOne && { icon: Search, value: pageOne, label: 'Keywords on page one' },
  ].filter(Boolean) as { icon: LucideIcon; value: string; label: string }[];

  return (
    <ProofProvider angle={angle} variants={variants}>
      {/* Logo only: an ad visitor's choices are this page's CTAs, not the site menu. */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={500} height={500} className="h-9 w-9" priority />
            <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-lg font-semibold text-transparent">
              EnhanceMySEO
            </span>
          </Link>
          <CtaButton
            label="Try it free"
            target="signup"
            location="header"
            arrow={false}
            className="!px-4 !py-2 !text-sm"
          />
        </div>
      </header>

      <main>
        {/* ── 1. Hero ── */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-blue-50/80 to-white" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-2 lg:gap-12 lg:px-8 lg:pb-20 lg:pt-16">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3.5 py-1.5 text-xs font-semibold text-blue-700">
                <BarChart3 className="h-3.5 w-3.5" />
                {hero.eyebrow}
              </span>
              <h1 className="mt-5 text-[2rem] font-bold leading-[1.15] text-gray-900 sm:text-5xl sm:leading-[1.1]">
                {hero.headline}
              </h1>
              <p className="mt-5 text-lg text-gray-600 sm:text-xl">{hero.subheadline}</p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <CtaButton label={hero.primary.label} target={hero.primary.target} location="hero_primary" />
                <CtaButton
                  label={secondary.label}
                  target={secondary.target}
                  location="hero_secondary"
                  tone="secondary"
                />
              </div>

              <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500">
                {['2 free articles a month', 'No card needed', 'Connects to Shopify'].map((item) => (
                  <li key={item} className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-green-500" strokeWidth={2.5} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative">
              <p className="mb-3 text-center text-xs font-medium uppercase tracking-[0.2em] text-gray-400 lg:text-left">
                Real Store. Real Results.
              </p>
              {variants.visual === 'screenshot' && featuredShot ? (
                <ScreenshotFrame {...featuredShot} priority>
                  {clicks && impressions && (
                    <div className="absolute -bottom-px left-3 right-3 hidden translate-y-1/2 justify-center gap-3 sm:flex">
                      {[
                        { label: 'Organic clicks', value: clicks },
                        { label: 'Impressions', value: impressions },
                      ].map((chip) => (
                        <span
                          key={chip.label}
                          className="rounded-xl bg-white px-4 py-2 text-center shadow-lg ring-1 ring-gray-200"
                        >
                          <span className="block text-lg font-bold tabular-nums text-gray-900">{chip.value}</span>
                          <span className="block text-[11px] text-gray-500">{chip.label}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </ScreenshotFrame>
              ) : (
                <div className="rounded-2xl bg-gray-900 p-5 text-white shadow-xl shadow-blue-900/20 sm:p-7">
                  <div className="flex items-center justify-between text-sm text-gray-400">
                    <span>{storeName}</span>
                    {evidence && <span>{evidence.range}</span>}
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {heroStats.map(({ icon: Icon, value, label }) => (
                      <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                        <Icon className="h-4 w-4 text-blue-300" />
                        <div className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">{value}</div>
                        <div className="mt-0.5 text-xs text-gray-400">{label}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-gray-500">From Google Search Console.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── 2. Proof ── */}
        {evidence && (
          <section id="proof" className="scroll-mt-20 bg-white py-16 sm:py-24">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading eyebrow="The proof" title="These Aren't Predictions. They're Actual Search Results.">
                  Straight from the Google Search Console of {storeName}, a {evidence.platform} store
                  whose blog is written with EnhanceMySEO. {evidence.range}.
                </SectionHeading>
              </Reveal>

              <Reveal className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" event="proof_view" params={{ part: 'totals' }}>
                <Stat icon={MousePointerClick} value={evidence.totals.clicks} label="Total clicks" />
                <Stat icon={Eye} value={evidence.totals.impressions} label="Total impressions" />
                <Stat icon={TrendingUp} value={evidence.totals.position} label="Average position" />
                <Stat icon={Search} value={pageOne ?? evidence.totals.ctr} label={pageOne ? 'Keywords on page one' : 'Average CTR'} />
              </Reveal>

              <Reveal className="mt-10" event="proof_view" params={{ part: 'chart' }}>
                <ScreenshotFrame {...evidence.chart}>
                  {evidence.chart.markers.map((marker, index) => (
                    <span
                      key={marker.label}
                      className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white shadow-md ring-2 ring-white sm:h-7 sm:w-7"
                      style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                      aria-hidden
                    >
                      {index + 1}
                    </span>
                  ))}
                </ScreenshotFrame>
                <ol className="mt-5 grid gap-3 sm:grid-cols-3">
                  {evidence.chart.markers.map((marker, index) => (
                    <li key={marker.label} className="flex gap-3 rounded-xl bg-gray-50 p-4">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <span className="text-sm text-gray-700">
                        <span className="font-semibold text-gray-900">{marker.label}. </span>
                        {marker.detail}
                      </span>
                    </li>
                  ))}
                </ol>
              </Reveal>

              <Reveal className="mt-14 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start" event="proof_view" params={{ part: 'articles' }}>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">The articles doing the work</h3>
                  <p className="mt-3 text-gray-600">
                    The ten blog posts with the most clicks, from the Search Console pages report.
                    They’re built around the equipment brands the store sells parts for, and rank
                    for the replacement-part searches buyers make. Titles are hidden at the
                    store’s request.
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-blue-50 p-4">
                      <div className="text-2xl font-bold tabular-nums text-blue-700">
                        {formatCompact(topTotal)}
                      </div>
                      <div className="mt-0.5 text-xs text-blue-900/70">clicks from the top 10 articles</div>
                    </div>
                    <div className="rounded-xl bg-blue-50 p-4">
                      <div className="text-2xl font-bold tabular-nums text-blue-700">
                        {evidence.totals.position}
                      </div>
                      <div className="mt-0.5 text-xs text-blue-900/70">average Google position, all queries</div>
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium">Blog article</th>
                        <th className="px-4 py-2.5 text-right font-medium">Clicks</th>
                        <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Impressions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {evidence.topPages.map((page, index) => (
                        <tr key={`${page.path}-${index}`}>
                          <td className="max-w-0 truncate px-4 py-2.5 font-mono text-xs text-gray-600">
                            {page.path}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-blue-700">
                            {page.clicks.toLocaleString()}
                          </td>
                          <td className="hidden px-4 py-2.5 text-right tabular-nums text-purple-700 sm:table-cell">
                            {page.impressions.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Reveal>

              {study && study.screenshots.length > 0 && (
                <Reveal className="mt-12">
                  <p className="mb-4 text-sm font-medium text-gray-500">
                    The original screenshots — tap to view full size.
                  </p>
                  <ScreenshotGallery shots={study.screenshots} />
                </Reveal>
              )}

              <p className="mx-auto mt-10 flex max-w-3xl gap-2.5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-500">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                These results come from one specific Shopify store and its Google Search Console
                account, over the dates shown. Organic traffic depends on your niche,
                competition, products and how consistently you publish. They are not a guarantee
                of the results you will get.
              </p>
            </div>
          </section>
        )}

        {/* ── 3. Problem ── */}
        <section className="bg-gradient-to-b from-white to-blue-50/60 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeading eyebrow="The problem" title="Your Products Could Be Getting Discovered on Google. But Are They?" />
            </Reveal>
            <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {PROBLEMS.map((problem, index) => {
                const Icon = PROBLEM_ICONS[problem.icon];
                return (
                  <Reveal key={problem.title} delay={index * 80} className="h-full">
                    <div className="h-full rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-6">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
                        <Icon className="h-5 w-5" />
                      </span>
                      <h3 className="mt-4 text-[15px] font-semibold leading-snug text-gray-900 sm:text-base">
                        {problem.title}
                      </h3>
                      <p className="mt-2 hidden text-sm text-gray-600 sm:block">{problem.body}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
            <Reveal>
              <p className="mx-auto mt-12 max-w-2xl text-center text-2xl font-semibold leading-snug text-gray-900 sm:text-3xl">
                What if your existing products could become the{' '}
                <span className="text-blue-600">foundation of your content strategy?</span>
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── 4. How it works ── */}
        <section id="how-it-works" className="scroll-mt-20 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeading eyebrow="How it works" title="From Product to Published SEO Content in Minutes." />
            </Reveal>
            <Reveal className="mt-10">
              <Demo />
            </Reveal>
            <div className="mt-10 flex justify-center">
              <CtaButton label="Generate Your First Article Free" target="signup" location="how_it_works" />
            </div>
          </div>
        </section>

        {/* ── 5. Case study ── */}
        {evidence && (
          <section id="case-study" className="scroll-mt-20 bg-white py-16 sm:py-24">
            <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
              <Reveal>
                <SectionHeading eyebrow="The case study" title="Here's What Happened When We Started Publishing Consistently." />
                {study && (
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
                    <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700">{study.storeName}</span>
                    {study.industry && (
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">{study.industry}</span>
                    )}
                    {engagement && (
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">{engagement}</span>
                    )}
                    {isActiveClient(study) && <ActiveClientBadge />}
                    {study.verified && <VerifiedBadge />}
                  </div>
                )}
              </Reveal>

              <ol className="relative mt-12 space-y-8 border-l-2 border-blue-100 pl-6 sm:ml-4 sm:pl-10">
                {evidence.timeline.map((entry) => (
                  <li key={entry.title} className="relative">
                    <Reveal>
                      <span className="absolute -left-[33px] top-1 h-4 w-4 rounded-full border-4 border-white bg-blue-600 shadow sm:-left-[49px]" />
                      <p className="text-sm font-semibold text-blue-600">{entry.when}</p>
                      <h3 className="mt-1 text-lg font-bold text-gray-900">{entry.title}</h3>
                      <p className="mt-1.5 text-gray-600">{entry.body}</p>
                    </Reveal>
                  </li>
                ))}
              </ol>

              <div className="mt-14 grid gap-4 sm:grid-cols-3">
                {evidence.lessons.map((lesson, index) => (
                  <Reveal key={lesson.title} delay={index * 80} className="h-full">
                    <div className="h-full rounded-2xl bg-blue-50/70 p-5 ring-1 ring-inset ring-blue-100">
                      <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Lesson {index + 1}</p>
                      <h3 className="mt-2 font-bold text-gray-900">{lesson.title}</h3>
                      <p className="mt-1.5 text-sm text-gray-600">{lesson.body}</p>
                    </div>
                  </Reveal>
                ))}
              </div>

              {study?.quote && (
                <blockquote className="mt-12 rounded-2xl border-l-4 border-blue-600 bg-gray-50 p-6 sm:p-8">
                  <p className="text-lg leading-relaxed text-gray-800">&ldquo;{study.quote}&rdquo;</p>
                  {(study.quoteAuthor || study.quoteRole) && (
                    <footer className="mt-4 text-sm text-gray-600">
                      <span className="font-semibold text-gray-900">{study.quoteAuthor}</span>
                      {study.quoteAuthor && study.quoteRole && ' — '}
                      {study.quoteRole}
                    </footer>
                  )}
                </blockquote>
              )}

              <p className="mt-10 text-center text-sm text-gray-500">
                SEO compounds slowly and every store is different. Expect months, not days.
                {study && (
                  <>
                    {' '}
                    <Link href={`/results/${study.slug}`} className="font-medium text-blue-600 hover:underline">
                      Read the full case study
                    </Link>
                  </>
                )}
              </p>
            </div>
          </section>
        )}

        {/* ── 6. Plans ── */}
        <section id="plans" className="scroll-mt-20 bg-gradient-to-b from-blue-50/60 to-white py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Reveal event="pricing_view">
              <SectionHeading eyebrow="Plans" title="Choose How Fast You Want to Scale Your Content.">
                Start with two free articles. Upgrade when you want to publish more, or hand it
                all to us.
              </SectionHeading>
            </Reveal>
            <div className="mt-10">
              <PlanCards recommended={RECOMMENDED[angle]} />
            </div>
          </div>
        </section>

        {/* ── 7. FAQ ── */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <Reveal>
              <SectionHeading eyebrow="FAQ" title="Questions Before You Start" />
            </Reveal>
            <div className="mt-10">
              <Faq />
            </div>
          </div>
        </section>

        {/* ── 8. Final CTA ── */}
        <section className="px-4 pb-16 sm:px-6 sm:pb-24 lg:px-8">
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gray-900 px-6 py-14 text-center text-white sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(110% 75% at 50% -15%, rgba(96, 165, 250, 0.3), rgba(96, 165, 250, 0) 70%)',
              }}
            />
            <div className="relative">
              <h2 className="mx-auto max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">
                Your Next Organic Visitor Could Discover You Through an Article You Haven&apos;t Published Yet.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-300">
                Stop leaving valuable product knowledge unused. Turn your Shopify catalog into
                helpful content that gives customers more opportunities to discover your store.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <CtaButton label="Start Creating Articles Free" target="signup" location="final_primary" />
                <CtaButton
                  label="Compare All Plans"
                  target="plans"
                  location="final_secondary"
                  tone="secondary"
                  className="!bg-white/10 !text-white !ring-white/20 hover:!bg-white/20"
                />
              </div>
              <p className="mt-5 text-sm text-gray-400">Start free. Upgrade when you&apos;re ready.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100 py-8 pb-28 text-center text-xs text-gray-500 md:pb-8">
        <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link href="/privacy-policy" className="hover:text-gray-900">Privacy</Link>
          <Link href="/terms" className="hover:text-gray-900">Terms</Link>
          <Link href="/contact" className="hover:text-gray-900">Contact</Link>
        </nav>
        <p className="mt-3">© {new Date().getFullYear()} EnhanceMySEO. All rights reserved.</p>
      </footer>

      <StickyCta />
    </ProofProvider>
  );
}
