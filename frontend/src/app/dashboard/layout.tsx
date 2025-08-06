'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useUsageRefresh } from '@/lib/usage-refresh-context';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  FileText, 
  LogOut, 
  History,
  Package,
  Search
} from 'lucide-react';
import { blogOperations, Blog, generatedProductOperations, GeneratedProduct, historyOperations, HistoryItem, initializeUserCollections } from '@/lib/firebase/firestore';
import { getFilteredNavigation } from '@/config/navigation';
import { Timestamp } from 'firebase/firestore';

// Combined interface for recent items
interface RecentItem {
  id: string;
  type: 'blog' | 'product' | 'history';
  title: string;
  createdAt?: Date | Timestamp;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tabLink: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout, subscription_status, loading } = useAuth();
  const { } = useUsageRefresh();
  const router = useRouter();
  const pathname = usePathname();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [isLoadingRecents, setIsLoadingRecents] = useState(true);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Ensure we have user and subscription status loaded before showing navigation
  const isUserDataLoaded = !loading && user && user.subscription_status;
  
  // Get filtered navigation based on subscription status, but only when data is loaded
  const filteredNavigation = isUserDataLoaded ? getFilteredNavigation(subscription_status) : [];

  // Load all recent items from different collections
  useEffect(() => {
    async function loadRecentItems() {
      if (!user?.uid) {
        console.log('No authenticated user found, skipping recent items load');
        return;
      }
      
      // Ensure we have a valid auth token before making Firestore requests
      try {
        await user.getIdToken();
      } catch (tokenError) {
        console.error('Failed to get auth token for recent items:', tokenError);
        return;
      }
      
      console.log('Loading recent items for user:', user.uid);
      
      try {
        setIsLoadingRecents(true);
        
        // Initialize collections for the user (helps with permission errors)
        await initializeUserCollections(user.uid);
        
        // Load all collections in parallel, with individual error handling
        const [blogs, products, historyItems] = await Promise.all([
          blogOperations.getAll(user.uid).catch((error) => {
            console.warn('Error loading blogs for recent items:', error);
            return [];
          }),
          // Handle generatedProducts more gracefully - it might not exist yet
          (async () => {
            try {
              const products = await generatedProductOperations.getAll(user.uid);
              console.log('Successfully loaded products for recent items:', products.length);
              return products;
            } catch (error: unknown) {
              // Don't log permission errors for generatedProducts - collection might not exist yet
              const firebaseError = error as { code?: string; message?: string };
              if (firebaseError?.code === 'permission-denied' || firebaseError?.message?.includes('permission')) {
                console.log('generatedProducts collection not yet available for this user');
                return [];
              } else {
                console.warn('Error loading generated products for recent items:', error);
                return [];
              }
            }
          })(),
          historyOperations.getAll(user.uid).catch((error) => {
            console.warn('Error loading history for recent items:', error);
            return [];
          })
        ]);

        console.log('Recent items loaded successfully:', {
          blogs: blogs.length,
          products: products.length,
          history: historyItems.length
        });

        // Transform all items to common format
        const allItems: RecentItem[] = [
          // Blog items
          ...blogs.map((blog: Blog) => ({
            id: blog.id!,
            type: 'blog' as const,
            title: blog.title,
            createdAt: blog.createdAt,
            icon: FileText,
            tabLink: `blogs&highlight=${blog.id}`
          })),
          // Product items  
          ...products.map((product: GeneratedProduct) => ({
            id: product.id!,
            type: 'product' as const,
            title: product.productName,
            createdAt: product.createdAt,
            icon: Package,
            tabLink: `products&highlight=${product.id}`
          })),
          // History items
          ...historyItems.map((item: HistoryItem) => ({
            id: item.id!,
            type: 'history' as const,
            title: item.title,
            createdAt: item.createdAt,
            icon: item.type === 'keywords' ? Search : History,
            tabLink: item.type === 'keywords' ? `keywords&highlight=${item.id}` : `collections&highlight=${item.id}`
          }))
        ];

        // Sort by creation date and take the 8 most recent
        const sortedItems = allItems.sort((a, b) => {
          const dateA = a.createdAt instanceof Date ? a.createdAt : (a.createdAt?.toDate?.() || new Date(0));
          const dateB = b.createdAt instanceof Date ? b.createdAt : (b.createdAt?.toDate?.() || new Date(0));
          return dateB.getTime() - dateA.getTime();
        });

        setRecentItems(sortedItems.slice(0, 8));
      } catch (error) {
        console.warn('Error loading recent items:', error);
        setRecentItems([]);
      } finally {
        setIsLoadingRecents(false);
      }
    }

    // Only run when we have a fully authenticated user and user data is loaded
    if (user?.uid && isUserDataLoaded && !loading) {
      // Add delay to ensure Firestore rules have been applied
      setTimeout(loadRecentItems, 500);
    }
  }, [user, isUserDataLoaded, loading]);

  // Register sidebar refresh function
  useEffect(() => {
    // Usage refresh functionality can be added here if needed
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
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Get user's display name or first part of email
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'User';

  // Show loading spinner while user data is loading
  if (loading || !isUserDataLoaded) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

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
          <nav className="flex-1 p-4 bg-white overflow-hidden flex flex-col">
            <div className="space-y-3">
              {/* Role-based navigation items - only show when user data is fully loaded */}
              {filteredNavigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center px-4 py-2 rounded-md transition-colors ${
                    pathname === item.href
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <item.icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              ))}
            </div>

            {/* Recent Items Section */}
            <div className="mt-8 flex-1 flex flex-col min-h-0">
              <div className="px-4 flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Recents
                </h3>
                <Link
                  href="/dashboard/history"
                  className="text-xs text-blue-600 hover:text-blue-700 whitespace-nowrap"
                >
                  See All
                </Link>
              </div>
              
              <div className="flex-1 overflow-y-auto">
                <div className="space-y-1">
                  {isLoadingRecents ? (
                    <div className="px-4 py-2 text-sm text-gray-500">
                      Loading recent content...
                    </div>
                  ) : recentItems.length > 0 ? (
                    recentItems.map((item) => (
                      <Link
                        key={`${item.type}-${item.id}`}
                        href={`/dashboard/history?tab=${item.tabLink}`}
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md"
                      >
                        <item.icon className="w-4 h-4 mr-3 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate">{item.title}</p>
                          <p className="text-xs text-gray-500">
                            {(item.createdAt instanceof Date ? item.createdAt : item.createdAt?.toDate?.())?.toLocaleDateString() || 'Recent'}
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
                <p className="text-xs text-gray-600 capitalize">
                  {subscription_status} Plan
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
                <Link
                  href="/dashboard/settings"
                  className="w-full flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-3">
                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  Settings
                </Link>
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