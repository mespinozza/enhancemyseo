import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Eye,
  ExternalLink,
  FileText,
  MousePointerClick,
  Search,
} from 'lucide-react';
import MetricStat from '@/components/results/MetricStat';
import ScreenshotGallery from '@/components/results/ScreenshotGallery';
import VerifiedBadge from '@/components/results/VerifiedBadge';
import { getCaseStudyBySlug } from '@/lib/results/server';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  try {
    const study = await getCaseStudyBySlug(slug);
    if (!study || !study.published) return { title: 'Case study | EnhanceMySEO' };

    return {
      title: `${study.title} | EnhanceMySEO`,
      description: study.summary,
      openGraph: {
        title: study.title,
        description: study.summary,
        type: 'article',
        images: study.screenshots[0] ? [{ url: study.screenshots[0].url }] : undefined,
      },
      twitter: {
        card: 'summary_large_image',
        title: study.title,
        description: study.summary,
      },
    };
  } catch {
    return { title: 'Case study | EnhanceMySEO' };
  }
}

export default async function CaseStudyPage({ params }: Props) {
  const { slug } = await params;
  const study = await getCaseStudyBySlug(slug);

  // An unpublished study is treated as missing so a shared preview link cannot leak a
  // draft that has not been approved for publication.
  if (!study || !study.published) notFound();

  const { metrics } = study;
  const published = study.publishedAt ? new Date(study.publishedAt) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="relative overflow-hidden bg-gray-900 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(110% 70% at 50% -10%, rgba(96, 165, 250, 0.28), rgba(96, 165, 250, 0) 70%)',
          }}
        />

        <div className="relative z-10 mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <Link
            href="/results"
            className="inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            All results
          </Link>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm">{study.storeName}</span>
            {study.industry && (
              <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-gray-300">
                {study.industry}
              </span>
            )}
            {study.verified && <VerifiedBadge tone="dark" />}
          </div>

          <h1 className="mt-5 text-3xl font-bold sm:text-4xl lg:text-5xl">{study.title}</h1>
          <p className="mt-5 max-w-3xl text-lg text-gray-300">{study.summary}</p>

          <div className="mt-6 flex flex-wrap items-center gap-5 text-sm text-gray-400">
            {metrics.periodLabel && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                {metrics.periodLabel}
              </span>
            )}
            {published && (
              <time dateTime={study.publishedAt ?? undefined}>
                {published.toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </time>
            )}
            {study.storeUrl && (
              <a
                href={study.storeUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 text-blue-300 hover:text-blue-200"
              >
                Visit the store
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricStat
              tone="dark"
              label="Organic clicks"
              before={metrics.clicksBefore}
              after={metrics.clicksAfter}
              icon={<MousePointerClick className="h-4 w-4" />}
            />
            <MetricStat
              tone="dark"
              label="Impressions"
              before={metrics.impressionsBefore}
              after={metrics.impressionsAfter}
              icon={<Eye className="h-4 w-4" />}
            />
            <MetricStat
              tone="dark"
              label="Articles published"
              before={null}
              after={metrics.articlesPublished}
              icon={<FileText className="h-4 w-4" />}
            />
            <MetricStat
              tone="dark"
              label="Keywords on page one"
              before={null}
              after={metrics.keywordsOnPageOne}
              icon={<Search className="h-4 w-4" />}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-14 px-4 py-14 sm:px-6 lg:px-8">
        {study.quote && (
          <blockquote className="rounded-2xl border-l-4 border-blue-600 bg-white p-8 shadow-sm">
            <p className="text-xl leading-relaxed text-gray-800">&ldquo;{study.quote}&rdquo;</p>
            {(study.quoteAuthor || study.quoteRole) && (
              <footer className="mt-5 text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{study.quoteAuthor}</span>
                {study.quoteAuthor && study.quoteRole && ' — '}
                {study.quoteRole}
              </footer>
            )}
          </blockquote>
        )}

        {study.body && (
          <article
            // .case-study-body is defined in globals.css. Tailwind's `prose` classes are
            // inert in this project: @tailwindcss/typography is not installed.
            className="case-study-body rounded-2xl bg-white p-8 shadow-sm"
            // Case study bodies are written by an admin through the editor, the same
            // trust model the blog posts use.
            dangerouslySetInnerHTML={{ __html: study.body }}
          />
        )}

        {study.screenshots.length > 0 && (
          <section>
            <h2 className="mb-2 text-2xl font-bold text-gray-900">The evidence</h2>
            <p className="mb-6 text-gray-600">
              Straight from {study.storeName}&apos;s Google Search Console. Click any image to see
              it full size.
            </p>
            <ScreenshotGallery shots={study.screenshots} />
          </section>
        )}

        <section className="relative overflow-hidden rounded-3xl bg-gray-900 p-8 text-center text-white sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(110% 75% at 50% -15%, rgba(96, 165, 250, 0.28), rgba(96, 165, 250, 0) 70%)',
            }}
          />
          <div className="relative z-10">
            <h2 className="text-2xl font-bold sm:text-3xl">Want numbers like these?</h2>
            <p className="mx-auto mt-3 max-w-xl text-gray-300">
              {study.storeName} used the same article generation and automation tools that are
              available on every plan.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-400 px-6 py-3 font-medium text-white shadow-lg transition-all hover:from-blue-700 hover:to-blue-500"
              >
                See the plans
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/results"
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-6 py-3 font-medium text-white transition-colors hover:bg-white/20"
              >
                More results
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
