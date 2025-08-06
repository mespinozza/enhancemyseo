'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Pricing from '@/components/home/Pricing';
import toast from 'react-hot-toast';

function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canceled = searchParams.get('canceled');

  useEffect(() => {
    if (canceled === 'true') {
      // Show a toast message for canceled checkout
      toast('Payment canceled. Feel free to try again when you\'re ready!', {
        icon: '💭',
        duration: 4000,
      });
      
      // Redirect to homepage pricing section after a short delay
      const timer = setTimeout(() => {
        router.push('/#pricing');
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [canceled, router]);

  // If it's a canceled checkout, show a brief message before redirecting
  if (canceled === 'true') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            No Problem!
          </h2>
          <p className="text-gray-600 mb-4">
            Your payment was canceled. We&apos;re taking you back to our pricing options.
          </p>
          <div className="flex justify-center">
            <div className="inline-flex items-center px-4 py-2 bg-blue-50 rounded-lg">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-blue-600 text-sm">Redirecting...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // For direct visits to /pricing (not canceled), show the pricing component
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl mb-4">
            Choose Your Plan
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Choose the plan that&apos;s right for your business
          </p>
        </div>
        <Pricing />
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
} 