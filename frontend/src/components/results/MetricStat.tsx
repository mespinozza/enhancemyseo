import { ArrowUpRight } from 'lucide-react';
import { growthPercent } from '@/lib/results/types';

interface MetricStatProps {
  label: string;
  before: number | null;
  after: number | null;
  icon: React.ReactNode;
  tone?: 'light' | 'dark';
}

/**
 * A before/after pair. The "before" line and the growth badge each disappear on their
 * own when the number behind them is missing, so a half-filled case study degrades to a
 * plain figure instead of showing "0" or "NaN%" next to a customer's name.
 */
export default function MetricStat({ label, before, after, icon, tone = 'light' }: MetricStatProps) {
  if (after === null) return null;

  const growth = growthPercent(before, after);
  const dark = tone === 'dark';

  return (
    <div
      className={`rounded-xl border p-5 ${
        dark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white'
      }`}
    >
      <div className={`flex items-center gap-2 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
        {icon}
        {label}
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <span
          className={`text-3xl font-bold tabular-nums ${dark ? 'text-white' : 'text-gray-900'}`}
        >
          {after.toLocaleString()}
        </span>
        {growth !== null && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-sm font-semibold text-green-700">
            <ArrowUpRight className="h-3.5 w-3.5" />
            {growth.toLocaleString()}%
          </span>
        )}
      </div>

      {before !== null && (
        <p className={`mt-1 text-sm ${dark ? 'text-gray-500' : 'text-gray-500'}`}>
          up from {before.toLocaleString()}
        </p>
      )}
    </div>
  );
}
