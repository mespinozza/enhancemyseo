'use client';

import { useAuth } from '@/lib/firebase/auth-context';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';

export default function Header() {
  const { user, signOut } = useAuth();
  const pathname = usePathname();

  // Don't show header on dashboard pages
  if (pathname.startsWith('/dashboard')) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent hover:from-blue-700 hover:to-blue-500 transition-colors">
              EnhanceMySeo
            </span>
          </Link>

          {/* Navigation */}
          <div className="flex items-center gap-3">
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