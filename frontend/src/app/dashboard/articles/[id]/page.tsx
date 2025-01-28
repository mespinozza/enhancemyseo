'use client';

import { articles } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function ArticleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const articleId = params.id as string;

  const { data: article, isLoading } = useQuery({
    queryKey: ['article', articleId],
    queryFn: async () => {
      const response = await articles.getOne(articleId);
      return response.data;
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => articles.publish(articleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article', articleId] });
      toast.success('Article published successfully!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to publish article');
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div>Loading article...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
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
                <div
                  dangerouslySetInnerHTML={{ __html: article.html_content }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
} 