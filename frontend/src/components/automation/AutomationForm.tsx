'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/firebase/auth-context';
import type { BrandProfile } from '@/lib/firebase/firestore';
import { createAutomation, updateAutomation } from '@/lib/firebase/automations';
import {
  CONTENT_TYPE_OPTIONS,
  DEFAULT_GSC_CONFIG,
  DEFAULT_MONTHLY_ARTICLE_CAP,
  MAX_ARTICLES_PER_RUN,
  MAX_MONTHLY_ARTICLE_CAP,
  TONE_OPTIONS,
  defaultContentSelection,
  type Automation,
  type AutomationDraft,
  type AutomationFrequency,
  type AutomationGscConfig,
  type AutomationGscDimension,
  type AutomationTrigger,
} from '@/lib/automation/types';
import { shortenPage, type GscCandidate } from '@/lib/automation/selection';
import {
  WEEKDAY_NAMES,
  formatHour,
  localHourToUtc,
  utcHourToLocal,
} from '@/lib/automation/schedule';

interface AutomationFormProps {
  brandProfiles: BrandProfile[];
  existing?: Automation | null;
  onSaved: () => void;
  onCancel: () => void;
}

interface ShopifyBlogOption {
  id: number | string;
  title: string;
}

interface GscStatus {
  configured: boolean;
  connected: boolean;
  needsReconnect?: boolean;
  googleEmail?: string | null;
  sites: Array<{ siteUrl: string; permissionLevel: string }>;
  error?: string;
}

interface GscPreview {
  dimension: AutomationGscDimension;
  metric: AutomationGscConfig['metric'];
  lookbackDays: number;
  totalCandidates: number;
  eligibleCount: number;
  candidates: GscCandidate[];
}

const inputClass =
  'mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500';
const labelClass = 'block text-sm font-medium text-gray-700';

export default function AutomationForm({
  brandProfiles,
  existing,
  onSaved,
  onCancel,
}: AutomationFormProps) {
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState(existing?.name || '');
  const [brandId, setBrandId] = useState(existing?.brandId || brandProfiles[0]?.id || '');
  const [trigger, setTrigger] = useState<AutomationTrigger>(existing?.trigger || 'topicList');
  const [topicsText, setTopicsText] = useState((existing?.topics || []).join('\n'));
  const [gsc, setGsc] = useState<AutomationGscConfig>(existing?.gsc || DEFAULT_GSC_CONFIG);
  const [gscStatus, setGscStatus] = useState<GscStatus | null>(null);
  const [gscLoading, setGscLoading] = useState(false);
  const [gscCheckError, setGscCheckError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GscPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<AutomationFrequency>(
    existing?.schedule.frequency || 'weekly'
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(existing?.schedule.daysOfWeek || [1]);
  const [hourLocal, setHourLocal] = useState(
    existing ? utcHourToLocal(existing.schedule.hourUtc) : 9
  );
  const [articlesPerRun, setArticlesPerRun] = useState(existing?.articlesPerRun || 1);
  const [monthlyArticleCap, setMonthlyArticleCap] = useState(
    existing?.monthlyArticleCap ?? DEFAULT_MONTHLY_ARTICLE_CAP
  );
  const [contentType, setContentType] = useState<string>(
    existing?.contentType || CONTENT_TYPE_OPTIONS[0].value
  );
  const [toneOfVoice, setToneOfVoice] = useState(existing?.toneOfVoice || '');
  const [instructions, setInstructions] = useState(existing?.instructions || '');
  const [autoPushToShopify, setAutoPushToShopify] = useState(existing?.autoPushToShopify || false);
  const [shopifyStatus, setShopifyStatus] = useState<'draft' | 'published'>(
    existing?.shopifyStatus || 'draft'
  );
  const [shopifyBlogId, setShopifyBlogId] = useState(existing?.shopifyBlogId || '');
  const [shopifyBlogs, setShopifyBlogs] = useState<ShopifyBlogOption[]>([]);
  const [loadingBlogs, setLoadingBlogs] = useState(false);

  const selectedBrand = useMemo(
    () => brandProfiles.find((profile) => profile.id === brandId),
    [brandProfiles, brandId]
  );

  const brandHasShopify = Boolean(selectedBrand?.shopifyStoreUrl);

  const topics = useMemo(
    () =>
      topicsText
        .split('\n')
        .map((topic) => topic.trim())
        .filter(Boolean),
    [topicsText]
  );

  /** Average weeks per month, for turning a weekly schedule into a monthly figure. */
  const projectedPerMonth = useMemo(() => {
    const runsPerMonth = frequency === 'daily' ? 30.4 : daysOfWeek.length * 4.35;
    return Math.round(runsPerMonth * articlesPerRun);
  }, [frequency, daysOfWeek, articlesPerRun]);

  const loadShopifyBlogs = useCallback(async () => {
    if (!user || !selectedBrand || !brandHasShopify) return;

    setLoadingBlogs(true);
    try {
      const response = await fetch('/api/shopify/get-blogs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ brandId }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load blogs');

      setShopifyBlogs(payload.blogs || []);
    } catch (error) {
      console.error('Error loading Shopify blogs:', error);
      toast.error(error instanceof Error ? error.message : 'Could not load your Shopify blogs');
    } finally {
      setLoadingBlogs(false);
    }
  }, [user, selectedBrand, brandHasShopify]);

  // Only reach out to Shopify once auto-push is actually wanted.
  useEffect(() => {
    if (autoPushToShopify && brandHasShopify && shopifyBlogs.length === 0) {
      void loadShopifyBlogs();
    }
  }, [autoPushToShopify, brandHasShopify, shopifyBlogs.length, loadShopifyBlogs]);

  const loadGscStatus = useCallback(async () => {
    if (!user || !brandId) return;

    setGscLoading(true);
    try {
      const response = await fetch(`/api/gsc/status?brandId=${encodeURIComponent(brandId)}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not check Search Console');
      setGscStatus(payload as GscStatus);
      setGscCheckError(null);
    } catch (error) {
      console.error('Error checking Search Console:', error);
      setGscStatus(null);
      setGscCheckError(
        error instanceof Error ? error.message : 'Could not check Search Console'
      );
    } finally {
      setGscLoading(false);
    }
  }, [user, brandId]);

  useEffect(() => {
    if (trigger === 'gscTraffic') void loadGscStatus();
  }, [trigger, loadGscStatus]);

  const loadPreview = useCallback(async () => {
    if (!user || !brandId || !gsc.siteUrl) return;

    setPreviewLoading(true);
    try {
      const response = await fetch('/api/gsc/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ brandId, ...gsc }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not read your traffic');
      setPreview(payload as GscPreview);
      setPreviewError(null);
    } catch (error) {
      console.error('Error previewing Search Console traffic:', error);
      setPreview(null);
      setPreviewError(error instanceof Error ? error.message : 'Could not read your traffic');
    } finally {
      setPreviewLoading(false);
    }
  }, [user, brandId, gsc]);

  // Debounced because the threshold is a number input: typing "150" would otherwise fire
  // three Search Console calls, and they are neither free nor fast.
  useEffect(() => {
    if (trigger !== 'gscTraffic' || !gscStatus?.connected || !gsc.siteUrl) {
      setPreview(null);
      setPreviewError(null);
      return;
    }

    const timer = setTimeout(() => void loadPreview(), 400);
    return () => clearTimeout(timer);
  }, [trigger, gscStatus?.connected, gsc.siteUrl, loadPreview]);

  const toggleDay = (day: number) => {
    setDaysOfWeek((previous) =>
      previous.includes(day) ? previous.filter((entry) => entry !== day) : [...previous, day].sort()
    );
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Give this automation a name.';
    if (!brandId) return 'Choose a brand profile.';
    if (trigger === 'topicList' && topics.length === 0) {
      return 'Add at least one topic for it to write about.';
    }
    if (trigger === 'gscTraffic') {
      if (!gscStatus?.connected) {
        return 'Connect Search Console for this brand on its brand profile first.';
      }
      if (!gsc.siteUrl) return 'Choose which Search Console property to read.';
      if (gsc.minMetric < 1) return `The minimum ${gsc.metric} must be at least 1.`;
      if (gsc.lookbackDays < 7 || gsc.lookbackDays > 90) {
        return 'The lookback window must be between 7 and 90 days.';
      }
    }
    if (frequency === 'weekly' && daysOfWeek.length === 0) return 'Pick at least one day of the week.';
    if (articlesPerRun < 1 || articlesPerRun > MAX_ARTICLES_PER_RUN) {
      return `Articles per run must be between 1 and ${MAX_ARTICLES_PER_RUN}.`;
    }
    if (monthlyArticleCap < 1 || monthlyArticleCap > MAX_MONTHLY_ARTICLE_CAP) {
      return `The monthly cap must be between 1 and ${MAX_MONTHLY_ARTICLE_CAP}.`;
    }
    if (autoPushToShopify && !brandHasShopify) {
      return 'This brand has no Shopify credentials, so it cannot push automatically.';
    }
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }

    const draft: AutomationDraft = {
      userId: user.uid,
      brandId,
      name: name.trim(),
      enabled: existing?.enabled ?? false,
      trigger,
      topics,
      topicCursor: existing?.topicCursor ?? 0,
      // Defaulted rather than left undefined: Firestore rejects undefined fields, and an
      // automation saved before the page option existed ranks by query.
      ...(trigger === 'gscTraffic' ? { gsc: { ...gsc, dimension: gsc.dimension || 'query' } } : {}),
      schedule: {
        frequency,
        hourUtc: localHourToUtc(hourLocal),
        daysOfWeek: frequency === 'weekly' ? daysOfWeek : [],
        displayTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      articlesPerRun,
      monthlyArticleCap,
      contentType,
      toneOfVoice: toneOfVoice || '',
      instructions: instructions || '',
      contentSelection: existing?.contentSelection || defaultContentSelection(),
      autoPushToShopify,
      shopifyBlogId: shopifyBlogId || '',
      shopifyStatus,
    };

    setIsSaving(true);
    try {
      if (existing?.id) {
        await updateAutomation(existing.id, draft);
        toast.success('Automation updated');
      } else {
        await createAutomation(user.uid, draft);
        toast.success('Automation created. Turn it on when you are ready.');
      }
      onSaved();
    } catch (error) {
      console.error('Error saving automation:', error);
      toast.error('Could not save this automation');
    } finally {
      setIsSaving(false);
    }
  };

  if (brandProfiles.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You need a brand profile before you can automate anything. Create one in Settings, then come
        back.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="automation-name" className={labelClass}>
            Name
          </label>
          <input
            id="automation-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Weekly troubleshooting guides"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="automation-brand" className={labelClass}>
            Brand
          </label>
          <select
            id="automation-brand"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            className={inputClass}
          >
            {brandProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.brandName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">What should it write about</h3>

        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                value: 'topicList' as AutomationTrigger,
                title: 'A list of topics',
                detail: 'Works through topics you write out, in order.',
              },
              {
                value: 'gscTraffic' as AutomationTrigger,
                title: 'Search Console traffic',
                detail: 'Picks your highest-traffic search terms that have no article yet.',
              },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-md border p-3 transition-colors ${
                trigger === option.value
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-300 hover:border-blue-300'
              }`}
            >
              <input
                type="radio"
                name="automation-trigger"
                checked={trigger === option.value}
                onChange={() => setTrigger(option.value)}
                className="mt-1 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm">
                <span className="block font-medium text-gray-900">{option.title}</span>
                <span className="mt-0.5 block text-xs text-gray-500">{option.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {trigger === 'topicList' ? (
        <div>
          <label htmlFor="automation-topics" className={labelClass}>
            Topics, one per line
          </label>
          <textarea
            id="automation-topics"
            value={topicsText}
            onChange={(event) => setTopicsText(event.target.value)}
            rows={5}
            placeholder={'walk in cooler not cooling\nwalk in freezer door gasket replacement'}
            className={`${inputClass} font-mono text-sm`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Worked through in order and then repeated from the top.{' '}
            {topics.length > 0 &&
              `${topics.length} topic${topics.length === 1 ? '' : 's'} right now.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {!brandId ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
              Choose a brand profile above and its Search Console properties will show up
              here.
            </div>
          ) : gscLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking Search Console...
            </div>
          ) : gscCheckError ? (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {gscCheckError}{' '}
                <button
                  type="button"
                  onClick={() => void loadGscStatus()}
                  className="font-medium underline"
                >
                  Try again
                </button>
              </p>
            </div>
          ) : !gscStatus?.configured ? (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Search Console is not set up on this deployment yet. It needs Google OAuth
                credentials before this trigger can be used.
              </p>
            </div>
          ) : !gscStatus.connected ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="mb-1 text-sm font-medium text-gray-900">
                Search Console is not connected for this brand
              </p>
              <p className="text-xs text-gray-600">
                Connect it on the{' '}
                <Link
                  href="/dashboard/settings/brands"
                  className="font-medium text-blue-600 underline"
                >
                  brand profile
                </Link>
                , then come back to finish this automation. Connecting from here would discard
                anything you have typed above.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs border-green-200 bg-green-50 text-green-800">
                <span>
                  Connected{gscStatus.googleEmail ? ` as ${gscStatus.googleEmail}` : ''}
                </span>
                <Link
                  href="/dashboard/settings/brands"
                  className="shrink-0 font-medium text-green-900 underline"
                >
                  Manage
                </Link>
              </div>

              {gscStatus.error && (
                <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    {gscStatus.error}
                    {gscStatus.needsReconnect && (
                      <>
                        {' '}
                        <Link
                          href="/dashboard/settings/brands"
                          className="font-medium underline"
                        >
                          Reconnect on the brand profile
                        </Link>
                        .
                      </>
                    )}
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="automation-gsc-site" className={labelClass}>
                  Property
                </label>
                <select
                  id="automation-gsc-site"
                  value={gsc.siteUrl}
                  onChange={(event) => setGsc({ ...gsc, siteUrl: event.target.value })}
                  className={inputClass}
                >
                  <option value="">Choose a property</option>
                  {gscStatus.sites.map((site) => (
                    <option key={site.siteUrl} value={site.siteUrl}>
                      {site.siteUrl}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="automation-gsc-dimension" className={labelClass}>
                  Pick topics from
                </label>
                <select
                  id="automation-gsc-dimension"
                  value={gsc.dimension || 'query'}
                  onChange={(event) =>
                    setGsc({
                      ...gsc,
                      dimension: event.target.value as AutomationGscDimension,
                    })
                  }
                  className={inputClass}
                >
                  <option value="query">Search terms</option>
                  <option value="page">Pages</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {(gsc.dimension || 'query') === 'page'
                    ? 'Finds the pages pulling the most traffic and writes about the term each one ranks best for.'
                    : 'Finds the individual search terms bringing in the most traffic.'}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="automation-gsc-metric" className={labelClass}>
                    Measure traffic in
                  </label>
                  <select
                    id="automation-gsc-metric"
                    value={gsc.metric}
                    onChange={(event) =>
                      setGsc({ ...gsc, metric: event.target.value as 'clicks' | 'impressions' })
                    }
                    className={inputClass}
                  >
                    <option value="clicks">Clicks</option>
                    <option value="impressions">Impressions</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="automation-gsc-min" className={labelClass}>
                    Ignore below
                  </label>
                  <input
                    id="automation-gsc-min"
                    type="number"
                    min={1}
                    value={gsc.minMetric}
                    onChange={(event) => setGsc({ ...gsc, minMetric: Number(event.target.value) })}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="automation-gsc-lookback" className={labelClass}>
                    Looking back
                  </label>
                  <select
                    id="automation-gsc-lookback"
                    value={gsc.lookbackDays}
                    onChange={(event) =>
                      setGsc({ ...gsc, lookbackDays: Number(event.target.value) })
                    }
                    className={inputClass}
                  >
                    <option value={7}>7 days</option>
                    <option value={28}>28 days</option>
                    <option value={30}>30 days</option>
                    <option value={90}>90 days</option>
                  </select>
                </div>
              </div>

              {gsc.siteUrl && (
                <div className="rounded-md border border-gray-200">
                  <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        What it would write next
                      </p>
                      {preview && (
                        <p className="text-xs text-gray-500">
                          {preview.eligibleCount} of {preview.totalCandidates}{' '}
                          {preview.dimension === 'page' ? 'pages' : 'terms'} available
                          {preview.eligibleCount > 0 &&
                            `, top ${Math.min(articlesPerRun, preview.eligibleCount)} taken each run`}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadPreview()}
                      disabled={previewLoading}
                      className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {previewLoading ? 'Checking...' : 'Refresh'}
                    </button>
                  </div>

                  {previewLoading && !preview ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Reading your Search Console traffic...
                    </div>
                  ) : previewError ? (
                    <p className="px-3 py-4 text-xs text-amber-800">{previewError}</p>
                  ) : !preview || preview.candidates.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-gray-600">
                      Search Console reported no traffic for this property over the last{' '}
                      {gsc.lookbackDays} days.
                    </p>
                  ) : (
                    <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
                      {preview.candidates.map((candidate, index) => {
                        const usable =
                          !candidate.covered && !candidate.belowThreshold && !candidate.duplicate;
                        // Position among the usable ones, which is the order a run works in.
                        const queuePosition = preview.candidates
                          .slice(0, index)
                          .filter(
                            (earlier) =>
                              !earlier.covered && !earlier.belowThreshold && !earlier.duplicate
                          ).length;
                        const nextUp = usable && queuePosition < articlesPerRun;

                        return (
                          <li
                            key={`${candidate.page || ''}-${candidate.keyword}-${index}`}
                            className={`flex items-start justify-between gap-3 px-3 py-2 text-xs ${
                              usable ? '' : 'bg-gray-50 text-gray-500'
                            }`}
                          >
                            <div className="min-w-0">
                              <p
                                className={`truncate ${
                                  usable ? 'font-medium text-gray-900' : 'text-gray-500'
                                }`}
                              >
                                {candidate.keyword}
                              </p>
                              {candidate.page && (
                                <p className="truncate text-gray-500">
                                  {shortenPage(candidate.page)}
                                </p>
                              )}
                              <p className="text-gray-500">
                                {Math.round(candidate.metricValue).toLocaleString()} {preview.metric}
                                , position {candidate.position.toFixed(1)}
                              </p>
                            </div>

                            <span className="shrink-0 whitespace-nowrap">
                              {nextUp ? (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">
                                  Next up
                                </span>
                              ) : candidate.covered ? (
                                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-gray-600">
                                  Already written
                                </span>
                              ) : candidate.duplicate ? (
                                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-gray-600">
                                  Same term as a bigger page
                                </span>
                              ) : candidate.belowThreshold ? (
                                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-gray-600">
                                  Below {gsc.minMetric}
                                </span>
                              ) : (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">
                                  Queued
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <p>
                  Terms that already have an article for this brand are skipped, so it moves down
                  your list instead of rewriting the same page. Search Console data lags by a couple
                  of days, so the window ends three days ago.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      <div className="border-t border-gray-200 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Schedule</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="automation-frequency" className={labelClass}>
              How often
            </label>
            <select
              id="automation-frequency"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as AutomationFrequency)}
              className={inputClass}
            >
              <option value="daily">Every day</option>
              <option value="weekly">Certain days each week</option>
            </select>
          </div>

          <div>
            <label htmlFor="automation-hour" className={labelClass}>
              Around what time
            </label>
            <select
              id="automation-hour"
              value={hourLocal}
              onChange={(event) => setHourLocal(Number(event.target.value))}
              className={inputClass}
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {formatHour(hour)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Your local time. Runs are checked every 15 minutes, so it fires within about a quarter
              hour of this.
            </p>
          </div>
        </div>

        {frequency === 'weekly' && (
          <div className="mt-4">
            <span className={labelClass}>Which days</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {WEEKDAY_NAMES.map((dayName, day) => {
                const active = daysOfWeek.includes(day);
                return (
                  <button
                    key={dayName}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      active
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:text-blue-600'
                    }`}
                  >
                    {dayName.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Volume</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="automation-per-run" className={labelClass}>
              Articles per run
            </label>
            <input
              id="automation-per-run"
              type="number"
              min={1}
              max={MAX_ARTICLES_PER_RUN}
              value={articlesPerRun}
              onChange={(event) => setArticlesPerRun(Number(event.target.value))}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500">
              Up to {MAX_ARTICLES_PER_RUN}. They are written one after another, so a large run
              takes a while to finish.
            </p>
          </div>

          <div>
            <label htmlFor="automation-cap" className={labelClass}>
              Never exceed, per month
            </label>
            <input
              id="automation-cap"
              type="number"
              min={1}
              max={MAX_MONTHLY_ARTICLE_CAP}
              value={monthlyArticleCap}
              onChange={(event) => setMonthlyArticleCap(Number(event.target.value))}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500">
              A hard stop for this automation regardless of your plan, so an unlimited plan cannot
              run up an unlimited bill.
            </p>
          </div>
        </div>

        {/* Articles per run and the monthly cap are easy to set in conflict: five a day
            against a cap of ten stops writing on the third day, and only the run history
            would say why. */}
        <p
          className={`mt-3 text-xs ${
            projectedPerMonth > monthlyArticleCap ? 'font-medium text-amber-700' : 'text-gray-500'
          }`}
        >
          This works out to about {projectedPerMonth} article
          {projectedPerMonth === 1 ? '' : 's'} a month.
          {projectedPerMonth > monthlyArticleCap &&
            ` That is over your cap of ${monthlyArticleCap}, so runs will be skipped once the cap is reached. Raise the cap to ${projectedPerMonth} to see the whole schedule through.`}
        </p>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Article settings</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="automation-content-type" className={labelClass}>
              Content type
            </label>
            <select
              id="automation-content-type"
              value={contentType}
              onChange={(event) => setContentType(event.target.value)}
              className={inputClass}
            >
              {CONTENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              {/* An automation saved before this list changed would otherwise show blank. */}
              {!CONTENT_TYPE_OPTIONS.some((option) => option.value === contentType) && (
                <option value={contentType}>{contentType}</option>
              )}
            </select>
          </div>

          <div>
            <label htmlFor="automation-tone" className={labelClass}>
              Tone of voice
            </label>
            <select
              id="automation-tone"
              value={toneOfVoice}
              onChange={(event) => setToneOfVoice(event.target.value)}
              className={inputClass}
            >
              <option value="">Default</option>
              {TONE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="automation-instructions" className={labelClass}>
            Extra instructions
          </label>
          <textarea
            id="automation-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={3}
            placeholder="Anything you would normally type into the instructions box when generating by hand."
            className={inputClass}
          />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Shopify</h3>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={autoPushToShopify}
            onChange={(event) => setAutoPushToShopify(event.target.checked)}
            disabled={!brandHasShopify}
            className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
          />
          <span className="text-sm">
            <span className="font-medium text-gray-900">Push articles to Shopify automatically</span>
            <span className="mt-0.5 block text-xs text-gray-500">
              {brandHasShopify
                ? 'Nobody reviews the article before it lands in your store. Articles the fact-checker flags are held back regardless of this setting.'
                : 'Add Shopify credentials to this brand profile to enable this.'}
            </span>
          </span>
        </label>

        {autoPushToShopify && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="automation-shopify-blog" className={labelClass}>
                Blog
              </label>
              <div className="relative">
                <select
                  id="automation-shopify-blog"
                  value={shopifyBlogId}
                  onChange={(event) => setShopifyBlogId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Store default</option>
                  {shopifyBlogs.map((blog) => (
                    <option key={blog.id} value={String(blog.id)}>
                      {blog.title}
                    </option>
                  ))}
                </select>
                {loadingBlogs && (
                  <Loader2 className="absolute right-8 top-3 h-4 w-4 animate-spin text-gray-400" />
                )}
              </div>
            </div>

            <div>
              <label htmlFor="automation-shopify-status" className={labelClass}>
                Publish as
              </label>
              <select
                id="automation-shopify-status"
                value={shopifyStatus}
                onChange={(event) => setShopifyStatus(event.target.value as 'draft' | 'published')}
                className={inputClass}
              >
                <option value="draft">Draft, for you to review in Shopify</option>
                <option value="published">Published, live immediately</option>
              </select>
            </div>

            {shopifyStatus === 'published' && (
              <div className="sm:col-span-2">
                <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Articles will go live on your storefront without anyone reading them first.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : existing ? 'Save changes' : 'Create automation'}
        </button>
      </div>
    </form>
  );
}
