'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { FileText, Key, LogOut, History, ChevronRight, ExternalLink, Package, LayoutGrid } from 'lucide-react';
import { historyOperations, HistoryItem } from '@/lib/firebase/firestore';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [recentHistory, setRecentHistory] = useState<HistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Load recent history items
  useEffect(() => {
    async function loadRecentHistory() {
      if (!user) return;
      try {
        setIsLoadingHistory(true);
        const items = await historyOperations.getRecentHistory(user.uid);
        setRecentHistory(items);
      } catch (error) {
        console.error('Error loading recent history:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    }

    loadRecentHistory();
  }, [user]);

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Get user's display name or first part of email
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex h-screen">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-xl z-10 relative flex flex-col border-r border-gray-200">
          {/* Logo */}
          <div className="p-4 border-b border-gray-200 flex justify-center items-center bg-white">
            <Link href="/" className="block">
              <span className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                EnhanceMySEO
              </span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 bg-white">
            <div className="space-y-3">
              {/* Optimize Products */}
              <Link
                href="/dashboard/products"
                className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                  pathname === '/dashboard/products'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Package className="w-5 h-5 mr-3" />
                Optimize Products
              </Link>

              {/* Optimize Collections */}
              <Link
                href="/dashboard/collections"
                className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                  pathname === '/dashboard/collections'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <LayoutGrid className="w-5 h-5 mr-3" />
                Optimize Collections
              </Link>

              {/* Generate Keywords */}
              <Link
                href="/dashboard/keywords"
                className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                  pathname === '/dashboard/keywords'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Key className="w-5 h-5 mr-3" />
                Generate Keywords
              </Link>

              {/* Generate Article */}
              <Link
                href="/dashboard/articles"
                className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                  pathname === '/dashboard/articles'
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <FileText className="w-5 h-5 mr-3" />
                Generate Article
              </Link>
            </div>

            {/* Content History Section */}
            <div className="mt-8">
              <div className="px-4 flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Content History
                </h3>
                <Link
                  href="/dashboard/history"
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center"
                >
                  See All
                  <ChevronRight className="w-3 h-3 ml-1" />
                </Link>
              </div>
              
              <div className="space-y-1">
                {isLoadingHistory ? (
                  <div className="px-4 py-2 text-sm text-gray-500">
                    Loading history...
                  </div>
                ) : recentHistory.length > 0 ? (
                  recentHistory.map((item) => (
                    <Link
                      key={item.id}
                      href={`/dashboard/history/${item.id}`}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {item.type === 'article' ? (
                        <FileText className="w-4 h-4 mr-3 text-gray-400" />
                      ) : (
                        <Key className="w-4 h-4 mr-3 text-gray-400" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{item.title}</p>
                        <p className="text-xs text-gray-500">
                          {item.date.toLocaleDateString()}
                        </p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="px-4 py-2 text-sm text-gray-500">
                    No recent content
                  </div>
                )}
              </div>
            </div>
          </nav>

          {/* User Profile */}
          <div className="p-4 border-t border-gray-200 mt-auto relative bg-white" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center space-x-3 hover:bg-gray-50 p-2 rounded-md"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-medium">
                {displayName[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {displayName}
                </p>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${
                  showUserMenu ? 'transform rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-md shadow-lg border border-gray-200 py-1">
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <LogOut className="w-4 h-4 mr-3" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          {children}
        </main>
      </div>
    </div>
  );
} 