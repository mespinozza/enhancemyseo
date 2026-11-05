import type { DailyCost } from '@/lib/admin/customers';
import { money } from './format';

export default function DailyCostChart({ data }: { data: DailyCost[] }) {
  const max = Math.max(...data.map((entry) => entry.cost), 0);

  if (max === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-500">
        No AI spend recorded this month yet.
      </p>
    );
  }

  return (
    <div>
      <div className="flex h-32 items-end gap-[2px] sm:gap-1">
        {data.map((entry) => (
          <div
            key={entry.day}
            className="group relative flex h-full flex-1 items-end"
            title={`${Number(entry.day)}: ${money(entry.cost, 2)}`}
          >
            <div
              className="w-full rounded-t bg-emerald-500 transition-colors group-hover:bg-emerald-600"
              style={{ height: `${(entry.cost / max) * 100}%`, minHeight: entry.cost ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-gray-400">
        <span>1st</span>
        <span>Peak {money(max, 2)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}
