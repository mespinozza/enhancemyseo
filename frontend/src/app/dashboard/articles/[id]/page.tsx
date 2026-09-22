'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/firebase/auth-context';
import { blogOperations } from '@/lib/firebase/firestore';

const GENERATION_POLL_INTERVAL_MS = 3000;
/** Long enough for the slowest generation, short enough to not poll an empty page all day. */
const GENERATION_POLL_TIMEOUT_MS = 15 * 60_000;

export default function ArticleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const articleId = params.id as string;
  const { user } = useAuth();
  const [openedAt] = useState(() => Date.now());

  const { data: article, isLoading } = useQuery({
    queryKey: ['article', articleId],
    queryFn: async () => {
      if (!user?.uid) {
        throw new Error("User not authenticated");
      }
      const blogData = await blogOperations.getBlogById(user.uid, articleId);
      if (!blogData) {
        throw new Error("Article not found");
      }
      return {
        keyword: blogData.title,
        content: blogData.content || "",
        html_content: blogData.content || "",
        published: blogData.status === 'published',
        created_at: blogData.createdAt?.toDate() || new Date(),
        publish_url: "#" // Not implemented
      };
    },
    enabled: !!user?.uid && !!articleId,
    // Auto-refresh while content is empty (article is generating)
    refetchInterval: (query) => {
      // Stop polling once we have content
      const data = query.state.data;
      if (data && data.content && data.content.trim().length > 0) {
        return false; // Stop refetching
      }
      // A generation that has not produced content by now has failed rather than
      // stalled, and polling a permanently empty article costs a read every few
      // seconds for as long as the tab stays open.
      if (Date.now() - openedAt > GENERATION_POLL_TIMEOUT_MS) {
        return false;
      }
      return GENERATION_POLL_INTERVAL_MS;
    },
    // Nobody is watching a background tab, and the query re-runs on focus anyway.
    refetchIntervalInBackground: false,
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!user?.uid) {
        throw new Error("User not authenticated");
      }
      await blogOperations.updateBlog(user.uid, articleId, {
        status: 'published',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article', articleId] });
      toast.success('Article published successfully!');
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish article';
      toast.error(errorMessage);
    },
  });

  if (isLoading || !article) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading article...</p>
        </div>
      </div>
    );
  }

  // Check if article is still being generated
  const isGenerating = !article.content || article.content.trim().length === 0;

  return (
      <div className="max-w-7xl mx-auto">
        {/* Generation Status Banner */}
        {isGenerating && (
          <div className="mb-4 bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="animate-spin h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  <strong>Article is being generated...</strong> This page will automatically update when the content is ready. (Refreshing every 3 seconds)
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              {article.keyword}
            </h2>
          </div>
          <div className="mt-4 flex md:ml-4 md:mt-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Back
            </button>
            {!article.published && (
              <button
                type="button"
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending}
                className="ml-3 inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
              >
                {publishMutation.isPending ? 'Publishing...' : 'Publish'}
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6">
          {/* Article Details */}
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold leading-6 text-gray-900">
                    Article Details
                  </h3>
                  <dl className="mt-3 space-y-3">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Status</dt>
                      <dd className="mt-1">
                        <span
                          className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                            article.published
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {article.published ? 'Published' : 'Draft'}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">
                        Created At
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {new Date(article.created_at).toLocaleString()}
                      </dd>
                    </div>
                    {article.published && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">
                          Published URL
                        </dt>
                        <dd className="mt-1 text-sm text-indigo-600">
                          <a
                            href={article.publish_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-indigo-500"
                          >
                            {article.publish_url}
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Article Preview */}
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-base font-semibold leading-6 text-gray-900">
                Article Preview
              </h3>
              <div className="mt-4 prose prose-sm max-w-none">
                {isGenerating ? (
                  <div className="text-center py-12 text-gray-500">
                    <svg className="animate-spin h-8 w-8 text-gray-400 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-lg font-medium">Generating article content...</p>
                    <p className="mt-2 text-sm">This typically takes 2-4 minutes. The page will automatically update when ready.</p>
                  </div>
                ) : (
                  <div
                    dangerouslySetInnerHTML={{ 
                      __html: article.html_content.replace(
                        /<img[^>]*>/g, 
                        (match) => {
                          // Remove problematic images or add error handling
                          if (match.includes('plato-hospitality-robot') || match.includes('robot.jpg')) {
                            return ''; // Remove problematic images
                          }
                          return match.replace(/>$/, ' onerror="this.style.display=\'none\'" style="max-width: 100%; height: auto;">')
                        }
                      )
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
} 