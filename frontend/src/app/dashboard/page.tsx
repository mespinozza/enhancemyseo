'use client';

import { useAuth } from '@/contexts/AuthContext';
import { articles } from '@/lib/api';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import toast from 'react-hot-toast';

const generateSchema = z.object({
  keyword: z.string().min(1, 'Keyword is required'),
});

type GenerateFormData = z.infer<typeof generateSchema>;

export default function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [previewContent, setPreviewContent] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GenerateFormData>({
    resolver: zodResolver(generateSchema),
  });

  const { data: recentArticles, isLoading: isLoadingArticles } = useQuery({
    queryKey: ['articles'],
    queryFn: async () => {
      const response = await articles.getAll();
      return response.data.articles;
    },
  });

  const generateMutation = useMutation({
    mutationFn: articles.generate,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['articles'] });
      setPreviewContent(response.data.article.html_content);
      reset();
      toast.success('Article generated successfully!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate article');
    },
  });

  const onSubmit = (data: GenerateFormData) => {
    generateMutation.mutate(data);
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Welcome back, {user?.email}
            </h2>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Article Generation Form */}
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-base font-semibold leading-6 text-gray-900">
                Generate New Article
              </h3>
              <div className="mt-2 max-w-xl text-sm text-gray-500">
                <p>Enter a keyword to generate an SEO-optimized article.</p>
              </div>
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="mt-5 sm:flex sm:items-center"
              >
                <div className="w-full sm:max-w-xs">
                  <label htmlFor="keyword" className="sr-only">
                    Keyword
                  </label>
                  <input
                    {...register('keyword')}
                    type="text"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder="Enter keyword"
                  />
                  {errors.keyword && (
                    <p className="mt-2 text-sm text-red-600">
                      {errors.keyword.message}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={generateMutation.isPending}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:ml-3 sm:mt-0 sm:w-auto disabled:opacity-50"
                >
                  {generateMutation.isPending ? 'Generating...' : 'Generate'}
                </button>
              </form>
            </div>
          </div>

          {/* Recent Articles */}
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-base font-semibold leading-6 text-gray-900">
                Recent Articles
              </h3>
              <div className="mt-6 flow-root">
                <ul role="list" className="-my-5 divide-y divide-gray-200">
                  {isLoadingArticles ? (
                    <p>Loading articles...</p>
                  ) : (
                    recentArticles?.slice(0, 5).map((article: any) => (
                      <li key={article.id} className="py-4">
                        <div className="flex items-center space-x-4">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {article.keyword}
                            </p>
                            <p className="truncate text-sm text-gray-500">
                              Created{' '}
                              {new Date(article.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div>
                            <a
                              href={`/dashboard/articles/${article.id}`}
                              className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                            >
                              View
                            </a>
                          </div>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="mt-6">
                <a
                  href="/dashboard/articles"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
                >
                  View all articles
                  <span aria-hidden="true"> &rarr;</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Preview Section */}
        {previewContent && (
          <div className="mt-8">
            <div className="bg-white shadow sm:rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-base font-semibold leading-6 text-gray-900">
                  Generated Article Preview
                </h3>
                <div
                  className="prose prose-sm mt-4 max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewContent }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
} 