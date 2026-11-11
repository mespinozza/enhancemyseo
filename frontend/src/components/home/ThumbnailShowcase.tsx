import Link from 'next/link';
import { ArrowRight, Camera, Palette, ShoppingBag, CalendarClock, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { THUMBNAIL_LAYOUTS } from '@/lib/thumbnail/design';
import { CASE_STUDY_ARTICLES, IMPRESSIONS_HEADLINE } from '@/lib/thumbnail/landing';
import SampleGallery from '@/components/thumbnail/landing/SampleGallery';
import { Reveal } from '@/components/proof/ProofProvider';

const POINTS: { icon: LucideIcon; text: string }[] = [
  { icon: Camera, text: 'A photo made for each article, never the same stock image twice' },
  { icon: Palette, text: `Your title, brand colour and logo, in ${THUMBNAIL_LAYOUTS.length} proven styles` },
  { icon: ShoppingBag, text: 'Set as the Shopify featured image in one click' },
  { icon: CalendarClock, text: 'Made automatically for scheduled articles' },
];

const STATS = [
  { value: IMPRESSIONS_HEADLINE, label: 'Google impressions' },
  { value: String(CASE_STUDY_ARTICLES), label: 'Articles, each with a thumbnail' },
  { value: String(THUMBNAIL_LAYOUTS.length), label: 'Styles in your brand' },
];

/** The thumbnail generator, with the case study result it is known for. */
export default function ThumbnailShowcase() {
  return (
    <section id="thumbnails" aria-labelledby="thumbnails-heading" className="relative scroll-mt-24 py-12">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-indigo-50/60 to-white" />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:px-8">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-200">
            <TrendingUp className="h-3.5 w-3.5" />
            {IMPRESSIONS_HEADLINE} impressions for our clients
          </span>
          <h2 id="thumbnails-heading" className="mt-4 text-3xl font-bold leading-tight text-gray-900 sm:text-4xl">
            The AI thumbnail generator behind {IMPRESSIONS_HEADLINE} impressions
          </h2>
          <p className="mt-4 text-gray-600">
            A featured image decides whether your article gets the click in Google, Discover and social feeds.
            Every article in our case study went out with a thumbnail made in this tool, and together they have
            earned {IMPRESSIONS_HEADLINE} Google impressions.
          </p>

          <ul className="mt-6 space-y-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-gray-700">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-7 grid grid-cols-3 divide-x divide-gray-200 rounded-xl bg-white/80 py-3 shadow-sm ring-1 ring-gray-200">
            {STATS.map((stat) => (
              <div key={stat.label} className="px-3 text-center">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-xl font-bold text-gray-900 sm:text-2xl">{stat.value}</dd>
                <dd className="mt-0.5 text-[11px] leading-tight text-gray-500 sm:text-xs">{stat.label}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link
              href="/services/thumbnail-generation"
              className="inline-flex items-center whitespace-nowrap rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
            >
              See the thumbnail generator
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <p className="text-sm text-gray-500">Included with Kickstart and SEO Takeover.</p>
          </div>
        </div>

        <Reveal>
          <SampleGallery className="grid grid-cols-2 gap-3 sm:gap-4" />
          <p className="mt-3 text-center text-xs text-gray-500">Example thumbnails. Real ones use an AI photo made for each article.</p>
        </Reveal>
      </div>
    </section>
  );
}
