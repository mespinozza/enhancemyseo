'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations } from '@/lib/firebase/firestore';

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
  const { user } = useAuth();

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
      if (!user) throw new Error('User not authenticated');
      // Get the first brand profile for now
      const profiles = await brandProfileOperations.getAll(user.uid);
      const profile = profiles[0] || {};
      
      // Map to the form format
      const formData = {
        shopify_url: profile.shopifyStoreUrl || '',
        brand_name: profile.brandName || '',
        business_type: profile.businessType || '',
        brand_guidelines: profile.brandGuidelines || '',
        content_type: 'professional', // Default value
      };
      
      reset(formData);
      return formData;
    },
    enabled: !!user,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      if (!user) throw new Error('User not authenticated');
      // Get the first brand profile for now
      const profiles = await brandProfileOperations.getAll(user.uid);
      
      if (profiles.length > 0) {
        // Update existing profile
        await brandProfileOperations.update(profiles[0].id!, {
          shopifyStoreUrl: data.shopify_url,
          brandName: data.brand_name,
          businessType: data.business_type,
          brandGuidelines: data.brand_guidelines,
        });
      } else {
        // Create new profile
        await brandProfileOperations.create({
          userId: user.uid,
          shopifyStoreUrl: data.shopify_url,
          brandName: data.brand_name,
          businessType: data.business_type,
          brandGuidelines: data.brand_guidelines,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings updated successfully!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update settings');
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return <div>Loading settings...</div>;
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      <div className="mb-8">
        <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:tracking-tight">
          Settings
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="grid gap-6 sm:gap-8 sm:grid-cols-1 md:grid-cols-2 mb-8 sm:mb-12">
        <Link
          href="/dashboard/brands"
          className="block p-4 sm:p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-500 hover:shadow-md transition-colors"
        >
          <h2 className="text-lg font-medium text-gray-900 mb-2">Brand Profiles</h2>
          <p className="text-sm text-gray-600">
            Manage your brand profiles and Shopify integrations
          </p>
        </Link>

        {/* Add more settings cards here if needed */}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 sm:space-y-12">
        {/* Shopify Settings */}
        <div className="bg-white shadow sm:rounded-lg overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-200 bg-gray-50">
            <h3 className="text-base sm:text-lg font-medium leading-6 text-gray-900">
              Shopify Integration
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Connect your Shopify store to publish articles directly.
            </p>
          </div>
          <div className="px-4 sm:px-6 py-4 sm:py-6">
            <div className="w-full max-w-3xl">
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
                  className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
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
        <div className="bg-white shadow sm:rounded-lg overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-200 bg-gray-50">
            <h3 className="text-base sm:text-lg font-medium leading-6 text-gray-900">
              Brand Settings
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Configure how your brand appears in generated content
            </p>
          </div>
          <div className="px-4 sm:px-6 py-4 sm:py-6">
            <div className="w-full max-w-3xl grid grid-cols-1 gap-6 sm:gap-8">
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
                    className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                  {errors.brand_name && (
                    <p className="mt-2 text-sm text-red-600">
                      {errors.brand_name.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="sm:grid sm:grid-cols-2 sm:gap-6">
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
                      className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
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

                <div className="mt-6 sm:mt-0">
                  <label
                    htmlFor="content_type"
                    className="block text-sm font-medium leading-6 text-gray-900"
                  >
                    Content Tone
                  </label>
                  <div className="mt-2">
                    <select
                      {...register('content_type')}
                      className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
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
                    rows={6}
                    className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
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
            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
} 