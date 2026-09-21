import { FileText, Key, Package, LayoutGrid, Image, Workflow, LucideIcon } from 'lucide-react';

// All subscription tiers in the system
export type SubscriptionTier = 'free' | 'kickstart' | 'seo_takeover' | 'agency' | 'admin';

export interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  requiredSubscription?: SubscriptionTier[];
}

export interface NavigationGroup {
  /** Rendered with a trailing ellipsis, e.g. "Generate..." */
  label: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: 'Generate',
    items: [
      {
        name: 'Article',
        href: '/dashboard/articles',
        icon: FileText,
        requiredSubscription: ['free', 'kickstart', 'seo_takeover', 'agency', 'admin'] // Available to all users
      },
      {
        name: 'Keywords',
        href: '/dashboard/keywords',
        icon: Key,
        requiredSubscription: ['admin'] // Admin only
      },
      {
        name: 'Thumbnail',
        href: '/dashboard/generate-thumbnail',
        icon: Image,
        requiredSubscription: ['admin'] // Admin only
      },
    ],
  },
  {
    label: 'Optimize',
    items: [
      {
        name: 'Collections',
        href: '/dashboard/collections',
        icon: LayoutGrid,
        requiredSubscription: ['admin'] // Admin only
      },
      {
        name: 'Products',
        href: '/dashboard/products',
        icon: Package,
        requiredSubscription: ['admin'] // Admin only
      },
    ],
  },
  {
    label: 'Automate',
    items: [
      {
        name: 'Tools',
        href: '/dashboard/automate',
        icon: Workflow,
        requiredSubscription: ['admin'] // Admin only
      },
    ],
  },
];

/** Flat list of every item, for consumers that don't care about grouping. */
export const navigationItems: NavigationItem[] = navigationGroups.flatMap((group) => group.items);

const isPermitted = (item: NavigationItem, subscriptionStatus: SubscriptionTier): boolean => {
  // If no required subscription is specified, show to everyone
  if (!item.requiredSubscription) return true;

  // Check if user's subscription status is in the required list
  return item.requiredSubscription.includes(subscriptionStatus);
};

// Filter navigation items based on subscription status
export const getFilteredNavigation = (subscriptionStatus: SubscriptionTier): NavigationItem[] => {
  return navigationItems.filter((item) => isPermitted(item, subscriptionStatus));
};

/** Same filtering, but grouped for the sidebar. Groups left empty are dropped. */
export const getFilteredNavigationGroups = (
  subscriptionStatus: SubscriptionTier,
): NavigationGroup[] => {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isPermitted(item, subscriptionStatus)),
    }))
    .filter((group) => group.items.length > 0);
};
