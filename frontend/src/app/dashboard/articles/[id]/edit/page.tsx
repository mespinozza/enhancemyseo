'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { blogOperations, brandProfileOperations } from '@/lib/firebase/firestore';
import ArticleEditor from '@/components/article-editor/ArticleEditor';

export default function ArticleEditPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const articleId = params.id as string;

  const {
    data: article,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['article-edit', articleId],
    queryFn: async () => {
      if (!user?.uid) throw new Error('You are not signed in.');

      const blog = await blogOperations.getBlogById(user.uid, articleId);
      if (!blog) throw new Error('Article not found.');

      // The blogs collection also holds admin marketing posts, which have a very
      // different shape and must not be opened in the article editor.
      const asRecord = blog as unknown as Record<string, unknown>;
      if (asRecord.slug !== undefined && blog.keyword === undefined) {
        throw new Error('This document is a marketing blog post, not a generated article.');
      }

      const brands = blog.brandId ? await brandProfileOperations.getAll(user.uid) : [];
      const brand = brands.find((entry) => entry.id === blog.brandId) ?? null;

      return { blog, brand };
    },
    enabled: Boolean(user?.uid && articleId),
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center text-gray-400">
        <Loader2 className="animate-spin" size={24} />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 text-amber-500" size={28} />
        <h1 className="mb-1 text-lg font-semibold text-gray-900">Cannot open this article</h1>
        <p className="mb-6 text-sm text-gray-600">
          {error instanceof Error ? error.message : 'Something went wrong loading the article.'}
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard/history')}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Back to history
        </button>
      </div>
    );
  }

  if (!article.blog.content) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 text-amber-500" size={28} />
        <h1 className="mb-1 text-lg font-semibold text-gray-900">This article has no content yet</h1>
        <p className="mb-6 text-sm text-gray-600">
          Generation may still be running, or it finished without producing content.
        </p>
        <button
          type="button"
          onClick={() => router.push('/dashboard/history')}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Back to history
        </button>
      </div>
    );
  }

  return (
    <ArticleEditor
      uid={user!.uid}
      blogId={articleId}
      initialTitle={article.blog.title}
      initialContent={article.blog.content}
      originalContent={article.blog.originalContent ?? null}
      brand={article.brand}
      keyword={article.blog.keyword}
      toneOfVoice={article.blog.toneOfVoice}
      getToken={async () => (user ? await user.getIdToken() : null)}
    />
  );
}
