'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ImagePlus,
  Loader2,
  Save,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import {
  CaseStudy,
  CaseStudyScreenshot,
  MAX_CASE_STUDY_SCREENSHOTS,
  engagementLabel,
  isActiveClient,
  slugify,
} from '@/lib/results/types';

interface EditorProps {
  /** Omitted when creating; the existing document when editing. */
  existing?: CaseStudy;
}

interface FormState {
  title: string;
  slug: string;
  storeName: string;
  storeUrl: string;
  industry: string;
  summary: string;
  body: string;
  startDate: string;
  endDate: string;
  quote: string;
  quoteAuthor: string;
  quoteRole: string;
  clicksBefore: string;
  clicksAfter: string;
  impressionsBefore: string;
  impressionsAfter: string;
  periodLabel: string;
  articlesPublished: string;
  keywordsOnPageOne: string;
  verified: boolean;
  featured: boolean;
}

const numberToField = (value: number | null) => (value === null ? '' : String(value));

function initialState(existing?: CaseStudy): FormState {
  return {
    title: existing?.title ?? '',
    slug: existing?.slug ?? '',
    storeName: existing?.storeName ?? '',
    storeUrl: existing?.storeUrl ?? '',
    industry: existing?.industry ?? '',
    summary: existing?.summary ?? '',
    body: existing?.body ?? '',
    startDate: existing?.startDate ?? '',
    endDate: existing?.endDate ?? '',
    quote: existing?.quote ?? '',
    quoteAuthor: existing?.quoteAuthor ?? '',
    quoteRole: existing?.quoteRole ?? '',
    clicksBefore: numberToField(existing?.metrics.clicksBefore ?? null),
    clicksAfter: numberToField(existing?.metrics.clicksAfter ?? null),
    impressionsBefore: numberToField(existing?.metrics.impressionsBefore ?? null),
    impressionsAfter: numberToField(existing?.metrics.impressionsAfter ?? null),
    periodLabel: existing?.metrics.periodLabel ?? '',
    articlesPublished: numberToField(existing?.metrics.articlesPublished ?? null),
    keywordsOnPageOne: numberToField(existing?.metrics.keywordsOnPageOne ?? null),
    verified: existing?.verified ?? false,
    featured: existing?.featured ?? false,
  };
}

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-white p-6 shadow">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function CaseStudyEditor({ existing }: EditorProps) {
  const { user } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState<FormState>(() => initialState(existing));
  const [screenshots, setScreenshots] = useState<CaseStudyScreenshot[]>(
    existing?.screenshots ?? []
  );
  const [logoUrl, setLogoUrl] = useState(existing?.logoUrl ?? '');
  const [pastedUrl, setPastedUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [saving, setSaving] = useState(false);

  const addPastedUrl = () => {
    // Splitting on whitespace and commas means a whole list can be pasted in one go.
    const candidates = pastedUrl
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    const valid = candidates.filter((url) => /^https?:\/\//i.test(url) || url.startsWith('/'));
    if (valid.length === 0) {
      toast.error('That does not look like an image URL.');
      return;
    }

    const accepted = valid.slice(0, MAX_CASE_STUDY_SCREENSHOTS - screenshots.length);
    if (accepted.length === 0) {
      toast.error(`A case study holds up to ${MAX_CASE_STUDY_SCREENSHOTS} screenshots.`);
      return;
    }

    setScreenshots((current) => [...current, ...accepted.map((url) => ({ url, caption: '' }))]);
    setPastedUrl('');

    const skipped = candidates.length - accepted.length;
    if (skipped > 0) {
      toast.error(`Skipped ${skipped} ${skipped === 1 ? 'entry' : 'entries'}.`);
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Echo back exactly what the public page will say, so "Present" and the active
  // marker are not a surprise after publishing.
  const engagementPreview = engagementLabel({
    startDate: form.startDate,
    endDate: form.endDate,
  });
  const isActive = isActiveClient({ startDate: form.startDate, endDate: form.endDate });

  // Only auto-fill the slug for new case studies. Rewriting it on an existing one would
  // silently break every link already pointing at the published page.
  const handleTitleChange = (title: string) => {
    setForm((current) => ({
      ...current,
      title,
      slug: existing ? current.slug : slugify(title),
    }));
  };

  const upload = async (file: File): Promise<string | null> => {
    if (!user) return null;
    const data = new FormData();
    data.append('file', file);
    const response = await fetch('/api/results/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      body: data,
    });
    const result = await response.json();
    if (!response.ok) {
      // The upload route explains setup problems in a `setup` field and unexpected ones
      // in `detail`; an admin is the person who can act on either, so show them rather
      // than swallowing them.
      const extra = result.setup || result.detail;
      throw new Error(extra ? `${result.error} ${extra}` : result.error || 'Upload failed');
    }
    return result.url as string;
  };

  const handleScreenshotUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const room = MAX_CASE_STUDY_SCREENSHOTS - screenshots.length;
    if (files.length > room) {
      toast.error(
        `Only ${room} more will fit — a case study holds up to ${MAX_CASE_STUDY_SCREENSHOTS} screenshots.`
      );
      files.length = Math.max(room, 0);
      if (files.length === 0) return;
    }

    setUploading(true);
    // Sequentially rather than in parallel: a dozen 8MB images at once is a good way to
    // get rate limited, and it lets the count below mean something.
    const added: CaseStudyScreenshot[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress({ done: index, total: files.length });
        const url = await upload(file);
        if (url) added.push({ url, caption: '' });
      }
      if (added.length > 0) {
        setScreenshots((current) => [...current, ...added]);
        toast.success(
          added.length === 1 ? 'Screenshot added' : `${added.length} screenshots added`
        );
      }
    } catch (error) {
      // Keep whatever made it through; losing four successful uploads because the
      // fifth failed would be worse than a partial result.
      if (added.length > 0) setScreenshots((current) => [...current, ...added]);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploadProgress(null);
      setUploading(false);
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    setScreenshots((current) => {
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const url = await upload(file);
      if (url) setLogoUrl(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async (published: boolean) => {
    if (!user) return;

    setSaving(true);
    try {
      const payload = {
        title: form.title,
        slug: form.slug || slugify(form.title),
        storeName: form.storeName,
        storeUrl: form.storeUrl,
        industry: form.industry,
        logoUrl,
        summary: form.summary,
        body: form.body,
        startDate: form.startDate,
        endDate: form.endDate,
        quote: form.quote,
        quoteAuthor: form.quoteAuthor,
        quoteRole: form.quoteRole,
        verified: form.verified,
        featured: form.featured,
        published,
        screenshots,
        metrics: {
          clicksBefore: form.clicksBefore,
          clicksAfter: form.clicksAfter,
          impressionsBefore: form.impressionsBefore,
          impressionsAfter: form.impressionsAfter,
          periodLabel: form.periodLabel,
          articlesPublished: form.articlesPublished,
          keywordsOnPageOne: form.keywordsOnPageOne,
        },
      };

      const response = await fetch(
        existing ? `/api/results/${existing.id}` : '/api/results',
        {
          method: existing ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed');

      toast.success(published ? 'Case study published' : 'Saved as a draft');
      router.push('/admin/results');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/admin/results"
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              All case studies
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-gray-900">
              {existing ? 'Edit case study' : 'New case study'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {existing?.published && (
              <a
                href={`/results/${existing.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                View live
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving || uploading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Save draft
            </button>
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving || uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Publish
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Panel title="The story">
              <Field label="Headline *">
                <input
                  className={inputClass}
                  value={form.title}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  placeholder="From page 5 to page 1 in six months"
                />
              </Field>

              <Field label="URL slug *" hint={`Published at /results/${form.slug || '…'}`}>
                <input
                  className={inputClass}
                  value={form.slug}
                  onChange={(event) => set('slug', slugify(event.target.value))}
                />
              </Field>

              <Field label="Summary *" hint="One or two sentences, shown on the listing card.">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={form.summary}
                  onChange={(event) => set('summary', event.target.value)}
                />
              </Field>

              <Field label="Full write-up" hint="HTML is supported, the same as blog posts.">
                <textarea
                  className={`${inputClass} font-mono`}
                  rows={16}
                  value={form.body}
                  onChange={(event) => set('body', event.target.value)}
                  placeholder="<p>What the store was struggling with, what we changed, what happened.</p>"
                />
              </Field>
            </Panel>

            <Panel title="Customer quote">
              <Field label="Quote">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={form.quote}
                  onChange={(event) => set('quote', event.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Attributed to">
                  <input
                    className={inputClass}
                    value={form.quoteAuthor}
                    onChange={(event) => set('quoteAuthor', event.target.value)}
                    placeholder="Alex Rivera"
                  />
                </Field>
                <Field label="Role">
                  <input
                    className={inputClass}
                    value={form.quoteRole}
                    onChange={(event) => set('quoteRole', event.target.value)}
                    placeholder="Founder, Posh Cave"
                  />
                </Field>
              </div>
            </Panel>

            <Panel
              title={`Screenshots${screenshots.length > 0 ? ` (${screenshots.length})` : ''}`}
            >
              <p className="text-sm text-gray-600">
                Search Console graphs are what make this page credible. Add as many as you like
                — the first one is the card thumbnail, and the rest appear in the gallery on the
                case study page.
              </p>

              <div className="space-y-4">
                {screenshots.map((shot, index) => (
                  <div
                    key={`${shot.url}-${index}`}
                    className="flex gap-4 rounded-lg border border-gray-200 p-3"
                  >
                    <div className="flex flex-shrink-0 flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                        aria-label="Move earlier"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <span className="text-xs tabular-nums text-gray-400">{index + 1}</span>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === screenshots.length - 1}
                        className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
                        aria-label="Move later"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>

                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={shot.url}
                      alt=""
                      className="h-20 w-32 flex-shrink-0 rounded border border-gray-100 object-cover"
                    />

                    <div className="flex-1">
                      <input
                        className={inputClass}
                        value={shot.caption}
                        placeholder="Caption, e.g. Clicks over the last 12 months"
                        onChange={(event) =>
                          setScreenshots((current) =>
                            current.map((item, position) =>
                              position === index
                                ? { ...item, caption: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                      {index === 0 && (
                        <span className="mt-1 block text-xs text-blue-600">Card thumbnail</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setScreenshots((current) =>
                          current.filter((_, position) => position !== index)
                        )
                      }
                      className="self-start rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      aria-label="Remove screenshot"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {screenshots.length < MAX_CASE_STUDY_SCREENSHOTS ? (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-6 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-5 w-5" />
                  )}
                  {uploadProgress
                    ? `Uploading ${uploadProgress.done + 1} of ${uploadProgress.total}…`
                    : 'Add screenshots — you can pick several at once'}
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handleScreenshotUpload}
                    disabled={uploading}
                  />
                </label>
              ) : (
                <p className="rounded-lg border border-dashed border-gray-300 py-4 text-center text-sm text-gray-500">
                  That is all {MAX_CASE_STUDY_SCREENSHOTS} screenshots. Remove one to add
                  another.
                </p>
              )}

              {/* Works whether or not Firebase Storage is switched on, and lets you
                  reuse images that already live somewhere else. */}
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={pastedUrl}
                  onChange={(event) => setPastedUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addPastedUrl();
                    }
                  }}
                  placeholder="…or paste image URLs, separated by spaces or commas"
                />
                <button
                  type="button"
                  onClick={addPastedUrl}
                  disabled={!pastedUrl.trim()}
                  className="flex-shrink-0 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="The store">
              <Field label="Store name *">
                <input
                  className={inputClass}
                  value={form.storeName}
                  onChange={(event) => set('storeName', event.target.value)}
                />
              </Field>
              <Field label="Store URL">
                <input
                  className={inputClass}
                  type="url"
                  value={form.storeUrl}
                  onChange={(event) => set('storeUrl', event.target.value)}
                  placeholder="https://"
                />
              </Field>
              <Field label="Industry">
                <input
                  className={inputClass}
                  value={form.industry}
                  onChange={(event) => set('industry', event.target.value)}
                  placeholder="Home & garden"
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Working since">
                  <input
                    className={inputClass}
                    type="month"
                    value={form.startDate}
                    onChange={(event) => set('startDate', event.target.value)}
                  />
                </Field>
                <Field label="Until">
                  <input
                    className={inputClass}
                    type="month"
                    value={form.endDate}
                    min={form.startDate || undefined}
                    onChange={(event) => set('endDate', event.target.value)}
                  />
                </Field>
              </div>
              <p className="text-xs text-gray-500">
                {engagementPreview
                  ? `Shown as “${engagementPreview}”.`
                  : 'Add a start date to show how long you have worked together.'}
                {isActive && ' They will be marked as an active client.'}
              </p>
              <Field label="Logo">
                <div className="flex items-center gap-3">
                  {logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logoUrl}
                      alt=""
                      className="h-12 w-12 rounded border border-gray-200 object-contain"
                    />
                  )}
                  <label className="cursor-pointer rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    {logoUrl ? 'Replace' : 'Upload'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={uploading}
                    />
                  </label>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl('')}
                      className="text-sm text-gray-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </Field>
            </Panel>

            <Panel title="The numbers">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Clicks before">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={form.clicksBefore}
                    onChange={(event) => set('clicksBefore', event.target.value)}
                  />
                </Field>
                <Field label="Clicks after">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={form.clicksAfter}
                    onChange={(event) => set('clicksAfter', event.target.value)}
                  />
                </Field>
                <Field label="Impressions before">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={form.impressionsBefore}
                    onChange={(event) => set('impressionsBefore', event.target.value)}
                  />
                </Field>
                <Field label="Impressions after">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={form.impressionsAfter}
                    onChange={(event) => set('impressionsAfter', event.target.value)}
                  />
                </Field>
                <Field label="Articles published">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={form.articlesPublished}
                    onChange={(event) => set('articlesPublished', event.target.value)}
                  />
                </Field>
                <Field label="Keywords on page 1">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={form.keywordsOnPageOne}
                    onChange={(event) => set('keywordsOnPageOne', event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Period covered" hint="Shown next to the numbers, e.g. Last 6 months">
                <input
                  className={inputClass}
                  value={form.periodLabel}
                  onChange={(event) => set('periodLabel', event.target.value)}
                />
              </Field>
              <p className="text-xs text-gray-500">
                Leave a field blank to hide it. Growth percentages are worked out from the
                before and after pair, so a missing &ldquo;before&rdquo; simply shows the plain
                figure.
              </p>
            </Panel>

            <Panel title="Publishing">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.verified}
                  onChange={(event) => set('verified', event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm">
                  <span className="font-medium text-gray-900">Verified results</span>
                  <span className="mt-0.5 block text-gray-500">
                    Only tick this once you have seen the Search Console data yourself. It puts
                    a &ldquo;Verified results&rdquo; badge on the public page.
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(event) => set('featured', event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm">
                  <span className="font-medium text-gray-900">Feature this one</span>
                  <span className="mt-0.5 block text-gray-500">
                    Featured case studies sort to the top of the results page.
                  </span>
                </span>
              </label>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
