import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, FileText, MousePointerClick, Store } from 'lucide-react';
import CaseStudyCard from '@/components/results/CaseStudyCard';
import SubmitResultsBanner from '@/components/results/SubmitResultsBanner';
import { listPublishedCaseStudies } from '@/lib/results/server';
import { aggregateTotals, formatCompact } from '@/lib/results/types';

// Rendered per request rather than prerendered: case studies are edited from the admin
// UI and should appear the moment they are published, and a build-time fetch would
// also make the build depend on Firebase credentials.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Customer results | EnhanceMySEO',
  description:
    'Real Search Console numbers from stores using EnhanceMySEO: organic clicks, impressions and page one rankings, with screenshots.',
  openGraph: {
    title: 'Customer results | EnhanceMySEO',
    description:
      'Real Search Console numbers from stores using EnhanceMySEO, with screenshots.',
    type: 'website',
  },
};

function Headline({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 text-center">
      <div className="mb-2 flex justify-center text-blue-300">{icon}</div>
      <div className="text-3xl font-bold tabular-nums text-white">{value}</div>
      <div className="mt-1 text-sm text-gray-400">{label}</div>
    </div>
  );
}

export default async function ResultsPage() {
  let studies: Awaited<ReturnType<typeof listPublishedCaseStudies>> = [];
  let loadFailed = false;

  try {
    studies = await listPublishedCaseStudies();
  } catch (error) {
    // A Firestore outage should not take the whole marketing page down with it.
    console.error('Failed to load case studies:', error);
    loadFailed = true;
  }

  const totals = aggregateTotals(studies);

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="relative overflow-hidden bg-gray-900 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(110% 70% at 50% -10%, rgba(96, 165, 250, 0.30), rgba(96, 165, 250, 0) 70%), ' +
              'radial-gradient(70% 60% at 90% 110%, rgba(37, 99, 235, 0.20), rgba(37, 99, 235, 0) 70%)',
          }}
        />

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur-sm">
              <BarChart3 className="h-4 w-4 text-blue-300" />
              Customer results
            </span>
            <h1 className="mt-6 text-4xl font-bold sm:text-5xl">
              Real stores. Real Search Console numbers.
            </h1>
            <p className="mt-5 text-lg text-gray-300">
              Every case study below comes from a store using our tools, with the screenshots
              to back it up. No projections, no estimates.
            </p>
          </div>

          {studies.length > 0 && (
            <div className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
              <Headline
                icon={<MousePointerClick className="h-5 w-5" />}
                value={formatCompact(totals.clicks)}
                label="Organic clicks"
              />
              <Headline
                icon={<BarChart3 className="h-5 w-5" />}
                value={formatCompact(totals.impressions)}
                label="Impressions"
              />
              <Headline
                icon={<FileText className="h-5 w-5" />}
                value={formatCompact(totals.articles)}
                label="Articles published"
              />
              <Headline
                icon={<Store className="h-5 w-5" />}
                value={totals.stores.toLocaleString()}
                label={totals.stores === 1 ? 'Store' : 'Stores'}
              />
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-16 px-4 py-16 sm:px-6 lg:px-8">
        {loadFailed ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
            We could not load the case studies just now. Please try again shortly.
          </p>
        ) : studies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
            <h2 className="text-xl font-semibold text-gray-900">The first case study is coming</h2>
            <p className="mx-auto mt-3 max-w-md text-gray-600">
              We are collecting Search Console data from stores using the tools. If that is you,
              send your numbers over using the form below.
            </p>
            <Link
              href="/pricing"
              className="mt-6 inline-flex rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
            >
              See the plans
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {studies.map((study) => (
              <CaseStudyCard key={study.id} study={study} />
            ))}
          </div>
        )}

        <SubmitResultsBanner />
      </div>
    </div>
  );
}
