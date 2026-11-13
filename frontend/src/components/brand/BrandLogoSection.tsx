'use client';

import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { thumbnailApi, useAuthedImage } from '@/lib/thumbnail/client';
import type { BrandLogoStyle } from '@/lib/thumbnail/design';

const assetUrl = (path: string) => `/api/thumbnails/asset?path=${encodeURIComponent(path)}`;

const MODES: { value: BrandLogoStyle['mode']; label: string; short: string }[] = [
  { value: 'image', label: 'Logo image', short: 'Logo' },
  { value: 'text', label: 'Brand name', short: 'Name' },
  { value: 'none', label: 'None', short: 'None' },
];

export interface BrandLogo {
  path: string | null;
  style: BrandLogoStyle | null;
}

/**
 * The logo every new thumbnail for this brand starts with, the same one the thumbnail
 * editor saves to. Saved straight away, separately from any surrounding form. Remount
 * with a `key` when the brand changes.
 */
export default function BrandLogoSection({
  brandId,
  brandName,
  logoPath,
  logoStyle,
  compact = false,
  onChange,
}: {
  brandId?: string;
  brandName: string;
  logoPath?: string;
  logoStyle?: BrandLogoStyle;
  /** A single row, for the thumbnail studio's side panel. */
  compact?: boolean;
  onChange?: (logo: BrandLogo) => void;
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

  const commit = (next: BrandLogo) => {
    setPath(next.path);
    setStyle(next.style);
    onChange?.(next);
  };

  const upload = async (file: File) => {
    if (!user) return;
    setBusy('upload');
    try {
      const form = new FormData();
      form.append('brandId', brandId);
      form.append('file', file);
      const result = await thumbnailApi<{ path: string }>(user, '/api/thumbnails/logo', { method: 'POST', body: form });
      commit({ path: result.path, style: { text: style?.text || brandName, scale: style?.scale ?? 1, mode: 'image' } });
      toast.success(`Logo saved to ${brandName || 'your brand'} profile. New thumbnails will use it.`);
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
      commit({ path: null, style: style?.mode === 'image' ? { ...style, mode: 'text' } : style });
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
      commit({ path, style: updated });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  const fileInput = (
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
  );

  const modePicker = (
    <div className={`inline-flex rounded-lg bg-gray-100 p-0.5 ${compact ? 'w-full' : ''}`} role="radiogroup" aria-label="Logo on new thumbnails">
      {MODES.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          onClick={() => chooseMode(option.value)}
          disabled={busy !== null}
          className={`rounded-md px-3 py-1 text-xs font-medium transition disabled:opacity-60 ${compact ? 'flex-1' : ''} ${
            mode === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {compact ? option.short : option.label}
        </button>
      ))}
    </div>
  );

  const swatch = (size: string, img: string) => (
    <div
      className={`flex flex-shrink-0 items-center justify-center rounded-lg bg-[repeating-conic-gradient(#f3f4f6_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] ring-1 ring-gray-200 ${size}`}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt={`${brandName || 'Brand'} logo`} className={`object-contain ${img}`} />
      ) : (
        <ImagePlus className="h-5 w-5 text-gray-300" />
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy !== null}
          title={path ? 'Replace the logo' : 'Upload a logo'}
          className="relative rounded-lg disabled:opacity-60"
        >
          {swatch('h-10 w-16', 'max-h-8 max-w-[3.5rem]')}
          {busy === 'upload' && (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          {modePicker}
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            <Upload className="h-3 w-3" />
            {path ? 'Replace logo' : 'Upload logo'}
          </button>
        </div>
        {fileInput}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      {swatch('h-20 w-32', 'max-h-16 max-w-[7rem]')}

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
          {fileInput}
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-gray-500">On new thumbnails, show</span>
          {modePicker}
        </div>
        <p className="text-xs text-gray-500">PNG with a transparent background works best. Size and placement can be fine-tuned in the thumbnail editor.</p>
      </div>
    </div>
  );
}
