'use client';

import { useAuth } from '@/lib/firebase/auth-context';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, FileText, LogOut, Menu, Settings, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Site header.
 *
 * Laid out in two groups rather than one run of buttons: where you can go on the left,
 * what you can do on the right. Everything used to be the same bordered pill, which
 * left the primary action sitting in the middle of the row looking like the links
 * either side of it, and pushed the account controls in among the navigation.
 *
 * Only one thing here is solid blue, and it is the only thing most visitors should
 * press. Navigation is plain text, account actions sit behind a menu.
 */

const SERVICES = [{ href: '/services/article-generation', label: 'Article Generation' }];

export default function Header() {
  const { user, logout, subscription_status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [logoError, setLogoError] = useState(false);
  const [openMenu, setOpenMenu] = useState<'services' | 'account' | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const servicesRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);

  // A dropdown that only closes by pressing its own button is a trap on touch devices.
  useEffect(() => {
    if (!openMenu) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (servicesRef.current?.contains(target) || accountRef.current?.contains(target)) {
        return;
      }
      setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  // Leaving a menu hanging open over the new page is disorienting.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  // The dashboard has its own navigation.
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

  const isAdmin = subscription_status === 'admin';
  const onServices = pathname.startsWith('/services');
  const onBlog = pathname.startsWith('/blog');

  const navLink = (active: boolean) =>
    `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      active ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
    }`;

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Where you are */}
          <Link href="/" className="flex flex-shrink-0 items-center gap-2">
            {!logoError ? (
              // The asset is a square mark with no wordmark in it, so the name is set
              // beside it. Declared at its real 500x500 rather than a guessed ratio.
              <Image
                src="/logo.png"
                alt=""
                width={500}
                height={500}
                className="h-9 w-9"
                priority
                onError={() => setLogoError(true)}
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded bg-blue-600 text-sm font-bold text-white">
                E
              </span>
            )}
            <span className="bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-lg font-semibold text-transparent">
              EnhanceMySEO
            </span>
          </Link>

          {/* Where you can go */}
          <nav className="hidden items-center gap-1 md:flex">
            <div className="relative" ref={servicesRef}>
              <button
                type="button"
                onClick={() => setOpenMenu(openMenu === 'services' ? null : 'services')}
                aria-expanded={openMenu === 'services'}
                aria-haspopup="true"
                className={`inline-flex items-center gap-1 ${navLink(onServices)}`}
              >
                Services
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${
                    openMenu === 'services' ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openMenu === 'services' && (
                <div className="absolute left-0 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {SERVICES.map((service) => (
                    <Link
                      key={service.href}
                      href={service.href}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <FileText className="h-4 w-4 text-gray-400" />
                      {service.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link href="/blog" className={navLink(onBlog)}>
              Blog
            </Link>
          </nav>

          {/* What you can do */}
          <div className="flex flex-shrink-0 items-center gap-2">
            {!user ? (
              <>
                <Link
                  href="/login"
                  className="hidden rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 sm:inline-flex"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Get Started
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Generate Now
                </Link>

                {/* Account actions, off the main row so they stop competing with it. */}
                <div className="relative hidden md:block" ref={accountRef}>
                  <button
                    type="button"
                    onClick={() => setOpenMenu(openMenu === 'account' ? null : 'account')}
                    aria-expanded={openMenu === 'account'}
                    aria-haspopup="true"
                    aria-label="Account menu"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200"
                  >
                    {(user.email?.charAt(0) ?? 'A').toUpperCase()}
                  </button>

                  {openMenu === 'account' && (
                    <div className="absolute right-0 mt-2 w-60 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                      {user.email && (
                        <p className="truncate border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
                          {user.email}
                        </p>
                      )}

                      <Link
                        href="/dashboard/settings/brands"
                        className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Settings className="h-4 w-4 text-gray-400" />
                        Brand profiles
                      </Link>

                      {isAdmin && (
                        <Link
                          href="/blogs"
                          className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <FileText className="h-4 w-4 text-gray-400" />
                          Admin blogs
                        </Link>
                      )}

                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <LogOut className="h-4 w-4 text-gray-400" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Five buttons in a row had nowhere to go on a phone. */}
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-expanded={mobileOpen}
              aria-label="Menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 md:hidden"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-gray-200 bg-white md:hidden">
          <nav className="space-y-1 px-4 py-3">
            {SERVICES.map((service) => (
              <Link
                key={service.href}
                href={service.href}
                className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {service.label}
              </Link>
            ))}

            <Link
              href="/blog"
              className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Blog
            </Link>

            {user ? (
              <>
                <Link
                  href="/dashboard/settings/brands"
                  className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Brand profiles
                </Link>
                {isAdmin && (
                  <Link
                    href="/blogs"
                    className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Admin blogs
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <LogOut className="h-4 w-4 text-gray-400" />
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
