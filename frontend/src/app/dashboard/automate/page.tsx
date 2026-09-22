'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  Workflow,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations, type BrandProfile } from '@/lib/firebase/firestore';
import {
  deleteAutomation,
  listAutomations,
  listRuns,
  scheduleTestRun,
  setAutomationEnabled,
} from '@/lib/firebase/automations';
import AutomationForm from '@/components/automation/AutomationForm';
import { describeSchedule, monthKey } from '@/lib/automation/schedule';
import type { Automation, AutomationRun, AutomationRunStatus } from '@/lib/automation/types';

const POLL_INTERVAL_MS = 20_000;
/** While something is mid-generation the user is watching, so refresh sooner. */
const ACTIVE_POLL_INTERVAL_MS = 5_000;

function isActive(run: AutomationRun): boolean {
  return run.status === 'running' || run.status === 'queued';
}

function formatWhen(value?: { toDate(): Date } | null): string {
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

function usedThisMonth(automation: Automation): number {
  return automation.monthUsage?.month === monthKey() ? automation.monthUsage.count : 0;
}

function StatusIcon({ status }: { status: AutomationRunStatus }) {
  if (status === 'succeeded') return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-600" />;
  if (status === 'skipped') return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
  return <Clock className="h-4 w-4 text-gray-400" />;
}

function elapsedSince(value?: { toDate(): Date } | null): string {
  if (!value) return '';
  try {
    const minutes = Math.floor((Date.now() - value.toDate().getTime()) / 60_000);
    if (minutes < 1) return 'just started';
    return `${minutes} min so far`;
  } catch {
    return '';
  }
}

export default function AutomatePage() {
  const { user } = useAuth();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [testMinutes, setTestMinutes] = useState(5);

  const load = useCallback(
    async (options: { quiet?: boolean } = {}) => {
      if (!user) return;
      if (!options.quiet) setIsLoading(true);

      try {
        const [automationList, runList, profiles] = await Promise.all([
          listAutomations(user.uid),
          listRuns(user.uid),
          brandProfileOperations.getAll(user.uid),
        ]);
        setAutomations(automationList);
        setRuns(runList);
        setBrandProfiles(profiles);
      } catch (error) {
        console.error('Error loading automations:', error);
        if (!options.quiet) toast.error('Could not load your automations');
      } finally {
        if (!options.quiet) setIsLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The Search Console callback can only report back through the URL, since it returns
  // as a plain browser redirect from Google.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('gsc');
    if (!result) return;

    if (result === 'connected') {
      toast.success('Search Console connected');
    } else {
      toast.error(params.get('reason') || 'Could not connect Search Console');
    }

    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  // Runs are written by the server after the request returns, so the only way to see
  // them progress is to re-read.
  const hasActiveRun = runs.some(isActive);

  useEffect(() => {
    const timer = setInterval(
      () => void load({ quiet: true }),
      hasActiveRun ? ACTIVE_POLL_INTERVAL_MS : POLL_INTERVAL_MS
    );
    return () => clearInterval(timer);
  }, [load, hasActiveRun]);

  const handleToggle = async (automation: Automation) => {
    try {
      await setAutomationEnabled(automation, !automation.enabled);
      toast.success(automation.enabled ? 'Automation paused' : 'Automation turned on');
      await load({ quiet: true });
    } catch (error) {
      console.error('Error toggling automation:', error);
      toast.error('Could not change that automation');
    }
  };

  const handleDelete = async (automation: Automation) => {
    if (!confirm(`Delete "${automation.name}"? Its run history stays.`)) return;

    try {
      await deleteAutomation(automation.id as string);
      toast.success('Automation deleted');
      await load({ quiet: true });
    } catch (error) {
      console.error('Error deleting automation:', error);
      toast.error('Could not delete that automation');
    }
  };

  const handleTestSchedule = async (automation: Automation) => {
    try {
      const dueAt = await scheduleTestRun(automation, testMinutes);
      toast.success(
        `Due at ${dueAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}. ` +
          'The cron service checks every 15 minutes, so it may start a little after that. ' +
          'You can close this page.'
      );
      await load({ quiet: true });
    } catch (error) {
      console.error('Error scheduling test run:', error);
      toast.error('Could not schedule that test run');
    }
  };

  const handleRunNow = async (automation: Automation) => {
    if (!user) return;
    setRunningId(automation.id as string);

    try {
      const response = await fetch('/api/automation/run-now', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ automationId: automation.id }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not start that run');

      toast.success('Started. Articles take a few minutes, and progress shows under Recent runs.');

      // Pull the freshly opened run record in rather than waiting for the next poll, so
      // the in-progress row appears while the click still feels connected to it.
      await load({ quiet: true });
    } catch (error) {
      console.error('Error starting run:', error);
      toast.error(error instanceof Error ? error.message : 'Could not start that run');
    } finally {
      setRunningId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 text-2xl font-bold">Automate Tools</h1>
          <p className="text-gray-600">
            Write articles on a schedule without opening the dashboard.
          </p>
        </div>

        {!showForm && brandProfiles.length > 0 && (
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            New automation
          </button>
        )}
      </div>

      {showForm ? (
        <AutomationForm
          brandProfiles={brandProfiles}
          existing={editing}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            void load({ quiet: true });
          }}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      ) : (
        <>
          {brandProfiles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
              <Workflow className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="mb-1 font-medium text-gray-700">No brand profiles yet</p>
              <p className="mx-auto mb-4 max-w-md text-sm text-gray-500">
                An automation writes for a specific brand, so you need a brand profile first.
              </p>
              <Link
                href="/dashboard/settings/brands"
                className="text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                Create a brand profile
              </Link>
            </div>
          ) : automations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
              <Workflow className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="mb-1 font-medium text-gray-700">Nothing automated yet</p>
              <p className="mx-auto max-w-md text-sm text-gray-500">
                Set up a list of topics and a schedule, and articles will be written for you. New
                automations start switched off.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
              {automations.map((automation) => {
                const brand = brandProfiles.find((profile) => profile.id === automation.brandId);
                const used = usedThisMonth(automation);
                const atCap = used >= automation.monthlyArticleCap;
                const activeRun = runs.find(
                  (run) => run.automationId === automation.id && isActive(run)
                );

                return (
                  <div
                    key={automation.id}
                    className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate font-semibold text-gray-900">{automation.name}</h2>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              automation.enabled
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {automation.enabled ? 'On' : 'Paused'}
                          </span>
                          {activeRun && (
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
                        </div>

                        <p className="mt-1 text-sm text-gray-600">
                          {brand?.brandName || 'Brand profile missing'} &middot;{' '}
                          {describeSchedule(automation.schedule)} &middot;{' '}
                          {automation.articlesPerRun} article
                          {automation.articlesPerRun === 1 ? '' : 's'} per run
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {automation.topics.length} topic
                          {automation.topics.length === 1 ? '' : 's'} &middot; {used} of{' '}
                          {automation.monthlyArticleCap} used this month &middot; next run{' '}
                          {automation.enabled ? formatWhen(automation.nextRunAt) : 'paused'}
                        </p>

                        {atCap && (
                          <p className="mt-2 text-xs font-medium text-amber-700">
                            Monthly cap reached. Runs are skipped until next month or you raise the
                            cap.
                          </p>
                        )}

                        {/* Run now skips the scheduler, so this is the only way to check
                            that the cron service actually fires on its own. */}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-gray-500">Test the schedule:</span>
                          <select
                            value={testMinutes}
                            onChange={(event) => setTestMinutes(Number(event.target.value))}
                            aria-label="Minutes until the test run is due"
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700"
                          >
                            <option value={5}>in 5 minutes</option>
                            <option value={15}>in 15 minutes</option>
                            <option value={30}>in 30 minutes</option>
                            <option value={60}>in an hour</option>
                          </select>
                          <button
                            onClick={() => void handleTestSchedule(automation)}
                            disabled={Boolean(activeRun)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <CalendarClock className="h-3.5 w-3.5" />
                            Schedule it
                          </button>
                          <span className="text-xs text-gray-400">
                            Turns the automation on, then you can close the page.
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {/* Stays disabled for the whole run, not just the request: the
                            request returns in milliseconds while the work takes minutes. */}
                        <button
                          onClick={() => void handleRunNow(automation)}
                          disabled={runningId === automation.id || Boolean(activeRun)}
                          title={activeRun ? 'Already running' : 'Run once now'}
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {runningId === automation.id || activeRun ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                          {activeRun ? 'Running' : 'Run now'}
                        </button>

                        <button
                          onClick={() => void handleToggle(automation)}
                          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                            automation.enabled
                              ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {automation.enabled ? 'Pause' : 'Turn on'}
                        </button>

                        <button
                          onClick={() => {
                            setEditing(automation);
                            setShowForm(true);
                          }}
                          title="Edit"
                          className="rounded-md border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          onClick={() => void handleDelete(automation)}
                          title="Delete"
                          className="rounded-md border border-gray-300 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>

              <div className="lg:col-span-1">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">Recent runs</h2>
                  {hasActiveRun && (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  )}
                </div>

                {runs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                    <p className="text-sm text-gray-500">
                      No runs yet. Use Run now to try one without waiting for the schedule.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
                    {runs.map((run) => (
                      <div
                        key={run.id}
                        className={`flex items-start gap-3 p-4 ${
                          isActive(run) ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <div className="mt-0.5">
                          <StatusIcon status={run.status} />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900">
                            <span className="font-medium">{run.automationName}</span>
                            {run.keyword && (
                              <span className="text-gray-600"> — {run.keyword}</span>
                            )}
                          </p>

                          {isActive(run) ? (
                            <p className="mt-1 text-xs font-medium text-blue-700">
                              {run.status === 'queued'
                                ? 'Queued, waiting to start'
                                : run.keyword
                                  ? 'Writing the article — this takes a few minutes'
                                  : 'Picking a topic'}
                            </p>
                          ) : (
                            <>
                              {run.error && (
                                <p className="mt-1 text-xs text-red-600">{run.error}</p>
                              )}
                              {run.warning && (
                                <p className="mt-1 text-xs text-amber-700">{run.warning}</p>
                              )}
                            </>
                          )}

                          <p className="mt-1 text-xs text-gray-500">
                            {formatWhen(run.startedAt)}
                            {isActive(run) && ` · ${elapsedSince(run.startedAt)}`}
                            {run.pushedToShopify && ' · pushed to Shopify'}
                          </p>
                        </div>

                        {run.blogId && (
                          <Link
                            href={`/dashboard/articles/${run.blogId}/edit`}
                            className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-700"
                          >
                            Open
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
