'use client';

import { useAuth } from '@/lib/firebase/auth-context';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, FileText } from 'lucide-react';
import { useState } from 'react';

export default function Header() {
  const { user, logout, subscription_status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [logoError, setLogoError] = useState(false);

  // Don't show header on dashboard pages
  if (pathname.startsWith('/dashboard')) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3">
            {!logoError ? (
              <Image
                src="/logo.png"
                alt="EnhanceMySEO"
                width={180}
                height={40}
                className="h-10 w-auto"
                onError={() => setLogoError(true)}
              />
            ) : (
              <>
                <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                  <span className="text-white font-bold text-sm">E</span>
                </div>
                <span className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                  EnhanceMySEO
                </span>
              </>
            )}
          </Link>

          {/* Navigation */}
          <div className="flex items-center space-x-4">
            <Link
              href="/blog"
              className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200"
            >
              <FileText className="w-4 h-4 mr-2" />
              Blogs
            </Link>
            {!user ? (
              <Link
                href="/login"
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
              >
                Get Started
              </Link>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
                >
                  Generate Now
                </Link>
                {subscription_status === 'admin' && (
                  <Link
                    href="/blogs"
                    className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Admin Blogs
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
} 