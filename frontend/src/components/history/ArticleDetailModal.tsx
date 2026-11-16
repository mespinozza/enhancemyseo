'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Copy, Download, ImageIcon, Loader2, Lock, Pencil, Sparkles, X } from 'lucide-react';
import type { Blog, BrandProfile } from '@/lib/firebase/firestore';
import type { TokenUser } from '@/lib/thumbnail/client';
import { thumbnailApi, useAuthedImage } from '@/lib/thumbnail/client';
import type { ThumbnailRecord } from '@/lib/thumbnail/types';
import type { BrandLogoStyle } from '@/lib/thumbnail/design';
import { announceUsageChange } from '@/lib/allowance';
import StorefrontPreview from '@/components/article-preview/StorefrontPreview';
import ThumbnailEditor, { targetValue, type LinkOption } from '@/components/thumbnail/ThumbnailEditor';
import { ToneBadge } from '@/components/TonePicker';
import { ContentTypeBadge } from '@/components/ContentTypePicker';
import { highlightMatches } from './ArticlePreview';

interface Props {
  user: TokenUser;
  blog: Blog;
  brand?: BrandProfile;
  /** The plan includes the thumbnail studio. */
  canThumbnail: boolean;
  query?: string;
  onClose: () => void;
  onDownload: () => void;
  onCopy: () => void;
  /** The article changed here, e.g. a new featured image. */
  onBlogChange: (blog: Blog) => void;
  onBrandChange: (brand: BrandProfile) => void;
}

/** One article with its thumbnail, opened from a history card. */
export default function ArticleDetailModal({
  user,
  blog,
  brand,
  canThumbnail,
  query = '',
  onClose,
  onDownload,
  onCopy,
  onBlogChange,
  onBrandChange,
}: Props) {
  const [thumbnail, setThumbnail] = useState<ThumbnailRecord | null | undefined>(canThumbnail ? undefined : null);
  const [editing, setEditing] = useState(false);
  const [making, setMaking] = useState(false);
  const preview = useAuthedImage(user, thumbnail?.previewUrl);
  const imageSrc = preview ?? blog.seo?.featuredImage?.src ?? null;

  useEffect(() => {
    if (!canThumbnail || !blog.id || !blog.brandId) return;
    let cancelled = false;
    thumbnailApi<{ thumbnails: ThumbnailRecord[] }>(
      user,
      `/api/thumbnails?brandId=${encodeURIComponent(blog.brandId)}&blogId=${encodeURIComponent(blog.id)}`
    )
      .then(({ thumbnails }) => {
        if (cancelled) return;
        setThumbnail(thumbnails.find((t) => t.id === blog.thumbnailId) ?? thumbnails[0] ?? null);
      })
      .catch(() => !cancelled && setThumbnail(null));
    return () => {
      cancelled = true;
    };
  }, [user, canThumbnail, blog.id, blog.brandId, blog.thumbnailId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && !editing && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [editing, onClose]);

  const applyThumbnail = useCallback(
    (record: ThumbnailRecord) => {
      setThumbnail(record);
      if (record.imageUrl && record.target?.kind === 'blog' && record.target.blogId === blog.id) {
        onBlogChange({
          ...blog,
          thumbnailId: record.id,
          seo: { ...(blog.seo ?? { metaTitle: '', metaDescription: '', excerpt: '', tags: [] }), featuredImage: { src: record.imageUrl, alt: record.title } },
        });
      }
    },
    [blog, onBlogChange]
  );

  const makeThumbnail = async () => {
    if (!blog.id || !blog.brandId) return;
    setMaking(true);
    try {
      const { thumbnail: made } = await thumbnailApi<{ thumbnail: ThumbnailRecord }>(user, '/api/thumbnails', {
        method: 'POST',
        body: JSON.stringify({
          brandId: blog.brandId,
          title: blog.title,
          keyword: blog.keyword ?? '',
          target: { kind: 'blog', blogId: blog.id },
        }),
      });
      applyThumbnail(made);
      toast.success('Thumbnail made and set as the featured image');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not make a thumbnail');
    } finally {
      setMaking(false);
      announceUsageChange();
    }
  };

  const links: LinkOption[] = useMemo(
    () => (blog.id ? [{ value: targetValue({ kind: 'blog', blogId: blog.id }), label: blog.title, group: 'app', target: { kind: 'blog', blogId: blog.id } }] : []),
    [blog.id, blog.title]
  );
  const logoUrl = brand?.thumbnailLogoPath ? `/api/thumbnails/asset?path=${encodeURIComponent(brand.thumbnailLogoPath)}` : null;
  const logoStyle: BrandLogoStyle | null =
    brand?.thumbnailLogo ?? (brand?.thumbnailLogoPath ? { mode: 'image', text: brand.brandName ?? '', scale: 1 } : null);

  const html = useMemo(() => highlightMatches(blog.content ?? '', query), [blog.content, query]);
  const created = blog.createdAt?.toDate?.();
  const seo = blog.seo ? { ...blog.seo, featuredImage: null } : undefined;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-2 backdrop-blur-sm sm:p-4" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={blog.title}
          onClick={(event) => event.stopPropagation()}
          className="flex h-full max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          <header className="flex flex-wrap items-start gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-base font-semibold text-gray-900 sm:text-lg">{blog.title}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                <span className={`rounded-full px-2 py-0.5 font-medium capitalize ${blog.status === 'published' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {blog.status}
                </span>
                {blog.contentType && <ContentTypeBadge contentType={blog.contentType} />}
                {blog.toneOfVoice !== undefined && <ToneBadge tone={blog.toneOfVoice} />}
                {created && <span>{created.toLocaleDateString()}</span>}
                {brand?.brandName && <span className="truncate">· {brand.brandName}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {blog.content && blog.id && (
                <Link
                  href={`/dashboard/articles/${blog.id}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  <Pencil className="h-4 w-4" /> Edit article
                </Link>
              )}
              <button type="button" onClick={onDownload} title="Download" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600">
                <Download className="h-4 w-4" />
              </button>
              <button type="button" onClick={onCopy} title="Copy HTML" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600">
                <Copy className="h-4 w-4" />
              </button>
              <button type="button" onClick={onClose} title="Close" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[19rem_minmax(0,1fr)] lg:overflow-hidden">
            <aside className="space-y-4 border-b border-gray-100 bg-gray-50/70 p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Thumbnail</h3>
                <div className="relative aspect-video overflow-hidden rounded-xl bg-gray-100 ring-1 ring-gray-200">
                  {imageSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageSrc} alt={blog.seo?.featuredImage?.alt || blog.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-1 text-gray-400">
                      {thumbnail === undefined || making ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageIcon className="h-6 w-6" />}
                      <span className="text-xs">{making ? 'Making a thumbnail, about 30 seconds' : thumbnail === undefined ? 'Loading' : 'No thumbnail yet'}</span>
                    </div>
                  )}
                </div>

                {!canThumbnail ? (
                  <Link
                    href="/pricing"
                    className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:ring-blue-300"
                  >
                    <Lock className="h-4 w-4 text-gray-400" /> Thumbnails come with Kickstart
                  </Link>
                ) : thumbnail ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    disabled={!thumbnail.photoUrl}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50 disabled:opacity-50"
                  >
                    <Pencil className="h-4 w-4" /> Edit thumbnail
                  </button>
                ) : thumbnail === null ? (
                  <button
                    type="button"
                    onClick={makeThumbnail}
                    disabled={making || !blog.brandId}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                  >
                    {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {imageSrc ? 'Make a new thumbnail' : 'Make a thumbnail'}
                  </button>
                ) : null}
                {canThumbnail && thumbnail === null && <p className="mt-1.5 text-center text-[11px] text-gray-400">Uses one thumbnail photo</p>}
              </section>

              <section className="space-y-2 text-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Details</h3>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-[11px] font-medium text-gray-400">Keyword</dt>
                    <dd className="text-gray-800">{blog.keyword || 'Not specified'}</dd>
                  </div>
                  {blog.seo?.metaTitle && (
                    <div>
                      <dt className="text-[11px] font-medium text-gray-400">Meta title</dt>
                      <dd className="text-gray-800">{blog.seo.metaTitle}</dd>
                    </div>
                  )}
                  {blog.seo?.metaDescription && (
                    <div>
                      <dt className="text-[11px] font-medium text-gray-400">Meta description</dt>
                      <dd className="text-gray-600">{blog.seo.metaDescription}</dd>
                    </div>
                  )}
                  {blog.seo?.tags?.length ? (
                    <div>
                      <dt className="text-[11px] font-medium text-gray-400">Tags</dt>
                      <dd className="mt-1 flex flex-wrap gap-1">
                        {blog.seo.tags.map((tag) => (
                          <span key={tag} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-600 ring-1 ring-gray-200">
                            {tag}
                          </span>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            </aside>

            <div className="min-w-0 p-3 sm:p-4 lg:overflow-y-auto">
              {blog.content ? (
                <StorefrontPreview
                  title={blog.title}
                  html={html}
                  seo={seo}
                  domain={brand?.shopifyStoreUrl || brand?.websiteUrl}
                  author={brand?.shopifyAuthor || brand?.brandName}
                  date={created}
                />
              ) : (
                <p className="py-12 text-center text-sm text-gray-500">This article has no content yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {editing && thumbnail && (
        <ThumbnailEditor
          user={user}
          thumbnail={thumbnail}
          brandColor={brand?.brandColor}
          logoUrl={logoUrl}
          logoStyle={logoStyle}
          brandName={brand?.brandName}
          links={links}
          onClose={() => setEditing(false)}
          onSaved={applyThumbnail}
          onLogoUploaded={(url) => {
            const path = new URL(url, window.location.origin).searchParams.get('path') ?? undefined;
            if (brand) onBrandChange({ ...brand, thumbnailLogoPath: path });
          }}
          onLogoStyleSaved={(style) => brand && onBrandChange({ ...brand, thumbnailLogo: style })}
        />
      )}
    </>
  );
}
