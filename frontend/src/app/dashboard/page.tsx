'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  FileText,
  ImageIcon,
  Infinity as InfinityIcon,
  Plus,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { db } from '@/lib/firebase/config';
import { blogOperations, brandProfileOperations, type Blog, type BrandProfile } from '@/lib/firebase/firestore';
import { getUsageDisplay, getUserUsage } from '@/lib/usage-limits';
import { useAllowance } from '@/lib/allowance';
import { automationLimit, canAutomate } from '@/lib/automation/limits';
import { AUTOMATIONS_COLLECTION } from '@/lib/automation/types';
import { getFilteredNavigation, type SubscriptionTier } from '@/config/navigation';
import WelcomeCard from '@/components/onboarding/WelcomeCard';
import FeedbackCard from '@/components/dashboard/FeedbackCard';
import { pendingTutorialThumbnail, type TutorialThumbnailArticle } from '@/lib/thumbnail/tutorial-pending';

const TIER_NAMES: Record<SubscriptionTier, string> = {
  free: 'Free',
  kickstart: 'Kickstart',
  seo_takeover: 'SEO Takeover',
  agency: 'Agency',
  admin: 'Admin',
};

const TIER_BADGES: Record<SubscriptionTier, string> = {
  free: 'bg-gray-100 text-gray-700 ring-gray-200',
  kickstart: 'bg-blue-50 text-blue-700 ring-blue-200',
  seo_takeover: 'bg-purple-50 text-purple-700 ring-purple-200',
  agency: 'bg-amber-50 text-amber-700 ring-amber-200',
  admin: 'bg-green-50 text-green-700 ring-green-200',
};

interface Overview {
  used: number;
  limit: number | 'unlimited';
  recent: Blog[];
  total: number | null;
  brands: BrandProfile[];
  automations: { total: number; enabled: number } | null;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function dateOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const toDate = (value as { toDate?: () => Date } | null)?.toDate;
  return typeof toDate === 'function' ? toDate.call(value) : null;
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  href,
  action,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  href: string;
  action: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-gray-500">{detail}</p>}
      {children}
      <Link href={href} className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-medium text-blue-600 hover:text-blue-800">
        {action} <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`block animate-pulse rounded bg-gray-100 ${className}`} />;
}

export default function DashboardHome() {
  const { user, subscription_status } = useAuth();
  const tier = (subscription_status || 'free') as SubscriptionTier;
  const [overview, setOverview] = useState<Overview | null>(null);
  const { allowance: articleAllowance } = useAllowance('articles');
  const { allowance: photos } = useAllowance('thumbnails');

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    const uid = user.uid;
    const automates = canAutomate(tier);
    (async () => {
      const [usage, recent, total, brands, automations] = await Promise.allSettled([
        getUserUsage(uid),
        blogOperations.getRecent(uid, 5),
        getCountFromServer(query(collection(db, 'blogs'), where('userId', '==', uid))).then((s) => s.data().count),
        brandProfileOperations.getAll(uid),
        automates
          ? getDocs(query(collection(db, AUTOMATIONS_COLLECTION), where('userId', '==', uid))).then((s) => ({
              total: s.size,
              enabled: s.docs.filter((d) => d.data().enabled).length,
            }))
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const display = usage.status === 'fulfilled' ? getUsageDisplay(tier, 'articles', usage.value) : null;
      setOverview({
        used: display?.used ?? 0,
        limit: display?.limit ?? 'unlimited',
        recent: recent.status === 'fulfilled' ? recent.value : [],
        total: total.status === 'fulfilled' ? total.value : null,
        brands: brands.status === 'fulfilled' ? brands.value : [],
        automations: automations.status === 'fulfilled' ? automations.value : null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, tier]);

  // A thumbnail offered in the tutorial, now paid for: it is made on the articles page.
  const [pendingThumb, setPendingThumb] = useState<TutorialThumbnailArticle | null>(null);
  useEffect(() => {
    if (tier !== 'free') setPendingThumb(pendingTutorialThumbnail());
  }, [tier]);

  const firstName = user?.displayName?.trim().split(/\s+/)[0];
  const automates = canAutomate(tier);
  const activeLimit = automationLimit(tier);
  const tools = useMemo(() => getFilteredNavigation(tier), [tier]);

  const setup = useMemo(() => {
    if (!overview) return null;
    const steps = [
      {
        label: 'Create a brand profile',
        detail: 'Your business, voice and audience, used for every article.',
        done: overview.brands.length > 0,
        href: '/dashboard/settings/brands',
      },
      {
        label: 'Connect your store or website',
        detail: 'Shopify or your site, so articles link your own products and pages.',
        done: overview.brands.some((b) => b.shopifyStoreUrl || b.websiteUrl),
        href: '/dashboard/settings/brands',
      },
      {
        label: 'Write your first article',
        detail: 'About 3 minutes, researched and fact-checked.',
        done: (overview.total ?? overview.recent.length) > 0,
        href: '/dashboard/articles',
      },
      ...(automates
        ? [
            {
              label: 'Automate your publishing',
              detail: 'Pick keywords once and new articles go out on a schedule.',
              done: (overview.automations?.total ?? 0) > 0,
              href: '/dashboard/automate',
            },
          ]
        : []),
    ];
    return { steps, done: steps.filter((s) => s.done).length };
  }, [overview, canAutomate]);

  const used = overview?.used ?? 0;
  const limit = overview?.limit ?? 'unlimited';
  const percent = typeof limit === 'number' && limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const extraArticles = articleAllowance?.credits ?? 0;
  const outOfArticles = typeof limit === 'number' && used >= limit && extraArticles === 0;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <WelcomeCard />

      {pendingThumb && (
        <Link
          href="/dashboard/articles"
          className="mb-6 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm hover:bg-blue-100"
        >
          <ImageIcon className="h-5 w-5 flex-shrink-0 text-blue-600" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-gray-900">Your thumbnail is ready to make</span>
            <span className="block truncate text-gray-600">For &ldquo;{pendingThumb.title}&rdquo;, set as its featured image</span>
          </span>
          <span className="inline-flex flex-shrink-0 items-center gap-1 font-semibold text-blue-700">
            Get it <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {greeting()}
              {firstName ? `, ${firstName}` : ''}
            </h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TIER_BADGES[tier]}`}>
              {TIER_NAMES[tier]} plan
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Here&apos;s where your content stands.</p>
        </div>
        <Link
          href="/dashboard/articles"
          className="group inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md"
        >
          <Plus className="h-4 w-4" />
          Write an article
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Articles this month"
          value={
            overview ? (
              <>
                {used}
                <span className="text-base font-medium text-gray-400"> / {limit === 'unlimited' ? <InfinityIcon className="inline h-4 w-4 align-[-2px]" /> : limit}</span>
              </>
            ) : (
              <Skeleton className="h-8 w-16" />
            )
          }
          detail={
            overview
              ? [
                  limit === 'unlimited'
                    ? 'Unlimited on your plan'
                    : `${Math.max(0, limit - used)} left this month${extraArticles ? ` + ${extraArticles} extra` : ''}`,
                  photos?.included &&
                    (photos.unlimited ? 'unlimited thumbnails' : `${photos.left} thumbnail photo${photos.left === 1 ? '' : 's'}`),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : undefined
          }
          href={outOfArticles ? (tier === 'free' ? '/pricing' : '/dashboard/settings#extra-credits') : '/dashboard/articles'}
          action={outOfArticles ? 'Get more articles' : 'Write one'}
        >
          {typeof limit === 'number' && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ${percent >= 100 ? 'bg-amber-500' : 'bg-blue-600'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </StatCard>

        <StatCard
          icon={FileText}
          label="Total articles"
          value={overview ? (overview.total ?? overview.recent.length) : <Skeleton className="h-8 w-12" />}
          detail="Everything you've written"
          href="/dashboard/history"
          action="View all"
        />

        <StatCard
          icon={Building2}
          label="Brand profiles"
          value={overview ? overview.brands.length : <Skeleton className="h-8 w-10" />}
          detail={
            overview
              ? `${overview.brands.filter((b) => b.shopifyStoreUrl || b.websiteUrl).length} connected to a store or site`
              : undefined
          }
          href="/dashboard/settings/brands"
          action="Manage"
        />

        {automates ? (
          <StatCard
            icon={Workflow}
            label="Automations"
            value={overview ? (overview.automations?.enabled ?? 0) : <Skeleton className="h-8 w-10" />}
            detail={
              overview
                ? `${activeLimit === Infinity ? 'active' : `active of ${activeLimit} allowed`} · ${overview.automations?.total ?? 0} set up`
                : undefined
            }
            href="/dashboard/automate"
            action={(overview?.automations?.total ?? 0) > 0 ? 'Open automations' : 'Set one up'}
          />
        ) : (
          <StatCard
            icon={Workflow}
            label="Automations"
            value={<span className="text-base font-semibold text-gray-700">Publish on autopilot</span>}
            detail="Scheduled articles from your keywords, from the Kickstart plan."
            href="/services/seo-growth-automation"
            action="See plans"
          />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Recent articles</h2>
            <Link href="/dashboard/history" className="text-sm font-medium text-blue-600 hover:text-blue-800">
              View all
            </Link>
          </div>
          {!overview ? (
            <ul className="divide-y divide-gray-100">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </li>
              ))}
            </ul>
          ) : overview.recent.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <FileText className="h-6 w-6" />
              </span>
              <p className="mt-3 font-medium text-gray-900">No articles yet</p>
              <p className="mt-1 text-sm text-gray-500">Your first one takes about 3 minutes.</p>
              <Link
                href="/dashboard/articles"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Write my first article <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {overview.recent.map((blog) => {
                const created = dateOf(blog.createdAt);
                const brand = overview.brands.find((b) => b.id === blog.brandId);
                const published = blog.status === 'published';
                return (
                  <li key={blog.id}>
                    <Link
                      href={`/dashboard/articles/${blog.id}/edit`}
                      className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-gray-50"
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-inset ring-blue-100">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{blog.title || blog.keyword || 'Untitled article'}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {[created?.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), brand?.brandName].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span
                        className={`hidden flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset sm:inline ${
                          published ? 'bg-green-50 text-green-700 ring-green-200' : 'bg-gray-50 text-gray-600 ring-gray-200'
                        }`}
                      >
                        {published ? 'Published' : 'Draft'}
                      </span>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-500" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          {setup && setup.done < setup.steps.length && (
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Finish setting up</h2>
                <span className="text-xs font-medium text-gray-500">
                  {setup.done} of {setup.steps.length}
                </span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-green-500 transition-[width] duration-700"
                  style={{ width: `${(setup.done / setup.steps.length) * 100}%` }}
                />
              </div>
              <ol className="mt-4 space-y-1">
                {setup.steps.map((step) => (
                  <li key={step.label}>
                    <Link
                      href={step.href}
                      className={`group -mx-2 flex items-start gap-3 rounded-lg px-2 py-2 transition-colors ${step.done ? '' : 'hover:bg-gray-50'}`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                          step.done ? 'bg-green-500 text-white' : 'border-2 border-gray-300 group-hover:border-blue-500'
                        }`}
                      >
                        {step.done && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-medium ${step.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                          {step.label}
                        </span>
                        {!step.done && <span className="mt-0.5 block text-xs text-gray-500">{step.detail}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900">Tools</h2>
            <ul className="mt-3 space-y-1">
              {tools.map((tool) => (
                <li key={tool.href}>
                  <Link
                    href={tool.href}
                    className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-200 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:ring-blue-100">
                      <tool.icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 font-medium">{tool.name === 'Tools' ? 'Automations' : tool.name}</span>
                    <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500" />
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/dashboard/settings/brands"
                  className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-200 group-hover:bg-blue-50 group-hover:text-blue-600 group-hover:ring-blue-100">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="flex-1 font-medium">Brand profiles</span>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500" />
                </Link>
              </li>
            </ul>
          </section>

          <FeedbackCard />
        </div>
      </div>
    </div>
  );
}
