'use client';

import { Loader2, Pencil, Play, Trash2 } from 'lucide-react';
import { describeSchedule, monthKey } from '@/lib/automation/schedule';
import type { Automation } from '@/lib/automation/types';
import { ToneBadge } from '@/components/TonePicker';
import { ContentTypeStack } from '@/components/ContentTypePicker';

export function formatWhen(value?: { toDate(): Date } | null): string {
  if (!value) return 'Never';
  try {
    return value.toDate().toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

export function usedThisMonth(automation: Automation): number {
  return automation.monthUsage?.month === monthKey() ? automation.monthUsage.count : 0;
}

interface AutomationCardProps {
  automation: Automation;
  brandName?: string;
  /** A run for this automation is queued or writing. */
  isRunning: boolean;
  /** The Run now request is in flight. */
  isStarting: boolean;
  onRunNow: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * One automation in the list. Every card has the same three rows, whatever its state:
 * title and badges with the actions beside them, the schedule, then the stats strip.
 */
export default function AutomationCard({
  automation,
  brandName,
  isRunning,
  isStarting,
  onRunNow,
  onToggle,
  onEdit,
  onDelete,
}: AutomationCardProps) {
  const used = usedThisMonth(automation);
  const cap = automation.monthlyArticleCap;
  const atCap = used >= cap;
  const summary = `${brandName || 'Brand profile missing'} · ${describeSchedule(automation.schedule)} · ${
    automation.articlesPerRun
  } article${automation.articlesPerRun === 1 ? '' : 's'} per run`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold text-gray-900">{automation.name}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                automation.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {automation.enabled ? 'On' : 'Paused'}
            </span>
            {isRunning && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                <Loader2 className="h-3 w-3 animate-spin" />
                Writing now
              </span>
            )}
            {automation.autoPushToShopify && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                Auto-push {automation.shopifyStatus}
              </span>
            )}
            <ContentTypeStack
              contentTypes={automation.contentTypes?.length ? automation.contentTypes : [automation.contentType || 'default']}
            />
            <ToneBadge tone={automation.toneOfVoice} />
          </div>

          <p className="mt-1 truncate text-sm text-gray-600" title={summary}>
            {summary}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Stays disabled for the whole run, not just the request: the request
              returns in milliseconds while the work takes minutes. */}
          <button
            onClick={onRunNow}
            disabled={isStarting || isRunning}
            title={isRunning ? 'Already running' : 'Run once now'}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStarting || isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isRunning ? 'Running' : 'Run now'}
          </button>

          <button
            onClick={onToggle}
            className={`inline-flex h-8 w-20 items-center justify-center rounded-md border text-sm font-medium ${
              automation.enabled
                ? 'border-gray-300 text-gray-700 hover:bg-gray-50'
                : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {automation.enabled ? 'Pause' : 'Turn on'}
          </button>

          <button
            onClick={onEdit}
            title="Edit"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
          >
            <Pencil className="h-4 w-4" />
          </button>

          <button
            onClick={onDelete}
            title="Delete"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-500 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 divide-x divide-gray-200 rounded-md bg-gray-50 text-sm">
        <div className="px-3 py-2">
          <dt className="text-xs text-gray-500">Topics</dt>
          <dd className="font-medium text-gray-900">{automation.topics.length}</dd>
        </div>
        <div className="px-3 py-2">
          <dt className="text-xs text-gray-500">This month</dt>
          <dd className={`font-medium ${atCap ? 'text-amber-700' : 'text-gray-900'}`}>
            {used} of {cap}
          </dd>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full ${atCap ? 'bg-amber-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, (used / Math.max(1, cap)) * 100)}%` }}
            />
          </div>
        </div>
        <div className="px-3 py-2">
          <dt className="text-xs text-gray-500">Next run</dt>
          <dd className="font-medium text-gray-900">
            {automation.enabled ? formatWhen(automation.nextRunAt) : 'Paused'}
          </dd>
        </div>
      </dl>

      {atCap && (
        <p className="mt-2 text-xs font-medium text-amber-700">
          Monthly cap reached. Runs are skipped until next month or you raise the cap.
        </p>
      )}
    </div>
  );
}
