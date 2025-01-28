'use client';

import { useAuth } from '@/lib/firebase/auth-context';
import LoginForm from '@/components/auth/LoginForm';
import SignUpForm from '@/components/auth/SignUpForm';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { user } = useAuth();
  const [showLogin, setShowLogin] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            EnhanceMySEO
          </h1>
          <p className="text-xl text-gray-600">
            AI-powered SEO optimization and blog content generation
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <div className="flex justify-center space-x-4 mb-8">
            <button
              onClick={() => setShowLogin(true)}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                showLogin
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setShowLogin(false)}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                !showLogin
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Sign Up
            </button>
          </div>

          {showLogin ? <LoginForm /> : <SignUpForm />}
        </div>
      </div>
    </main>
  );
}
