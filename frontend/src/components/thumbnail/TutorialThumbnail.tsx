'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Download, ImageIcon, Lock, Pencil, ShoppingBag, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { track } from '@/lib/analytics';
import { thumbnailApi, useAuthedImage } from '@/lib/thumbnail/client';
import type { ThumbnailRecord } from '@/lib/thumbnail/types';

interface Props {
  blogId: string;
  brandId: string;
  title: string;
  keyword?: string | null;
  /** Called with the public image once the thumbnail is usable as the featured image. */
  onReady?: (image: { src: string; alt: string }) => void;
}

const startedKey = (blogId: string) => `tutorial-thumbnail:${blogId}`;

/**
 * The tutorial's first article comes with a real thumbnail. Accounts without a paid plan
 * see it locked: the preview shows what they would get, and using it needs an upgrade.
 */
export default function TutorialThumbnail({ blogId, brandId, title, keyword, onReady }: Props) {
  const { user } = useAuth();
  const [state, setState] = useState<'making' | 'ready' | 'hidden'>('making');
  const [thumbnail, setThumbnail] = useState<ThumbnailRecord | null>(null);
  const started = useRef(false);
  const preview = useAuthedImage(user, thumbnail && !thumbnail.imageUrl ? thumbnail.previewUrl : null);
  const src = thumbnail?.imageUrl ?? preview;

  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    (async () => {
      try {
        // A reload finds the one already made rather than asking for a second.
        const existing = await thumbnailApi<{ thumbnails: ThumbnailRecord[] }>(user, `/api/thumbnails?blogId=${encodeURIComponent(blogId)}`);
        let made = existing.thumbnails[0] ?? null;
        if (!made) {
          if (sessionStorage.getItem(startedKey(blogId))) return setState('hidden');
          sessionStorage.setItem(startedKey(blogId), '1');
          made = (
            await thumbnailApi<{ thumbnail: ThumbnailRecord }>(user, '/api/thumbnails', {
              method: 'POST',
              body: JSON.stringify({ tutorial: true, brandId, title, keyword, target: { kind: 'blog', blogId } }),
            })
          ).thumbnail;
          track('tutorial_thumbnail_ready', { locked: made.locked });
        }
        setThumbnail(made);
        setState('ready');
        if (made.imageUrl) onReady?.({ src: made.imageUrl, alt: made.title });
      } catch {
        // Off for this account, or generation failed: the article stands on its own.
        setState('hidden');
      }
    })();
  }, [user, blogId, brandId, title, keyword, onReady]);

  if (state === 'hidden') return null;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm">
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,18rem)_1fr] sm:items-center">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-white ring-1 ring-blue-100">
          {state === 'making' || !src ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-blue-700">
              <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-blue-100 via-white to-blue-100" />
              <ImageIcon className="relative h-6 w-6" />
              <span className="relative font-medium">Designing your featured image…</span>
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- Storage or blob URL */}
              <img src={src} alt="" className={`h-full w-full object-cover ${thumbnail?.locked ? 'select-none' : ''}`} draggable={false} />
              {thumbnail?.locked && (
                <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-gray-900/75 px-2 py-0.5 text-[11px] font-medium text-white">
                  <Lock className="h-3 w-3" /> Preview
                </span>
              )}
            </>
          )}
        </div>

        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
            <Sparkles className="h-3.5 w-3.5" /> Bonus: a thumbnail for your article
          </p>
          {state === 'making' ? (
            <>
              <h3 className="mt-1 font-semibold text-gray-900">We&apos;re making a featured image to match</h3>
              <p className="mt-1 text-sm text-gray-600">A photo for the topic, your brand colour, the title and your name, sized for your blog. About 30 seconds.</p>
            </>
          ) : thumbnail?.locked ? (
            <>
              <h3 className="mt-1 font-semibold text-gray-900">Your article&apos;s thumbnail is ready</h3>
              <ul className="mt-2 space-y-1 text-sm text-gray-600">
                <li className="flex items-center gap-2"><Download className="h-4 w-4 text-blue-600" /> Download it full size</li>
                <li className="flex items-center gap-2"><Pencil className="h-4 w-4 text-blue-600" /> Edit the text, colours, photo and logo</li>
                <li className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-blue-600" /> Push it to Shopify with every article, automatically</li>
              </ul>
              <Link
                href="/#pricing"
                onClick={() => track('tutorial_thumbnail_upgrade_click')}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                <Lock className="h-4 w-4" /> Unlock thumbnails with a paid plan <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <>
              <h3 className="mt-1 font-semibold text-gray-900">Thumbnail ready and set as the featured image</h3>
              <p className="mt-1 text-sm text-gray-600">It goes to Shopify with the article. Adjust the text, colours or photo whenever you like.</p>
              <Link
                href="/dashboard/generate-thumbnail"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                <Pencil className="h-4 w-4" /> Open in Thumbnail studio
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
