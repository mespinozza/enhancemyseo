'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  FileText,
  Image as ImageIcon,
  Inbox,
  Layers,
  Shield,
  Users,
  type LucideIcon,
} from 'lucide-react';
import AdminGate from '@/components/results/AdminGate';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Lives outside /admin, so it opens as a tool rather than a portal section. */
  external?: boolean;
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Business',
    items: [{ href: '/admin/customers', label: 'Customers', icon: Users }],
  },
  {
    title: 'Proof',
    items: [
      { href: '/admin/results', label: 'Case studies', icon: BarChart3 },
      { href: '/admin/results/submissions', label: 'Submissions', icon: Inbox },
    ],
  },
  {
    title: 'Health',
    items: [{ href: '/admin/errors', label: 'Errors', icon: AlertTriangle }],
  },
  {
    title: 'Tools',
    items: [
      { href: '/blogs', label: 'Blogs', icon: FileText, external: true },
      { href: '/dashboard/generate-thumbnail', label: 'Thumbnail studio', icon: ImageIcon, external: true },
      { href: '/dashboard/collections', label: 'Keyword collections', icon: Layers, external: true },
    ],
  },
];

const ALL = SECTIONS.flatMap((s) => s.items).filter((i) => !i.external);

/** The most specific section the path falls under, so Submissions doesn't also light up Case studies. */
function activeHref(pathname: string): string | null {
  return (
    ALL.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const active = activeHref(usePathname() ?? '');

  const link = (item: NavItem, compact = false) => {
    const isActive = item.href === active;
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={
          compact
            ? `inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                isActive ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`
            : `group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
        }
      >
        <Icon className={`h-4 w-4 ${isActive ? 'text-blue-600' : 'text-gray-400'} ${compact && isActive ? 'text-white' : ''}`} />
        <span className="flex-1">{item.label}</span>
        {item.external && !compact && <ArrowUpRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500" />}
      </Link>
    );
  };

  return (
    <AdminGate>
      <div className="min-h-screen bg-gray-50 lg:flex">
        <aside className="hidden w-60 flex-shrink-0 border-r border-gray-200 bg-white lg:block">
          <div className="sticky top-0 max-h-screen overflow-y-auto px-3 py-6">
            <Link href="/admin" className="mb-6 flex items-center gap-2 px-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900">
                <Shield className="h-4 w-4 text-white" />
              </span>
              <span className="font-semibold text-gray-900">Admin portal</span>
            </Link>
            <nav className="space-y-6">
              {SECTIONS.map((section) => (
                <div key={section.title}>
                  <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{section.title}</p>
                  <div className="space-y-0.5">{section.items.map((item) => link(item))}</div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-4 py-2 lg:hidden">
          {SECTIONS.flatMap((s) => s.items).map((item) => link(item, true))}
        </nav>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </AdminGate>
  );
}
