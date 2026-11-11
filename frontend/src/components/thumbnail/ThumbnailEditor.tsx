'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { TokenUser as User } from '@/lib/thumbnail/client';
import toast from 'react-hot-toast';
import { BadgeCheck, ChevronDown, Download, ImagePlus, Loader2, RefreshCw, Save, Shuffle, Upload, X } from 'lucide-react';
import {
  THUMBNAIL_HEIGHT,
  THUMBNAIL_LAYOUTS,
  THUMBNAIL_WIDTH,
  layoutColors,
  sameLogoStyle,
  type BrandLogoStyle,
  type ThumbnailDesign,
  type ThumbnailLayout,
} from '@/lib/thumbnail/design';
import { drawThumbnail, type ThumbnailImage } from '@/lib/thumbnail/render';
import { ensureThumbnailFont, loadAuthedImage, loadFileImage, thumbnailApi } from '@/lib/thumbnail/client';
import type { ThumbnailRecord, ThumbnailTarget } from '@/lib/thumbnail/types';

export interface LinkOption {
  value: string;
  label: string;
  group: 'app' | 'shopify';
  target: ThumbnailTarget;
}

export const targetValue = (target: ThumbnailTarget | null) =>
  !target ? '' : target.kind === 'blog' ? `blog:${target.blogId}` : `shopify:${target.shopifyBlogId}:${target.articleId}`;

interface Props {
  user: User;
  thumbnail: ThumbnailRecord;
  brandColor?: string;
  logoUrl: string | null;
  /** The brand profile's saved logo, which new thumbnails start from. */
  logoStyle: BrandLogoStyle | null;
  brandName?: string;
  links: LinkOption[];
  onClose: () => void;
  onSaved: (thumbnail: ThumbnailRecord) => void;
  onLogoUploaded: (logoUrl: string) => void;
  onLogoStyleSaved: (style: BrandLogoStyle) => void;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        {hint && <span className="text-[11px] tabular-nums text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="grid rounded-lg bg-gray-100 p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
            value === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ value, min, max, step, onChange }: { value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-blue-600"
    />
  );
}

function ColorField({ value, onChange, swatches }: { value: string; onChange: (value: string) => void; swatches: string[] }) {
  return (
    <div className="flex items-center gap-2">
      <label className="relative h-8 w-8 flex-shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-gray-300">
        <span className="absolute inset-0" style={{ background: value }} />
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {swatches.map((swatch) => (
          <button
            key={swatch}
            type="button"
            aria-label={`Use ${swatch}`}
            onClick={() => onChange(swatch)}
            className={`h-6 w-6 rounded-full ring-1 ring-inset ring-black/10 ${value.toLowerCase() === swatch.toLowerCase() ? 'outline outline-2 outline-offset-1 outline-blue-500' : ''}`}
            style={{ background: swatch }}
          />
        ))}
      </div>
    </div>
  );
}

/** The design as it would look in another layout, with that layout's readable colours. */
export function inLayout(design: ThumbnailDesign, layout: ThumbnailLayout): ThumbnailDesign {
  if (design.layout === layout) return design;
  const colors = layoutColors(layout, design.panelColor);
  return { ...design, layout, textColor: colors.textColor, logo: { ...design.logo, color: colors.logoColor } };
}

const PREVIEW_SCALE = 0.2;

const PANEL_LABELS: Record<ThumbnailLayout, string> = {
  'parts-plus': 'Panel',
  'bold-banner': 'Accent',
  'center-stage': 'Card',
  framed: 'Background',
};

function StyleOption({
  design,
  photo,
  logo,
  ready,
  active,
  label,
  onPick,
}: {
  design: ThumbnailDesign;
  photo: ThumbnailImage | null;
  logo: ThumbnailImage | null;
  ready: boolean;
  active: boolean;
  label: string;
  onPick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || !ready) return;
    ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    drawThumbnail(ctx, design, { photo, logo });
  }, [design, photo, logo, ready]);
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={`rounded-lg p-1 text-left transition ${active ? 'bg-blue-50 ring-2 ring-blue-500' : 'ring-1 ring-gray-200 hover:ring-gray-300'}`}
    >
      <canvas
        ref={ref}
        width={THUMBNAIL_WIDTH * PREVIEW_SCALE}
        height={THUMBNAIL_HEIGHT * PREVIEW_SCALE}
        className="block h-auto w-full rounded-md bg-gray-100"
      />
      <span className={`mt-1 block truncate px-0.5 text-[11px] font-medium ${active ? 'text-blue-700' : 'text-gray-600'}`}>{label}</span>
    </button>
  );
}

export default function ThumbnailEditor({
  user,
  thumbnail,
  brandColor,
  logoUrl,
  logoStyle,
  brandName,
  links,
  onClose,
  onSaved,
  onLogoUploaded,
  onLogoStyleSaved,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [design, setDesign] = useState<ThumbnailDesign>(thumbnail.design);
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const [link, setLink] = useState(targetValue(thumbnail.target));
  const [direction, setDirection] = useState('');
  const [steerOpen, setSteerOpen] = useState(false);
  const [busy, setBusy] = useState<'save' | 'photo' | 'logo' | 'logoStyle' | null>(null);
  const [dirty, setDirty] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  const patch = useCallback((change: Partial<ThumbnailDesign>) => {
    setDesign((current) => ({ ...current, ...change }));
    setDirty(true);
  }, []);
  const patchLogo = (change: Partial<ThumbnailDesign['logo']>) => patch({ logo: { ...design.logo, ...change } });
  const previewDesign = useDeferredValue(design);

  useEffect(() => {
    ensureThumbnailFont().then(() => setFontReady(true));
  }, []);

  useEffect(() => {
    if (!thumbnail.photoUrl) return;
    let cancelled = false;
    loadAuthedImage(user, thumbnail.photoUrl)
      .then((image) => !cancelled && setPhoto(image))
      .catch(() => toast.error('Could not load the photo'));
    return () => {
      cancelled = true;
    };
  }, [user, thumbnail.photoUrl]);

  useEffect(() => {
    if (!logoUrl) return setLogo(null);
    let cancelled = false;
    loadAuthedImage(user, logoUrl)
      .then((image) => !cancelled && setLogo(image))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, logoUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !fontReady) return;
    drawThumbnail(ctx, design, { photo, logo });
  }, [design, photo, logo, fontReady]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const swatches = useMemo(
    () => Array.from(new Set([brandColor, '#5cb85c', '#1e3a8a', '#111827', '#dc2626', '#f59e0b', '#ffffff'].filter((c): c is string => Boolean(c && /^#[0-9a-f]{6}$/i.test(c))))),
    [brandColor],
  );

  const pngBlob = () =>
    new Promise<Blob>((resolve, reject) =>
      canvasRef.current?.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the image'))), 'image/png'),
    );

  const save = async () => {
    setBusy('save');
    try {
      let saved = thumbnail;
      if (dirty || !thumbnail.imageUrl) {
        const form = new FormData();
        form.append('image', await pngBlob(), 'thumbnail.png');
        form.append('design', JSON.stringify(design));
        saved = (await thumbnailApi<{ thumbnail: ThumbnailRecord }>(user, `/api/thumbnails/${thumbnail.id}`, { method: 'PUT', body: form })).thumbnail;
      }
      if (link !== targetValue(thumbnail.target)) {
        const target = links.find((option) => option.value === link)?.target ?? null;
        saved = (
          await thumbnailApi<{ thumbnail: ThumbnailRecord }>(user, `/api/thumbnails/${thumbnail.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ target }),
          })
        ).thumbnail;
      }
      setDirty(false);
      onSaved(saved);
      toast.success(saved.target ? 'Saved and set as the article image' : 'Saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const newPhoto = async () => {
    setBusy('photo');
    try {
      if (dirty) {
        const form = new FormData();
        form.append('image', await pngBlob(), 'thumbnail.png');
        form.append('design', JSON.stringify(design));
        await thumbnailApi(user, `/api/thumbnails/${thumbnail.id}`, { method: 'PUT', body: form });
        setDirty(false);
      }
      const { thumbnail: fresh } = await thumbnailApi<{ thumbnail: ThumbnailRecord }>(user, `/api/thumbnails/${thumbnail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ regenerate: true, direction }),
      });
      if (fresh.photoUrl) setPhoto(await loadAuthedImage(user, fresh.photoUrl));
      onSaved(fresh);
      toast.success('New photo ready');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not make a new photo');
    } finally {
      setBusy(null);
    }
  };

  const uploadLogo = async (file: File) => {
    setBusy('logo');
    try {
      const form = new FormData();
      form.append('brandId', thumbnail.brandId);
      form.append('file', file);
      const { logoUrl: url } = await thumbnailApi<{ logoUrl: string }>(user, '/api/thumbnails/logo', { method: 'POST', body: form });
      setLogo(await loadFileImage(file));
      patchLogo({ mode: 'image' });
      onLogoUploaded(url);
      await saveLogoStyle({ ...design.logo, mode: 'image' }, true);
      toast.success(`Logo saved to ${brandName || 'your brand'} profile. New thumbnails will use it.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const saveLogoStyle = async (logoDesign: ThumbnailDesign['logo'], quiet = false) => {
    const style: BrandLogoStyle = { mode: logoDesign.mode, text: logoDesign.text, scale: logoDesign.scale };
    if (!quiet) setBusy('logoStyle');
    try {
      await thumbnailApi(user, '/api/thumbnails/logo', {
        method: 'PATCH',
        body: JSON.stringify({ brandId: thumbnail.brandId, style }),
      });
      onLogoStyleSaved(style);
      if (!quiet) toast.success(`Logo saved to ${brandName || 'your brand'} profile`);
    } catch (error) {
      if (quiet) throw error;
      toast.error(error instanceof Error ? error.message : 'Could not save the logo');
    } finally {
      if (!quiet) setBusy(null);
    }
  };
  const logoSaved = sameLogoStyle(design.logo, logoStyle);

  const download = async () => {
    const url = URL.createObjectURL(await pngBlob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(design.title || 'thumbnail').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/70 p-2 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit thumbnail"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-full w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-gray-900">Edit thumbnail</h2>
            <p className="truncate text-xs text-gray-500">{dirty ? 'Unsaved changes' : 'Changes show live; save to update the image and its article'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden">
          <div className="flex items-start justify-center bg-gray-100 p-4 sm:p-6 lg:items-center lg:overflow-y-auto">
            <div className="relative w-full">
              <canvas
                ref={canvasRef}
                width={THUMBNAIL_WIDTH}
                height={THUMBNAIL_HEIGHT}
                className="block h-auto w-full rounded-lg shadow-lg ring-1 ring-black/5"
              />
              <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5 sm:right-3 sm:top-3">
                <div className="flex overflow-hidden rounded-lg bg-white/95 text-sm font-medium text-gray-800 shadow-md ring-1 ring-black/10 backdrop-blur">
                  <button
                    type="button"
                    onClick={newPhoto}
                    disabled={busy !== null}
                    title="Make a new photo for this thumbnail"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busy === 'photo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Regenerate photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setSteerOpen((open) => !open)}
                    disabled={busy !== null}
                    aria-label="Describe the photo"
                    aria-expanded={steerOpen}
                    className="border-l border-gray-200 px-2 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronDown className={`h-4 w-4 transition ${steerOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {steerOpen && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      setSteerOpen(false);
                      newPhoto();
                    }}
                    className="flex w-72 max-w-[calc(100vw-3rem)] gap-1.5 rounded-lg bg-white p-1.5 shadow-lg ring-1 ring-black/10"
                  >
                    <input
                      autoFocus
                      value={direction}
                      onChange={(event) => setDirection(event.target.value)}
                      placeholder="e.g. close-up of a fryer filter pan"
                      className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <button type="submit" className="rounded-md bg-blue-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-blue-700">
                      Go
                    </button>
                  </form>
                )}
              </div>
              {(!fontReady || (thumbnail.photoUrl && !photo) || busy === 'photo') && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/60 text-sm text-gray-600 backdrop-blur-[1px]">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  {busy === 'photo' ? 'Making a new photo, about 30 seconds…' : 'Loading…'}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5 border-t border-gray-100 p-5 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <Field label="Style">
              <div className="grid grid-cols-2 gap-2">
                {THUMBNAIL_LAYOUTS.map((option) => (
                  <StyleOption
                    key={option.value}
                    design={inLayout(previewDesign, option.value)}
                    photo={photo}
                    logo={logo}
                    ready={fontReady}
                    active={design.layout === option.value}
                    label={option.label}
                    onPick={() => design.layout !== option.value && patch(inLayout(design, option.value))}
                  />
                ))}
              </div>
            </Field>

            <Field label="Title">
              <textarea
                value={design.title}
                onChange={(event) => patch({ title: event.target.value })}
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </Field>

            <Field label="Text size" hint={`${Math.round(design.textScale * 100)}%`}>
              <Slider value={design.textScale} min={0.6} max={1.3} step={0.05} onChange={(textScale) => patch({ textScale })} />
            </Field>

            <Field label={PANEL_LABELS[design.layout]}>
              <div className="space-y-3">
                {design.layout !== 'center-stage' && (
                  <div>
                    {design.layout !== 'parts-plus' && (
                      <div className="mb-1 text-[11px] text-gray-400">{design.layout === 'framed' ? 'Text side' : 'Headline side'}</div>
                    )}
                    <Segmented
                      value={design.panelSide}
                      options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]}
                      onChange={(panelSide) => patch({ panelSide })}
                    />
                  </div>
                )}
                {design.layout !== 'bold-banner' && (
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-gray-400">
                      <span>Width</span>
                      <span className="tabular-nums">{Math.round(design.panelWidth * 100)}%</span>
                    </div>
                    <Slider value={design.panelWidth} min={0.3} max={0.6} step={0.01} onChange={(panelWidth) => patch({ panelWidth })} />
                  </div>
                )}
                <ColorField
                  value={design.panelColor}
                  swatches={swatches}
                  onChange={(panelColor) => patch({ panelColor, textColor: layoutColors(design.layout, panelColor).textColor })}
                />
              </div>
            </Field>

            <Field label="Text colour">
              <ColorField value={design.textColor} swatches={['#111111', '#ffffff', '#fde047']} onChange={(textColor) => patch({ textColor })} />
            </Field>

            {design.layout === 'parts-plus' && (
            <Field label="Edge">
              <div className="space-y-2">
                <Segmented
                  value={design.edge}
                  options={[{ value: 'torn', label: 'Torn' }, { value: 'slant', label: 'Slant' }, { value: 'straight', label: 'Straight' }]}
                  onChange={(edge) => patch({ edge })}
                />
                {design.edge === 'torn' && (
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={design.paperStrip} onChange={(event) => patch({ paperStrip: event.target.checked })} className="rounded text-blue-600" />
                      Paper edge
                    </label>
                    <button
                      type="button"
                      onClick={() => patch({ edgeSeed: Math.floor(Math.random() * 100000) })}
                      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      <Shuffle className="h-3.5 w-3.5" /> New tear
                    </button>
                  </div>
                )}
              </div>
            </Field>
            )}

            <Field label="Photo">
              <div className="space-y-3">
                {[
                  { key: 'photoZoom' as const, label: 'Zoom', min: 1, max: 2.5, step: 0.05, show: `${design.photoZoom.toFixed(2)}x` },
                  { key: 'photoX' as const, label: 'Left / right', min: 0, max: 1, step: 0.01, show: `${Math.round(design.photoX * 100)}%` },
                  { key: 'photoY' as const, label: 'Up / down', min: 0, max: 1, step: 0.01, show: `${Math.round(design.photoY * 100)}%` },
                ].map((slider) => (
                  <div key={slider.key}>
                    <div className="mb-1 flex justify-between text-[11px] text-gray-400">
                      <span>{slider.label}</span>
                      <span className="tabular-nums">{slider.show}</span>
                    </div>
                    <Slider value={design[slider.key]} min={slider.min} max={slider.max} step={slider.step} onChange={(value) => patch({ [slider.key]: value })} />
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    value={direction}
                    onChange={(event) => setDirection(event.target.value)}
                    placeholder="Optional: what the photo should show"
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={newPhoto}
                    disabled={busy !== null}
                    className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busy === 'photo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    New photo
                  </button>
                </div>
              </div>
            </Field>

            <Field label="Logo">
              <div className="space-y-3">
                <Segmented
                  value={design.logo.mode}
                  options={[{ value: 'text', label: 'Text' }, { value: 'image', label: 'Image' }, { value: 'none', label: 'None' }]}
                  onChange={(mode) => (mode === 'image' && !logo ? logoInput.current?.click() : patchLogo({ mode }))}
                />
                {design.logo.mode === 'text' && (
                  <div className="flex items-center gap-2">
                    <input
                      value={design.logo.text}
                      onChange={(event) => patchLogo({ text: event.target.value })}
                      placeholder="Brand name"
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <label className="relative h-8 w-8 flex-shrink-0 cursor-pointer overflow-hidden rounded-md ring-1 ring-gray-300">
                      <span className="absolute inset-0" style={{ background: design.logo.color }} />
                      <input type="color" value={design.logo.color} onChange={(event) => patchLogo({ color: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
                    </label>
                  </div>
                )}
                {design.logo.mode !== 'none' && (
                  <div>
                    <div className="mb-1 flex justify-between text-[11px] text-gray-400">
                      <span>Size</span>
                      <span className="tabular-nums">{Math.round(design.logo.scale * 100)}%</span>
                    </div>
                    <Slider value={design.logo.scale} min={0.5} max={1.6} step={0.05} onChange={(scale) => patchLogo({ scale })} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => logoInput.current?.click()}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {busy === 'logo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : logo ? <Upload className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  {logo ? 'Replace logo image' : 'Upload a logo (PNG with transparency works best)'}
                </button>
                <div className="flex min-h-[2rem] items-center justify-between gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5 text-xs">
                  {logoSaved ? (
                    <span className="flex items-center gap-1.5 text-green-700">
                      <BadgeCheck className="h-3.5 w-3.5 flex-shrink-0" />
                      Saved to brand profile, used on new thumbnails
                    </span>
                  ) : (
                    <>
                      <span className="text-gray-500">{logoStyle ? 'Differs from your brand profile' : 'Not saved to your brand profile'}</span>
                      <button
                        type="button"
                        onClick={() => saveLogoStyle(design.logo)}
                        disabled={busy !== null}
                        className="inline-flex flex-shrink-0 items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {busy === 'logoStyle' && <Loader2 className="h-3 w-3 animate-spin" />}
                        Save to brand profile
                      </button>
                    </>
                  )}
                </div>
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) uploadLogo(file);
                    event.target.value = '';
                  }}
                />
              </div>
            </Field>

            <Field label="Article">
              <select
                value={link}
                onChange={(event) => setLink(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Not linked</option>
                {(['app', 'shopify'] as const).map((group) => {
                  const options = links.filter((option) => option.group === group);
                  return options.length ? (
                    <optgroup key={group} label={group === 'app' ? 'Your articles' : 'Already in Shopify'}>
                      {options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </select>
              <p className="mt-1 text-[11px] text-gray-400">Saving sets it as that article&apos;s featured image.</p>
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            <Download className="h-4 w-4" /> Download PNG
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy !== null || (!dirty && link === targetValue(thumbnail.target))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
