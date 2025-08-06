'use client';

import { useRouter } from 'next/navigation';
import { CheckCircle } from 'lucide-react';

export default function ContactSuccess() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-blue-50/50 flex items-center justify-center">
      <div className="max-w-md mx-auto px-4 py-16 sm:px-6 lg:px-8 text-center">
        <div className="mb-8">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Message Sent Successfully
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Thanks for reaching out! We&apos;ll get back to you within 24 hours.
          </p>
        </div>
        <button
          onClick={() => router.push('/')}
          className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 font-medium"
        >
          Return to Home
        </button>
      </div>
    </div>
  );
} 