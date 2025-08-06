import { FileText, Key, Package, LayoutGrid, Image, LucideIcon } from 'lucide-react';

// All subscription tiers in the system
export type SubscriptionTier = 'free' | 'kickstart' | 'seo_takeover' | 'agency' | 'admin';

export interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  requiredSubscription?: SubscriptionTier[];
}

export const navigationItems: NavigationItem[] = [
  { 
    name: 'Generate Article', 
    href: '/dashboard/articles', 
    icon: FileText,
    requiredSubscription: ['free', 'kickstart', 'seo_takeover', 'agency', 'admin'] // Available to all users
  },
  { 
    name: 'Generate Keywords', 
    href: '/dashboard/keywords', 
    icon: Key,
    requiredSubscription: ['admin'] // Admin only
  },
  { 
    name: 'Generate Thumbnail', 
    href: '/dashboard/generate-thumbnail', 
    icon: Image,
    requiredSubscription: ['admin'] // Admin only
  },
  { 
    name: 'Optimize Collections', 
    href: '/dashboard/collections', 
    icon: LayoutGrid,
    requiredSubscription: ['admin'] // Admin only
  },
  { 
    name: 'Optimize Products', 
    href: '/dashboard/products', 
    icon: Package,
    requiredSubscription: ['admin'] // Admin only
  },
];

// Filter navigation items based on subscription status
export const getFilteredNavigation = (subscriptionStatus: SubscriptionTier): NavigationItem[] => {
  return navigationItems.filter(item => {
    // If no required subscription is specified, show to everyone
    if (!item.requiredSubscription) return true;
    
    // Check if user's subscription status is in the required list
    return item.requiredSubscription.includes(subscriptionStatus);
  });
}; 