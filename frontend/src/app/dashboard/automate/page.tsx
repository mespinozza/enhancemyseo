'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Workflow,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations, type BrandProfile } from '@/lib/firebase/firestore';
import {
  deleteAutomation,
  setAutomationEnabled,
  watchAutomations,
  watchRuns,
} from '@/lib/firebase/automations';
import { QUOTA_EXHAUSTED_MESSAGE, isQuotaExhausted } from '@/lib/firebase/quota';
import AutomationForm from '@/components/automation/AutomationForm';
import AutomationCard, { formatWhen } from '@/components/automation/AutomationCard';
import type { Automation, AutomationRun, AutomationRunStatus } from '@/lib/automation/types';
import { blueprintFor } from '@/lib/article/enhanced/blueprints';
import { ToneBadge } from '@/components/TonePicker';

/** How many recent runs the history panel keeps live. */
const RUN_HISTORY_LIMIT = 25;

function isActive(run: AutomationRun): boolean {
  return run.status === 'running' || run.status === 'queued';
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

  // Automations and runs are live: both change underneath this page while the server
  // works, and a listener costs a read per changed document rather than a read per
  // document per tick. Brand profiles are static enough to fetch once.
  useEffect(() => {
    if (!user) return;

    let automationsReady = false;
    let runsReady = false;
    const settle = () => {
      if (automationsReady && runsReady) setIsLoading(false);
    };

    const reportError = (error: Error) => {
      console.error('Error watching automations:', error);
      toast.error(isQuotaExhausted(error) ? QUOTA_EXHAUSTED_MESSAGE : 'Could not load your automations');
      setIsLoading(false);
    };

    const stopAutomations = watchAutomations(
      user.uid,
      (list) => {
        setAutomations(list);
        automationsReady = true;
        settle();
      },
      reportError
    );

    const stopRuns = watchRuns(
      user.uid,
      RUN_HISTORY_LIMIT,
      (list) => {
        setRuns(list);
        runsReady = true;
        settle();
      },
      reportError
    );

    return () => {
      stopAutomations();
      stopRuns();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    brandProfileOperations
      .getAll(user.uid)
      .then(setBrandProfiles)
      .catch((error) => {
        console.error('Error loading brand profiles:', error);
        toast.error('Could not load your brand profiles');
      });
  }, [user]);

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

  const hasActiveRun = runs.some(isActive);

  const handleToggle = async (automation: Automation) => {
    try {
      await setAutomationEnabled(automation, !automation.enabled);
      toast.success(automation.enabled ? 'Automation paused' : 'Automation turned on');
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
    } catch (error) {
      console.error('Error deleting automation:', error);
      toast.error('Could not delete that automation');
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
              {automations.map((automation) => (
                <AutomationCard
                  key={automation.id}
                  automation={automation}
                  brandName={brandProfiles.find((profile) => profile.id === automation.brandId)?.brandName}
                  isRunning={runs.some((run) => run.automationId === automation.id && isActive(run))}
                  isStarting={runningId === automation.id}
                  onRunNow={() => void handleRunNow(automation)}
                  onToggle={() => void handleToggle(automation)}
                  onEdit={() => {
                    setEditing(automation);
                    setShowForm(true);
                  }}
                  onDelete={() => void handleDelete(automation)}
                />
              ))}
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
                            {run.contentType && (
                              <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                                {blueprintFor(run.contentType).label}
                              </span>
                            )}
                            {run.toneOfVoice !== undefined && <ToneBadge tone={run.toneOfVoice} className="ml-1.5 align-middle" />}
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
                            {run.publishedToSiteBlog && (
                              <>
                                {' · '}
                                <Link
                                  href={run.siteBlogPath || '/blog'}
                                  className="text-blue-600 hover:text-blue-700"
                                >
                                  on the blog
                                </Link>
                              </>
                            )}
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
