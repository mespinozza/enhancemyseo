'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { thumbnailApi, useAuthedImage } from '@/lib/thumbnail/client';
import type { BrandLogoStyle } from '@/lib/thumbnail/design';

const assetUrl = (path: string) => `/api/thumbnails/asset?path=${encodeURIComponent(path)}`;

const MODES: { value: BrandLogoStyle['mode']; label: string }[] = [
  { value: 'image', label: 'Logo image' },
  { value: 'text', label: 'Brand name' },
  { value: 'none', label: 'None' },
];

/**
 * The logo every new thumbnail for this brand starts with, the same one the thumbnail
 * editor saves to. Saved straight away, separately from the rest of the form.
 */
export default function BrandLogoSection({
  brandId,
  brandName,
  logoPath,
  logoStyle,
}: {
  brandId?: string;
  brandName: string;
  logoPath?: string;
  logoStyle?: BrandLogoStyle;
}) {
  const { user } = useAuth();
  const [path, setPath] = useState(logoPath ?? null);
  const [style, setStyle] = useState<BrandLogoStyle | null>(logoStyle ?? (logoPath ? { mode: 'image', text: brandName, scale: 1 } : null));
  const [busy, setBusy] = useState<'upload' | 'remove' | 'mode' | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const preview = useAuthedImage(user, path ? assetUrl(path) : null);
  const mode = style?.mode ?? (brandName ? 'text' : 'none');

  if (!brandId) {
    return <p className="text-sm text-gray-500">Save the profile first, then add a logo for your thumbnails.</p>;
  }

  const upload = async (file: File) => {
    if (!user) return;
    setBusy('upload');
    try {
      const form = new FormData();
      form.append('brandId', brandId);
      form.append('file', file);
      const result = await thumbnailApi<{ path: string }>(user, '/api/thumbnails/logo', { method: 'POST', body: form });
      setPath(result.path);
      setStyle((current) => ({ text: current?.text || brandName, scale: current?.scale ?? 1, mode: 'image' }));
      toast.success('Logo saved. New thumbnails will use it.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!user) return;
    setBusy('remove');
    try {
      await thumbnailApi(user, `/api/thumbnails/logo?brandId=${encodeURIComponent(brandId)}`, { method: 'DELETE' });
      setPath(null);
      setStyle((current) => (current?.mode === 'image' ? { ...current, mode: 'text' } : current));
      toast.success('Logo removed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove the logo');
    } finally {
      setBusy(null);
    }
  };

  const chooseMode = async (next: BrandLogoStyle['mode']) => {
    if (!user || next === mode) return;
    if (next === 'image' && !path) return input.current?.click();
    const updated: BrandLogoStyle = { text: style?.text || brandName, scale: style?.scale ?? 1, mode: next };
    setBusy('mode');
    try {
      await thumbnailApi(user, '/api/thumbnails/logo', { method: 'PATCH', body: JSON.stringify({ brandId, style: updated }) });
      setStyle(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex h-20 w-32 flex-shrink-0 items-center justify-center rounded-lg bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] ring-1 ring-gray-200">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`${brandName || 'Brand'} logo`} className="max-h-16 max-w-[7rem] object-contain" />
        ) : (
          <ImagePlus className="h-6 w-6 text-gray-300" />
        )}
      </div>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {path ? 'Replace logo' : 'Upload logo'}
          </button>
          {path && (
            <button
              type="button"
              onClick={remove}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-red-600 disabled:opacity-50"
            >
              {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file);
              event.target.value = '';
            }}
          />
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-gray-500">On new thumbnails, show</span>
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="radiogroup" aria-label="Logo on new thumbnails">
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                onClick={() => chooseMode(option.value)}
                disabled={busy !== null}
                className={`rounded-md px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${
                  mode === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-500">PNG with a transparent background works best. Size and placement can be fine-tuned in the thumbnail editor.</p>
      </div>
    </div>
  );
}
