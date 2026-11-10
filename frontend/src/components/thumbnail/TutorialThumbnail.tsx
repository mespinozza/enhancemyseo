'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, ImageIcon, Pencil, Sparkles } from 'lucide-react';
import TutorialUpgrade from './TutorialUpgrade';
import { useAuth } from '@/lib/firebase/auth-context';
import { track } from '@/lib/analytics';
import { ensureThumbnailFont, thumbnailApi } from '@/lib/thumbnail/client';
import {
  defaultDesign,
  isLayout,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_LAYOUTS,
  THUMBNAIL_WIDTH,
  type ThumbnailLayout,
} from '@/lib/thumbnail/design';
import { drawThumbnail } from '@/lib/thumbnail/render';
import { samplePhoto } from '@/lib/thumbnail/sample';
import type { ThumbnailRecord } from '@/lib/thumbnail/types';
import {
  clearPendingTutorialThumbnail as clearPending,
  savePendingTutorialThumbnail as savePending,
  type TutorialThumbnailArticle,
} from '@/lib/thumbnail/tutorial-pending';

export { pendingTutorialThumbnail, type TutorialThumbnailArticle } from '@/lib/thumbnail/tutorial-pending';

interface Props extends TutorialThumbnailArticle {
  /** Called with the public image once the thumbnail is set as the featured image. */
  onReady?: (image: { src: string; alt: string }) => void;
}

const startedKey = (blogId: string) => `tutorial-thumbnail:${blogId}`;

/** A keyword as a headline, for the preview shown before the article has its title. */
const headline = (keyword: string) => keyword.replace(/\b\w/g, (c) => c.toUpperCase());

/** Draws the mock-up: the real title and brand colour over a stand-in photo. */
function useMockCanvas(
  ref: React.RefObject<HTMLCanvasElement | null>,
  input: { title: string; brandName?: string; brandColor?: string; layout: ThumbnailLayout; enabled: boolean },
) {
  const { title, brandName, brandColor, layout, enabled } = input;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    ensureThumbnailFont().then(() => {
      const ctx = ref.current?.getContext('2d');
      if (!ctx || cancelled) return;
      const design = defaultDesign({ title, brandName, brandColor, layout });
      drawThumbnail(ctx, design, { photo: samplePhoto(design.panelColor) });
    });
    return () => {
      cancelled = true;
    };
  }, [ref, title, brandName, brandColor, layout, enabled]);
}

/**
 * A first look while the tutorial article is being written: the topic as a thumbnail,
 * turning through the styles. It only plants the idea; the offer comes with the article.
 */
export function TutorialThumbnailTeaser({
  keyword,
  brandName,
  brandColor,
  paid,
}: {
  keyword: string;
  brandName?: string;
  brandColor?: string;
  paid: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((i) => (i + 1) % THUMBNAIL_LAYOUTS.length), 3200);
    return () => clearInterval(timer);
  }, []);
  useMockCanvas(ref, { title: headline(keyword), brandName, brandColor, layout: THUMBNAIL_LAYOUTS[index].value, enabled: true });

  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg bg-white/70 p-2.5 ring-1 ring-blue-100">
      <canvas
        ref={ref}
        width={THUMBNAIL_WIDTH}
        height={THUMBNAIL_HEIGHT}
        className="block aspect-video w-28 flex-shrink-0 rounded-md shadow-sm ring-1 ring-black/5 sm:w-36"
      />
      <p className="min-w-0 text-xs text-blue-900 sm:text-sm">
        <span className="block font-semibold">{paid ? 'A thumbnail is coming with it' : 'Coming up: your article’s thumbnail'}</span>
        <span className="mt-0.5 block text-blue-800/80">
          {paid
            ? 'Once the article is written, we’ll design its featured image with your title and brand colour.'
            : 'Once it’s written, you’ll see how it could look as a featured image on your blog.'}
        </span>
      </p>
    </div>
  );
}

/** The mock-up canvas with a "preview" chip, and the style picker under it. */
function ThumbnailMock({
  canvasRef,
  layout,
  onPick,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  layout: ThumbnailLayout;
  onPick: (layout: ThumbnailLayout) => void;
}) {
  return (
    <>
      <div className="relative overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-blue-100">
        <canvas ref={canvasRef} width={THUMBNAIL_WIDTH} height={THUMBNAIL_HEIGHT} className="block aspect-video h-auto w-full" />
        <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          <ImageIcon className="h-3 w-3" /> Preview: yours gets a photo made for this topic
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Thumbnail style">
        {THUMBNAIL_LAYOUTS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={layout === option.value}
            onClick={() => onPick(option.value)}
            className={`truncate rounded-md px-2 py-1 text-xs font-medium transition ${
              layout === option.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:ring-blue-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * The tutorial's last stop before writing, for free accounts: everything is in place for
 * the first article, and a plan would have it made with its thumbnail. Upgrading keeps the
 * topic and style for the return from checkout; skipping writes the article without one.
 */
export function TutorialReadyOffer({
  keyword,
  brandName,
  brandColor,
  ready,
  onSkip,
  onBack,
  onBeforeCheckout,
  cancelPath,
}: {
  keyword: string;
  brandName?: string;
  brandColor?: string;
  ready: string[];
  onSkip: () => void;
  onBack: () => void;
  onBeforeCheckout: (layout: ThumbnailLayout) => Promise<void>;
  cancelPath: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<ThumbnailLayout>('parts-plus');
  useMockCanvas(ref, { title: headline(keyword), brandName, brandColor, layout, enabled: true });
  useEffect(() => track('tutorial_ready_offer_shown'), []);

  return (
    <TutorialUpgrade
      variant="ready"
      ready={ready}
      preview={
        <ThumbnailMock
          canvasRef={ref}
          layout={layout}
          onPick={(value) => {
            setLayout(value);
            track('tutorial_thumbnail_style_pick', { layout: value, moment: 'ready' });
          }}
        />
      }
      onDismiss={() => {
        track('tutorial_ready_offer_skipped', { layout });
        onSkip();
      }}
      onBack={onBack}
      onBeforeCheckout={() => onBeforeCheckout(layout)}
      cancelPath={cancelPath}
    />
  );
}

/**
 * The tutorial's first article comes with a thumbnail on a paid plan. Free accounts see
 * a mock-up of it drawn in the browser, never an image generation, in the style they pick,
 * and an upgrade offer; once they upgrade, the thumbnail is made in that style for that article.
 */
export default function TutorialThumbnail({ onReady, ...article }: Props) {
  const { blogId, brandId, title, keyword, brandName, brandColor } = article;
  const { user } = useAuth();
  const [state, setState] = useState<'checking' | 'making' | 'upsell' | 'ready' | 'hidden'>('checking');
  const [thumbnail, setThumbnail] = useState<ThumbnailRecord | null>(null);
  const [studio, setStudio] = useState(false);
  const [layout, setLayout] = useState<ThumbnailLayout>(isLayout(article.layout) ? article.layout : 'parts-plus');
  const started = useRef(false);
  const mockRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    (async () => {
      try {
        // A reload finds the one already made rather than asking for a second.
        const existing = await thumbnailApi<{ thumbnails: ThumbnailRecord[]; paid: boolean; studio: boolean }>(
          user,
          `/api/thumbnails?blogId=${encodeURIComponent(blogId)}`,
        );
        setStudio(existing.studio);
        let made = existing.thumbnails.find((t) => !t.locked) ?? null;
        if (!made && !existing.paid) {
          savePending({ ...article, layout });
          track('tutorial_thumbnail_upsell_shown');
          return setState('upsell');
        }
        if (!made) {
          if (sessionStorage.getItem(startedKey(blogId))) return setState('hidden');
          sessionStorage.setItem(startedKey(blogId), '1');
          setState('making');
          made = (
            await thumbnailApi<{ thumbnail: ThumbnailRecord }>(user, '/api/thumbnails', {
              method: 'POST',
              body: JSON.stringify({ tutorial: true, brandId, title, keyword, layout, target: { kind: 'blog', blogId } }),
            })
          ).thumbnail;
          track('tutorial_thumbnail_ready', { layout });
        }
        clearPending();
        setThumbnail(made);
        setState('ready');
        if (made.imageUrl) onReady?.({ src: made.imageUrl, alt: made.title });
      } catch {
        // Already used, or generation failed: the article stands on its own.
        clearPending();
        setState('hidden');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per article
  }, [user, blogId]);

  useMockCanvas(mockRef, { title, brandName, brandColor, layout, enabled: state === 'upsell' });

  if (state === 'hidden' || state === 'checking') return null;

  const dismiss = () => {
    clearPending();
    track('tutorial_thumbnail_upsell_dismissed', { layout });
    setState('hidden');
  };

  const pickLayout = (value: ThumbnailLayout) => {
    setLayout(value);
    savePending({ ...article, layout: value });
    track('tutorial_thumbnail_style_pick', { layout: value });
  };

  if (state === 'upsell') {
    return (
      <TutorialUpgrade
        preview={<ThumbnailMock canvasRef={mockRef} layout={layout} onPick={pickLayout} />}
        stats={article.stats}
        onDismiss={dismiss}
      />
    );
  }

  return (
    <div className="relative mb-4 overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm">
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,18rem)_1fr] sm:items-center">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-white ring-1 ring-blue-100">
          {state === 'making' || !thumbnail ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-blue-700">
              <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-blue-100 via-white to-blue-100" />
              <ImageIcon className="relative h-6 w-6" />
              <span className="relative font-medium">Designing your featured image…</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- Storage URL
            <img src={thumbnail.imageUrl ?? ''} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <Sparkles className="h-3.5 w-3.5" /> Your article’s thumbnail
          </p>
          {state === 'making' ? (
            <>
              <h3 className="mt-1 font-semibold text-gray-900">We&apos;re making a featured image to match</h3>
              <p className="mt-1 text-sm text-gray-600">A photo for the topic, your brand colour, the title and your name, sized for your blog. About 30 seconds.</p>
            </>
          ) : (
            <>
              <h3 className="mt-1 font-semibold text-gray-900">Thumbnail ready and set as the featured image</h3>
              <p className="mt-1 text-sm text-gray-600">
                It goes to Shopify with the article.{studio ? ' Change the style, photo or colours any time in the Thumbnail studio.' : ''}
              </p>
              {studio ? (
                <Link
                  href="/dashboard/generate-thumbnail"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                  <Pencil className="h-4 w-4" /> Open in Thumbnail studio
                </Link>
              ) : (
                thumbnail?.imageUrl && (
                  <a
                    href={thumbnail.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    <Download className="h-4 w-4" /> Open full size
                  </a>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
