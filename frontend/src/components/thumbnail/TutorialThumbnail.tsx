'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Download, ImageIcon, Pencil, ShoppingBag, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { track } from '@/lib/analytics';
import { ensureThumbnailFont, thumbnailApi } from '@/lib/thumbnail/client';
import { defaultDesign, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from '@/lib/thumbnail/design';
import { drawThumbnail } from '@/lib/thumbnail/render';
import type { ThumbnailRecord } from '@/lib/thumbnail/types';

export interface TutorialThumbnailArticle {
  blogId: string;
  brandId: string;
  title: string;
  keyword?: string | null;
  brandName?: string;
  brandColor?: string;
}

interface Props extends TutorialThumbnailArticle {
  /** Called with the public image once the thumbnail is set as the featured image. */
  onReady?: (image: { src: string; alt: string }) => void;
}

const PENDING_KEY = 'tutorial-thumbnail:pending';
const startedKey = (blogId: string) => `tutorial-thumbnail:${blogId}`;

/** The tutorial article a free account was offered a thumbnail for, kept until they upgrade or decline. */
export function pendingTutorialThumbnail(): TutorialThumbnailArticle | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as TutorialThumbnailArticle) : null;
  } catch {
    return null;
  }
}

const clearPending = () => localStorage.removeItem(PENDING_KEY);

/**
 * The tutorial's first article comes with a thumbnail on a paid plan. Free accounts see
 * a mock-up of it drawn in the browser, never an image generation, and an upgrade offer;
 * once they upgrade, the thumbnail is made for that same article.
 */
export default function TutorialThumbnail({ onReady, ...article }: Props) {
  const { blogId, brandId, title, keyword, brandName, brandColor } = article;
  const { user } = useAuth();
  const [state, setState] = useState<'checking' | 'making' | 'upsell' | 'ready' | 'hidden'>('checking');
  const [thumbnail, setThumbnail] = useState<ThumbnailRecord | null>(null);
  const [studio, setStudio] = useState(false);
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
          localStorage.setItem(PENDING_KEY, JSON.stringify(article));
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
              body: JSON.stringify({ tutorial: true, brandId, title, keyword, target: { kind: 'blog', blogId } }),
            })
          ).thumbnail;
          track('tutorial_thumbnail_ready');
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

  useEffect(() => {
    if (state !== 'upsell') return;
    let cancelled = false;
    ensureThumbnailFont().then(() => {
      const ctx = mockRef.current?.getContext('2d');
      if (!ctx || cancelled) return;
      drawThumbnail(ctx, defaultDesign({ title, brandName, brandColor }));
    });
    return () => {
      cancelled = true;
    };
  }, [state, title, brandName, brandColor]);

  if (state === 'hidden' || state === 'checking') return null;

  const dismiss = () => {
    clearPending();
    track('tutorial_thumbnail_upsell_dismissed');
    setState('hidden');
  };

  return (
    <div className="relative mb-4 overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm">
      {state === 'upsell' && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="No thanks"
          className="absolute right-2 top-2 rounded-md p-1 text-gray-400 hover:bg-white/70 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,18rem)_1fr] sm:items-center">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-white ring-1 ring-blue-100">
          {state === 'upsell' ? (
            <>
              <canvas ref={mockRef} width={THUMBNAIL_WIDTH} height={THUMBNAIL_HEIGHT} className="block h-full w-full" />
              <div className="absolute inset-y-0 left-0 flex w-[58%] flex-col items-center justify-center gap-1 text-center text-[11px] font-medium text-gray-600">
                <ImageIcon className="h-5 w-5" />
                A photo made for your topic
              </div>
            </>
          ) : state === 'making' || !thumbnail ? (
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

        <div className="min-w-0 pr-6">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <Sparkles className="h-3.5 w-3.5" /> {state === 'upsell' ? 'Add a thumbnail to this article' : 'Your article’s thumbnail'}
          </p>
          {state === 'upsell' ? (
            <>
              <h3 className="mt-1 font-semibold text-gray-900">Want a thumbnail with this article?</h3>
              <p className="mt-1 text-sm text-gray-600">
                Upgrade now and we&apos;ll make it for this article straight away, then with every article after.
              </p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                <li className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-blue-600" /> A photo made for the topic, your title and brand colour</li>
                <li className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-blue-600" /> Set as the featured image and pushed to Shopify</li>
              </ul>
              <Link
                href="/pricing"
                onClick={() => track('tutorial_thumbnail_upgrade_click')}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                Upgrade to get it <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : state === 'making' ? (
            <>
              <h3 className="mt-1 font-semibold text-gray-900">We&apos;re making a featured image to match</h3>
              <p className="mt-1 text-sm text-gray-600">A photo for the topic, your brand colour, the title and your name, sized for your blog. About 30 seconds.</p>
            </>
          ) : (
            <>
              <h3 className="mt-1 font-semibold text-gray-900">Thumbnail ready and set as the featured image</h3>
              <p className="mt-1 text-sm text-gray-600">It goes to Shopify with the article.</p>
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
