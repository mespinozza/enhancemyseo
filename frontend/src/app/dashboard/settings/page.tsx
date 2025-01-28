'use client';

import { settings } from '@/lib/api';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '@/components/layouts/DashboardLayout';
import toast from 'react-hot-toast';

const settingsSchema = z.object({
  shopify_url: z.string().url('Invalid Shopify URL').optional(),
  brand_name: z.string().min(1, 'Brand name is required'),
  business_type: z.string().min(1, 'Business type is required'),
  brand_guidelines: z.string().min(1, 'Brand guidelines are required'),
  content_type: z.string().min(1, 'Content type is required'),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

const contentTypes = [
  'professional',
  'casual',
  'technical',
  'conversational',
  'academic',
];

const businessTypes = [
  'ecommerce',
  'saas',
  'healthcare',
  'education',
  'finance',
  'technology',
  'retail',
  'other',
];

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
  });

  const { data: currentSettings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await settings.get();
      reset(response.data);
      return response.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: settings.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings updated successfully!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update settings');
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div>Loading settings...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto">
        <div className="md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
              Settings
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-8">
          {/* Shopify Settings */}
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-base font-semibold leading-6 text-gray-900">
                Shopify Integration
              </h3>
              <div className="mt-2 max-w-xl text-sm text-gray-500">
                <p>Connect your Shopify store to publish articles directly.</p>
              </div>
              <div className="mt-5">
                <label
                  htmlFor="shopify_url"
                  className="block text-sm font-medium leading-6 text-gray-900"
                >
                  Shopify Store URL
                </label>
                <div className="mt-2">
                  <input
                    {...register('shopify_url')}
                    type="url"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder="https://your-store.myshopify.com"
                  />
                  {errors.shopify_url && (
                    <p className="mt-2 text-sm text-red-600">
                      {errors.shopify_url.message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Brand Settings */}
          <div className="bg-white shadow sm:rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-base font-semibold leading-6 text-gray-900">
                Brand Settings
              </h3>
              <div className="mt-5 grid grid-cols-1 gap-6">
                <div>
                  <label
                    htmlFor="brand_name"
                    className="block text-sm font-medium leading-6 text-gray-900"
                  >
                    Brand Name
                  </label>
                  <div className="mt-2">
                    <input
                      {...register('brand_name')}
                      type="text"
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    />
                    {errors.brand_name && (
                      <p className="mt-2 text-sm text-red-600">
                        {errors.brand_name.message}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="business_type"
                    className="block text-sm font-medium leading-6 text-gray-900"
                  >
                    Business Type
                  </label>
                  <div className="mt-2">
                    <select
                      {...register('business_type')}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    >
                      {businessTypes.map((type) => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>
                    {errors.business_type && (
                      <p className="mt-2 text-sm text-red-600">
                        {errors.business_type.message}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="content_type"
                    className="block text-sm font-medium leading-6 text-gray-900"
                  >
                    Content Tone
                  </label>
                  <div className="mt-2">
                    <select
                      {...register('content_type')}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    >
                      {contentTypes.map((type) => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>
                    {errors.content_type && (
                      <p className="mt-2 text-sm text-red-600">
                        {errors.content_type.message}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="brand_guidelines"
                    className="block text-sm font-medium leading-6 text-gray-900"
                  >
                    Brand Guidelines
                  </label>
                  <div className="mt-2">
                    <textarea
                      {...register('brand_guidelines')}
                      rows={4}
                      className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                      placeholder="Enter your brand guidelines..."
                    />
                    {errors.brand_guidelines && (
                      <p className="mt-2 text-sm text-red-600">
                        {errors.brand_guidelines.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!isDirty || updateMutation.isPending}
              className="ml-3 inline-flex justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
} 