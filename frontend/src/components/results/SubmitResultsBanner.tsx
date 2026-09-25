'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ImagePlus, Loader2, Send, Trophy, X } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';

interface FormState {
  name: string;
  storeName: string;
  storeUrl: string;
  clicksBefore: string;
  clicksAfter: string;
  impressionsBefore: string;
  impressionsAfter: string;
  periodLabel: string;
  message: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  storeName: '',
  storeUrl: '',
  clicksBefore: '',
  clicksAfter: '',
  impressionsBefore: '',
  impressionsAfter: '',
  periodLabel: '',
  message: '',
};

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

const inputClass =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500';

// Matches the cap the /api/results/submit route enforces server-side.
const MAX_SCREENSHOTS = 6;

export default function SubmitResultsBanner() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const set = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0 || !user) return;

    const room = MAX_SCREENSHOTS - screenshots.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_SCREENSHOTS} images.`);
      return;
    }
    if (files.length > room) {
      toast.error(`Only the first ${room} will be added — the limit is ${MAX_SCREENSHOTS}.`);
    }

    setUploading(true);
    const added: string[] = [];
    try {
      const token = await user.getIdToken();
      for (const [index, file] of files.slice(0, room).entries()) {
        setProgress({ done: index, total: Math.min(files.length, room) });
        const data = new FormData();
        data.append('file', file);
        const response = await fetch('/api/results/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: data,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Upload failed');
        added.push(result.url);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      // Whatever succeeded before the failure is still worth keeping.
      if (added.length > 0) setScreenshots((current) => [...current, ...added]);
      setProgress(null);
      setUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    if (!form.storeName.trim()) {
      toast.error('Tell us which store this is for.');
      return;
    }

    setSending(true);
    try {
      const response = await fetch('/api/results/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          name: form.name,
          storeName: form.storeName,
          storeUrl: form.storeUrl,
          message: form.message,
          screenshots,
          metrics: {
            clicksBefore: form.clicksBefore,
            clicksAfter: form.clicksAfter,
            impressionsBefore: form.impressionsBefore,
            impressionsAfter: form.impressionsAfter,
            periodLabel: form.periodLabel,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Something went wrong');

      toast.success('Thanks! We will review your results and get in touch.');
      setForm(EMPTY_FORM);
      setScreenshots([]);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-gray-900 p-8 text-white shadow-xl sm:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(110% 75% at 50% -15%, rgba(96, 165, 250, 0.28), rgba(96, 165, 250, 0) 70%), ' +
              'linear-gradient(to bottom, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0) 45%)',
          }}
        />

        <div className="relative z-10 mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur-sm">
            <Trophy className="h-4 w-4 text-blue-300" />
            Your turn
          </span>

          <h2 className="mt-6 text-3xl font-bold sm:text-4xl">Grown your traffic with our tools?</h2>
          <p className="mt-4 text-gray-300">
            Send us your Search Console numbers and we will put your store in front of everyone
            reading this page. We review every submission before publishing anything.
          </p>

          <div className="mt-8">
            {loading ? (
              <span className="text-sm text-gray-400">Checking your account…</span>
            ) : user ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-400 px-6 py-3 font-medium text-white shadow-lg transition-all hover:from-blue-700 hover:to-blue-500 hover:shadow-xl"
              >
                Submit your results
                <Send className="h-4 w-4" />
              </button>
            ) : (
              <div className="space-y-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-400 px-6 py-3 font-medium text-white shadow-lg transition-all hover:from-blue-700 hover:to-blue-500"
                >
                  Sign in to submit your results
                  <Send className="h-4 w-4" />
                </Link>
                <p className="text-xs text-gray-400">
                  We ask you to sign in so we can tie the numbers to a real account.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Portalled to the body. The site header is fixed with a backdrop blur, and a
          dialog left inside the page content renders beneath it however high its
          z-index goes. */}
      {open &&
        user &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-results-title"
          >
          <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h3 id="submit-results-title" className="text-lg font-semibold text-gray-900">
                Submit your results
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name">
                  <input
                    className={inputClass}
                    value={form.name}
                    onChange={(event) => set('name', event.target.value)}
                    placeholder="Alex Rivera"
                  />
                </Field>
                <Field label="Store name *">
                  <input
                    className={inputClass}
                    value={form.storeName}
                    onChange={(event) => set('storeName', event.target.value)}
                    placeholder="Posh Cave"
                    required
                  />
                </Field>
              </div>

              <Field label="Store URL">
                <input
                  className={inputClass}
                  value={form.storeUrl}
                  onChange={(event) => set('storeUrl', event.target.value)}
                  placeholder="https://yourstore.com"
                  type="url"
                />
              </Field>

              <fieldset className="rounded-lg border border-gray-200 p-4">
                <legend className="px-2 text-sm font-medium text-gray-700">
                  Search Console numbers
                </legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Clicks before">
                    <input
                      className={inputClass}
                      value={form.clicksBefore}
                      onChange={(event) => set('clicksBefore', event.target.value)}
                      inputMode="numeric"
                      placeholder="120"
                    />
                  </Field>
                  <Field label="Clicks now">
                    <input
                      className={inputClass}
                      value={form.clicksAfter}
                      onChange={(event) => set('clicksAfter', event.target.value)}
                      inputMode="numeric"
                      placeholder="4,800"
                    />
                  </Field>
                  <Field label="Impressions before">
                    <input
                      className={inputClass}
                      value={form.impressionsBefore}
                      onChange={(event) => set('impressionsBefore', event.target.value)}
                      inputMode="numeric"
                      placeholder="3,400"
                    />
                  </Field>
                  <Field label="Impressions now">
                    <input
                      className={inputClass}
                      value={form.impressionsAfter}
                      onChange={(event) => set('impressionsAfter', event.target.value)}
                      inputMode="numeric"
                      placeholder="96,000"
                    />
                  </Field>
                </div>
                <div className="mt-4">
                  <Field label="Over what period?" hint="For example: the last 6 months">
                    <input
                      className={inputClass}
                      value={form.periodLabel}
                      onChange={(event) => set('periodLabel', event.target.value)}
                      placeholder="Last 6 months"
                    />
                  </Field>
                </div>
              </fieldset>

              <Field
                label={`Screenshots${screenshots.length > 0 ? ` (${screenshots.length} of ${MAX_SCREENSHOTS})` : ''}`}
                hint={`A Search Console performance graph makes your submission far more likely to be published. You can attach up to ${MAX_SCREENSHOTS}, and pick several at once.`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  {screenshots.map((url, index) => (
                    // Keyed by position as well as URL: the same image added twice would
                    // otherwise collide, and removing one copy would drop both.
                    <div key={`${url}-${index}`} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Uploaded screenshot ${index + 1}`}
                        className="h-20 w-28 rounded-md border border-gray-200 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setScreenshots((current) =>
                            current.filter((_, position) => position !== index)
                          )
                        }
                        className="absolute -right-2 -top-2 rounded-full bg-gray-900 p-1 text-white"
                        aria-label="Remove screenshot"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  {screenshots.length < MAX_SCREENSHOTS && (
                    <label className="flex h-20 w-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-gray-300 text-center text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600">
                      {uploading ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          {progress && `${progress.done + 1} of ${progress.total}`}
                        </>
                      ) : (
                        <>
                          <ImagePlus className="h-5 w-5" />
                          Add images
                        </>
                      )}
                      <input
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={handleUpload}
                        disabled={uploading}
                      />
                    </label>
                  )}
                </div>
              </Field>

              <Field label="Anything else we should know?">
                <textarea
                  className={inputClass}
                  rows={4}
                  value={form.message}
                  onChange={(event) => set('message', event.target.value)}
                  placeholder="What you were struggling with, what changed, how long it took."
                />
              </Field>

              <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || uploading}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send results
                </button>
              </div>
            </form>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
