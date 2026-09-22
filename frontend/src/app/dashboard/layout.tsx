'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useUsageRefresh } from '@/lib/usage-refresh-context';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  FileText, 
  LogOut, 
  History,
  Package,
  Search,
  ChevronDown,
  Star,
  GripVertical
} from 'lucide-react';
import { blogOperations, Blog, generatedProductOperations, GeneratedProduct, historyOperations, HistoryItem } from '@/lib/firebase/firestore';
import { getFilteredNavigationGroups, type NavigationItem } from '@/config/navigation';
import {
  getPinnedNav,
  setPinnedNav,
  readCachedPinnedNav,
  writeCachedPinnedNav,
} from '@/lib/firebase/user-preferences';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';

// Helper function to format subscription status for display
const formatSubscriptionStatus = (status: string): string => {
  switch (status) {
    case 'kickstart':
      return 'Kickstart';
    case 'seo_takeover':
      return 'SEO Takeover';
    case 'agency':
      return 'Agency';
    case 'admin':
      return 'Admin';
    case 'free':
    default:
      return 'Free';
  }
};

// Combined interface for recent items
/** How many rows the sidebar's recent list shows, and so how many each query asks for. */
const RECENTS_SHOWN = 8;

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
  const navReady = Boolean(isUserDataLoaded);
  
  // Get filtered navigation based on subscription status, but only when data is loaded
  const navigationGroups = useMemo(
    () => (navReady ? getFilteredNavigationGroups(subscription_status) : []),
    [navReady, subscription_status]
  );

  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const didInitGroupsRef = useRef(false);

  const isItemActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Groups always start closed, including the one holding the current page - pinned
  // items are the shortcut to where you are, so the menu stays compact. Navigation
  // loads with the user's subscription rather than on first render, so this seeds the
  // state the first time the groups are known.
  useEffect(() => {
    if (didInitGroupsRef.current || navigationGroups.length === 0) return;
    didInitGroupsRef.current = true;
    setCollapsedGroups(navigationGroups.map((group) => group.label));
  }, [navigationGroups]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) =>
      prev.includes(label) ? prev.filter((entry) => entry !== label) : [...prev, label]
    );
  };

  // Pinned nav items, stored as hrefs so they survive a rename of either the item or
  // its group. Persisted per account, so they follow the user to any browser.
  const [pinnedHrefs, setPinnedHrefs] = useState<string[]>([]);
  const pinnedLoadedForRef = useRef<string | null>(null);

  useEffect(() => {
    const uid = user?.uid;

    // Signing out, or switching accounts, must not leave the previous user's pins on
    // screen while the new ones load.
    if (!uid) {
      pinnedLoadedForRef.current = null;
      setPinnedHrefs([]);
      return;
    }

    if (pinnedLoadedForRef.current === uid) return;
    pinnedLoadedForRef.current = uid;
    setPinnedHrefs(readCachedPinnedNav(uid));

    let cancelled = false;
    getPinnedNav(uid)
      .then((stored) => {
        if (cancelled || stored === null) return;
        setPinnedHrefs(stored);
        writeCachedPinnedNav(uid, stored);
      })
      .catch((error) => {
        console.warn('Could not load pinned navigation:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Order is meaningful: the stored array *is* the pinned list's order, so reordering
  // and pinning share the same write path.
  const persistPinned = (next: string[]) => {
    setPinnedHrefs(next);

    const uid = user?.uid;
    if (!uid) return;

    writeCachedPinnedNav(uid, next);
    setPinnedNav(uid, next).catch((error) => {
      console.error('Could not save pinned navigation:', error);
      toast.error('Could not save your pinned menu.');
    });
  };

  const togglePinned = (href: string) => {
    persistPinned(
      pinnedHrefs.includes(href)
        ? pinnedHrefs.filter((entry) => entry !== href)
        : [...pinnedHrefs, href]
    );
  };

  const [draggingHref, setDraggingHref] = useState<string | null>(null);
  const [dropTargetHref, setDropTargetHref] = useState<string | null>(null);

  const movePinned = (fromHref: string, toHref: string) => {
    if (fromHref === toHref) return;

    const next = [...pinnedHrefs];
    const from = next.indexOf(fromHref);
    const to = next.indexOf(toHref);
    if (from === -1 || to === -1) return;

    next.splice(from, 1);
    next.splice(to, 0, fromHref);
    persistPinned(next);
  };

  const endDrag = () => {
    setDraggingHref(null);
    setDropTargetHref(null);
  };

  // Resolved against the visible groups, so a pin the user has lost access to and a
  // pin for a removed route both simply disappear.
  const pinnedItems = useMemo(() => {
    const lookup = new Map<string, { item: NavigationItem; groupLabel: string }>();
    for (const group of navigationGroups) {
      for (const item of group.items) lookup.set(item.href, { item, groupLabel: group.label });
    }

    return pinnedHrefs.flatMap((href) => {
      const entry = lookup.get(href);
      return entry ? [entry] : [];
    });
  }, [pinnedHrefs, navigationGroups]);

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

        // Only the newest few from each collection: the list shows RECENTS_SHOWN rows, and
        // every extra document a query returns is a billed read even though it is dropped
        // by the slice below. Each call swallows its own errors so one empty or
        // not-yet-created collection cannot blank out the whole list.
        const [blogs, products, historyItems] = await Promise.all([
          blogOperations.getRecent(user.uid, RECENTS_SHOWN),
          generatedProductOperations.getRecent(user.uid, RECENTS_SHOWN),
          historyOperations.getRecent(user.uid, RECENTS_SHOWN),
        ]);

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

        // Interleave the three sources by date; each already holds at most RECENTS_SHOWN.
        const sortedItems = allItems.sort((a, b) => {
          const dateA = a.createdAt instanceof Date ? a.createdAt : (a.createdAt?.toDate?.() || new Date(0));
          const dateB = b.createdAt instanceof Date ? b.createdAt : (b.createdAt?.toDate?.() || new Date(0));
          return dateB.getTime() - dateA.getTime();
        });

        setRecentItems(sortedItems.slice(0, RECENTS_SHOWN));
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
      const timer = setTimeout(loadRecentItems, 500);
      return () => clearTimeout(timer);
    }
    // Keyed on the uid rather than the user object, which Firebase replaces on every
    // token refresh and would otherwise re-run this load roughly hourly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, isUserDataLoaded, loading]);

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
            <div className="space-y-1">
              {/* Pinned items, promoted above the groups with their full names */}
              {pinnedItems.length > 0 && (
                <div className="mb-3 space-y-0.5 border-b border-gray-200 pb-3">
                  {pinnedItems.map(({ item, groupLabel }) => (
                    <div
                      key={item.href}
                      draggable
                      onDragStart={(event) => {
                        setDraggingHref(item.href);
                        event.dataTransfer.effectAllowed = 'move';
                        // Firefox ignores drags that carry no payload.
                        event.dataTransfer.setData('text/plain', item.href);
                      }}
                      onDragOver={(event) => {
                        if (!draggingHref || draggingHref === item.href) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setDropTargetHref(item.href);
                      }}
                      onDragLeave={() => {
                        setDropTargetHref((current) =>
                          current === item.href ? null : current
                        );
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggingHref) movePinned(draggingHref, item.href);
                        endDrag();
                      }}
                      onDragEnd={endDrag}
                      className={`group/pin flex items-center rounded-md transition-colors ${
                        draggingHref === item.href ? 'opacity-40' : ''
                      } ${
                        dropTargetHref === item.href ? 'ring-1 ring-blue-400 bg-blue-50/60' : ''
                      } ${
                        isItemActive(item.href) ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span
                        title="Drag to reorder"
                        className="cursor-grab pl-1 text-gray-300 opacity-0 transition-opacity duration-200 group-hover/pin:opacity-100 active:cursor-grabbing"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </span>
                      <Link
                        href={item.href}
                        // Anchors are draggable by default, which would drag the URL
                        // instead of letting the row own the gesture.
                        draggable={false}
                        className={`flex flex-1 items-center min-w-0 px-2 py-1.5 text-sm transition-colors ${
                          isItemActive(item.href)
                            ? 'text-blue-700 font-medium'
                            : 'text-gray-700 hover:text-blue-600'
                        }`}
                      >
                        <item.icon className="w-4 h-4 mr-2.5 flex-shrink-0" />
                        <span className="truncate">{groupLabel} {item.name}</span>
                      </Link>
                      <button
                        onClick={() => togglePinned(item.href)}
                        title="Unpin from top"
                        aria-label={`Unpin ${groupLabel} ${item.name}`}
                        className="px-2 py-1.5"
                      >
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400 transition-transform duration-200 ease-out group-hover/pin:scale-110" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Role-based navigation groups - only show when user data is fully loaded */}
              {navigationGroups.map((group) => {
                const isOpen = !collapsedGroups.includes(group.label);
                return (
                  <div key={group.label}>
                    <button
                      onClick={() => toggleGroup(group.label)}
                      aria-expanded={isOpen}
                      className="group w-full flex items-center justify-between px-4 py-2 rounded-md text-sm font-semibold text-gray-800 transition-colors duration-200 ease-out hover:bg-blue-50/60 hover:text-blue-600"
                    >
                      {/* Scaled rather than sized up, so growing the label can't reflow
                          the sidebar and nudge the items below it. */}
                      <span className="origin-left transition-transform duration-200 ease-out group-hover:scale-110">
                        {group.label}...
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 transition duration-200 ease-out group-hover:text-blue-600 ${
                          isOpen ? '' : '-rotate-90'
                        }`}
                      />
                    </button>

                    {isOpen && (
                      <div className="mt-0.5 ml-3 space-y-0.5 border-l border-gray-200 pl-3">
                        {group.items.map((item) => {
                          const isPinned = pinnedHrefs.includes(item.href);
                          return (
                            // The star sits beside the link rather than inside it,
                            // because an anchor cannot legally contain a button.
                            <div
                              key={item.name}
                              className={`group/item flex items-center rounded-md transition-colors ${
                                isItemActive(item.href) ? 'bg-blue-50' : 'hover:bg-gray-50'
                              }`}
                            >
                              <Link
                                href={item.href}
                                className={`flex flex-1 items-center min-w-0 px-3 py-1.5 text-sm transition-colors ${
                                  isItemActive(item.href)
                                    ? 'text-blue-700 font-medium'
                                    : 'text-gray-700 hover:text-blue-600'
                                }`}
                              >
                                <item.icon className="w-4 h-4 mr-2.5 flex-shrink-0" />
                                <span className="truncate">{item.name}</span>
                              </Link>
                              <button
                                onClick={() => togglePinned(item.href)}
                                title={isPinned ? 'Unpin from top' : 'Pin to top'}
                                aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${group.label} ${item.name}`}
                                aria-pressed={isPinned}
                                className={`px-2 py-1.5 transition-opacity duration-200 ease-out ${
                                  isPinned
                                    ? 'opacity-100'
                                    : 'opacity-0 group-hover/item:opacity-100 focus:opacity-100'
                                }`}
                              >
                                <Star
                                  className={`w-4 h-4 transition duration-200 ease-out hover:scale-110 ${
                                    isPinned
                                      ? 'fill-yellow-400 text-yellow-400'
                                      : 'text-gray-400 hover:text-yellow-500'
                                  }`}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
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
                  {formatSubscriptionStatus(subscription_status)} Plan
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