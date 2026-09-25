import Link from 'next/link';
import { ArrowRight, CalendarRange, Eye, MousePointerClick } from 'lucide-react';
import { CaseStudy, engagementLabel, growthPercent, isActiveClient } from '@/lib/results/types';
import ActiveClientBadge from './ActiveClientBadge';
import VerifiedBadge from './VerifiedBadge';

function Delta({
  label,
  before,
  after,
  icon,
}: {
  label: string;
  before: number | null;
  after: number | null;
  icon: React.ReactNode;
}) {
  if (after === null) return null;
  const growth = growthPercent(before, after);

  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-gray-900">
        {after.toLocaleString()}
      </div>
      {growth !== null && (
        <div className="text-xs font-semibold text-green-600">+{growth.toLocaleString()}%</div>
      )}
    </div>
  );
}

export default function CaseStudyCard({ study }: { study: CaseStudy }) {
  const cover = study.screenshots[0];
  const engagement = engagementLabel(study);
  const active = isActiveClient(study);

  return (
    <Link
      href={`/results/${study.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg motion-reduce:hover:translate-y-0"
    >
      {cover && (
        <div className="relative h-44 overflow-hidden bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cover.url}
            alt={cover.caption || `${study.storeName} search performance`}
            loading="lazy"
            className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none"
          />
        </div>
      )}

      <div className="flex flex-1 flex-col p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-900">{study.storeName}</span>
          {study.industry && (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
              {study.industry}
            </span>
          )}
          {active && <ActiveClientBadge />}
          {study.verified && <VerifiedBadge />}
        </div>

        <h3 className="text-lg font-bold leading-snug text-gray-900 group-hover:text-blue-600">
          {study.title}
        </h3>

        {engagement && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-gray-500">
            <CalendarRange className="h-3.5 w-3.5" />
            {engagement}
          </p>
        )}

        <p className="mt-2 line-clamp-3 text-sm text-gray-600">{study.summary}</p>

        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-gray-100 pt-5">
          <Delta
            label="Clicks"
            before={study.metrics.clicksBefore}
            after={study.metrics.clicksAfter}
            icon={<MousePointerClick className="h-3.5 w-3.5" />}
          />
          <Delta
            label="Impressions"
            before={study.metrics.impressionsBefore}
            after={study.metrics.impressionsAfter}
            icon={<Eye className="h-3.5 w-3.5" />}
          />
        </div>

        <div className="mt-5 flex items-center gap-1 text-sm font-medium text-blue-600">
          Read the full story
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
        </div>
      </div>
    </Link>
  );
}
