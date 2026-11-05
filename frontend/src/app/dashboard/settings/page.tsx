'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  ChevronRight,
  CreditCard,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Store,
  Users,
} from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, User, updateProfile } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useUsageRefresh } from '@/lib/usage-refresh-context';
import { createCustomerPortalSession } from '@/lib/stripe';
import { USAGE_LIMITS } from '@/lib/usage-limits';
import { PLAN_LABELS, type Plan } from '@/lib/admin/customers';

const profileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required'),
  email: z.string().email('Invalid email address'),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(6, 'Current password is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

const INPUT =
  'block w-full rounded-lg border-0 px-3 py-2 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600';
const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/** Title and description on the left from lg up, the controls in a card beside them. */
function Section({
  title,
  description,
  children,
  danger = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section className="grid gap-4 border-b border-gray-200 py-8 last:border-b-0 lg:grid-cols-3 lg:gap-8">
      <div>
        <h2 className={`text-base font-semibold ${danger ? 'text-red-700' : 'text-gray-900'}`}>{title}</h2>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>
      <div
        className={`divide-y overflow-hidden rounded-xl border bg-white shadow-sm lg:col-span-2 ${
          danger ? 'divide-red-100 border-red-200' : 'divide-gray-100 border-gray-200'
        }`}
      >
        {children}
      </div>
    </section>
  );
}

/** One setting: what it is on the left, its action on the right (below on phones). */
function Row({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        {description && <div className="mt-0.5 text-sm text-gray-600">{description}</div>}
      </div>
      {children && <div className="flex flex-shrink-0 flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export default function SettingsPage() {
  const { user, refreshSubscriptionStatus } = useAuth();
  const { refreshAllUsage, refreshSidebar } = useUsageRefresh();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isResettingUsage, setIsResettingUsage] = useState(false);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [isRefreshingSidebar, setIsRefreshingSidebar] = useState(false);
  const [isOpeningBillingPortal, setIsOpeningBillingPortal] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(setFirebaseUser);
    return () => unsubscribe();
  }, []);

  const providers = firebaseUser?.providerData.map((provider) => provider.providerId) ?? [];
  const hasGoogle = providers.includes('google.com');
  const hasPassword = providers.includes('password');

  const plan = (user?.subscription_status ?? 'free') as Plan;
  const isAdmin = plan === 'admin';
  const isFree = plan === 'free';
  const articleLimit = USAGE_LIMITS[plan]?.articles;

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    setValue,
    reset: resetProfileForm,
    formState: { errors: profileErrors, isDirty: isProfileDirty, isSubmitting: isProfileSubmitting },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user?.displayName || '',
      email: user?.email || '',
    },
  });

  useEffect(() => {
    if (user) {
      setValue('displayName', user.displayName || '');
      setValue('email', user.email || '');
    }
  }, [user, setValue]);

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPasswordForm,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting },
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  const onProfileSubmit = async (data: ProfileFormData) => {
    if (!firebaseUser) {
      toast.error('User not authenticated');
      return;
    }

    try {
      await updateProfile(firebaseUser, { displayName: data.displayName });
      resetProfileForm(data);
      toast.success('Profile updated');
    } catch (error: unknown) {
      console.error('Profile update error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    if (!firebaseUser || !firebaseUser.email) {
      toast.error('User not authenticated');
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(firebaseUser.email, data.currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, data.newPassword);

      toast.success('Password updated');
      resetPasswordForm();
      setIsChangingPassword(false);
    } catch (error: unknown) {
      console.error('Password update error:', error);
      const message = error instanceof Error ? error.message : '';
      if (message.includes('wrong-password') || message.includes('invalid-credential')) {
        toast.error('Current password is incorrect');
      } else if (message.includes('weak-password')) {
        toast.error('New password is too weak');
      } else {
        toast.error(message || 'Failed to update password');
      }
    }
  };

  const handleResetUsage = async () => {
    if (!user || !isAdmin) {
      toast.error('Admin access required');
      return;
    }
    if (!confirm("Reset your own article and keyword counts? AI cost history is kept.")) return;

    setIsResettingUsage(true);
    try {
      const idToken = await firebaseUser?.getIdToken();
      if (!idToken) throw new Error('No authentication token available');

      const response = await fetch('/api/admin/reset-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to reset usage');

      toast.success('Usage reset');
      await refreshAllUsage();
    } catch (error: unknown) {
      console.error('Error resetting usage:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reset usage data');
    } finally {
      setIsResettingUsage(false);
    }
  };

  const handleRefreshSubscriptionStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      await refreshSubscriptionStatus();
      toast.success('Plan status refreshed');
    } catch (error: unknown) {
      console.error('Error refreshing subscription status:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to refresh subscription status');
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  const handleRefreshSidebar = async () => {
    setIsRefreshingSidebar(true);
    try {
      await refreshSidebar();
      toast.success('Sidebar refreshed');
    } catch (error: unknown) {
      console.error('Sidebar refresh error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to refresh sidebar');
    } finally {
      setIsRefreshingSidebar(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    if (!user) {
      toast.error('You must be logged in');
      return;
    }

    try {
      setIsOpeningBillingPortal(true);
      const userToken = await user.getIdToken();
      await createCustomerPortalSession(userToken);
    } catch (error: unknown) {
      console.error('Error opening billing portal:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to open billing portal');
    } finally {
      setIsOpeningBillingPortal(false);
    }
  };

  const initial = (user?.displayName || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="mx-auto w-full max-w-5xl p-4 pb-16 sm:p-6 lg:p-8">
      <header className="border-b border-gray-200 pb-6">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-gray-600">Manage your account, plan and brands.</p>
      </header>

      <Section title="Profile" description="How you appear in EnhanceMySEO.">
        <form onSubmit={handleProfileSubmit(onProfileSubmit)}>
          <div className="space-y-5 px-5 py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-semibold text-white">
                {initial}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900">{user?.displayName || 'No name set'}</div>
                <div className="truncate text-sm text-gray-500">{user?.email}</div>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-900">
                  Display name
                </label>
                <input id="displayName" {...registerProfile('displayName')} type="text" className={`mt-1.5 ${INPUT}`} />
                {profileErrors.displayName && (
                  <p className="mt-1.5 text-sm text-red-600">{profileErrors.displayName.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-900">
                  Email address
                </label>
                <input
                  id="email"
                  {...registerProfile('email')}
                  type="email"
                  disabled
                  className={`mt-1.5 ${INPUT} cursor-not-allowed bg-gray-50 text-gray-500`}
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  To change your email,{' '}
                  <Link href="/contact" className="text-blue-600 hover:underline">
                    contact support
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-end bg-gray-50 px-5 py-3">
            <button type="submit" disabled={!isProfileDirty || isProfileSubmitting} className={PRIMARY_BUTTON}>
              {isProfileSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </button>
          </div>
        </form>
      </Section>

      <Section title="Plan & billing" description="Your plan, monthly allowance and payment details.">
        <Row
          title={
            <span className="flex items-center gap-2">
              {PLAN_LABELS[plan] ?? 'Free'} plan
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  isFree ? 'bg-gray-100 text-gray-700' : 'bg-green-100 text-green-800'
                }`}
              >
                {isAdmin ? 'Admin' : isFree ? 'Free' : 'Active'}
              </span>
            </span>
          }
          description={
            articleLimit === 'unlimited'
              ? 'Unlimited articles each month.'
              : typeof articleLimit === 'number'
                ? `${articleLimit} articles each month.`
                : undefined
          }
        >
          {isFree && (
            <Link href="/pricing" className={PRIMARY_BUTTON}>
              <Sparkles className="h-4 w-4" />
              Upgrade
            </Link>
          )}
          {!isFree && !isAdmin && (
            <Link href="/pricing" className={SECONDARY_BUTTON}>
              Compare plans
            </Link>
          )}
        </Row>
        {isFree ? (
          <Row
            title="Get more out of EnhanceMySEO"
            description="Paid plans add more articles, bulk generation and automated publishing."
          />
        ) : isAdmin ? (
          <Row title="Billing" description="Admin accounts aren't billed." />
        ) : (
          <Row
            title="Billing"
            description="Update your card, download invoices, or change or cancel your plan in Stripe's secure portal."
          >
            <button onClick={handleOpenBillingPortal} disabled={isOpeningBillingPortal} className={SECONDARY_BUTTON}>
              {isOpeningBillingPortal ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Manage billing
            </button>
          </Row>
        )}
      </Section>

      <Section title="Brands" description="The stores and websites you write for.">
        <Link
          href="/dashboard/settings/brands"
          className="group flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">Brand profiles</div>
              <div className="text-sm text-gray-600">Brand voice, website, Shopify and Search Console connections.</div>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </Section>

      <Section title="Sign-in & security" description="How you sign in to your account.">
        <Row
          title="Google"
          description={hasGoogle ? `Signed in with Google as ${user?.email}.` : 'Not connected.'}
        >
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              hasGoogle ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {hasGoogle ? 'Connected' : 'Not connected'}
          </span>
        </Row>
        <Row
          title="Password"
          description={
            hasPassword
              ? 'Change the password you use to sign in.'
              : 'Your account signs in with Google, so your password is managed by Google.'
          }
        >
          {hasPassword && (
            <button
              type="button"
              onClick={() => {
                setIsChangingPassword(!isChangingPassword);
                resetPasswordForm();
              }}
              className={SECONDARY_BUTTON}
            >
              <KeyRound className="h-4 w-4" />
              {isChangingPassword ? 'Cancel' : 'Change password'}
            </button>
          )}
        </Row>
        {hasPassword && isChangingPassword && (
          <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4 bg-gray-50 px-5 py-5">
            {(
              [
                ['currentPassword', 'Current password', 'current-password'],
                ['newPassword', 'New password', 'new-password'],
                ['confirmPassword', 'Confirm new password', 'new-password'],
              ] as const
            ).map(([field, label, autoComplete]) => (
              <div key={field} className="max-w-sm">
                <label htmlFor={field} className="block text-sm font-medium text-gray-900">
                  {label}
                </label>
                <input
                  id={field}
                  {...registerPassword(field)}
                  type="password"
                  autoComplete={autoComplete}
                  className={`mt-1.5 ${INPUT}`}
                />
                {passwordErrors[field] && (
                  <p className="mt-1.5 text-sm text-red-600">{passwordErrors[field]?.message}</p>
                )}
              </div>
            ))}
            <button type="submit" disabled={isPasswordSubmitting} className={PRIMARY_BUTTON}>
              {isPasswordSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Update password
            </button>
          </form>
        )}
      </Section>

      {isAdmin && (
        <Section title="Admin tools" description="Only visible to admins.">
          <Row title="Customers" description="Plans, revenue, usage and AI cost for every account.">
            <Link href="/admin/customers" className={SECONDARY_BUTTON}>
              <Users className="h-4 w-4" />
              Open portal
              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
            </Link>
          </Row>
          <Row title="Reset my usage" description="Zero your own article and keyword counts for testing.">
            <button onClick={handleResetUsage} disabled={isResettingUsage} className={SECONDARY_BUTTON}>
              {isResettingUsage ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Reset
            </button>
          </Row>
          <Row
            title="Refresh plan and sidebar"
            description="Reload your plan after editing it in Firestore, or reload the recent items list."
          >
            <button onClick={handleRefreshSubscriptionStatus} disabled={isRefreshingStatus} className={SECONDARY_BUTTON}>
              <RefreshCw className={`h-4 w-4 ${isRefreshingStatus ? 'animate-spin' : ''}`} />
              Plan
            </button>
            <button onClick={handleRefreshSidebar} disabled={isRefreshingSidebar} className={SECONDARY_BUTTON}>
              <RefreshCw className={`h-4 w-4 ${isRefreshingSidebar ? 'animate-spin' : ''}`} />
              Sidebar
            </button>
          </Row>
        </Section>
      )}

      <Section title="Delete account" description="Permanently remove your account and its data." danger>
        <Row
          title="Delete your account"
          description="Articles, brands and automations are deleted and can't be recovered. Cancel any paid plan first."
        >
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50"
          >
            Request deletion
          </Link>
        </Row>
      </Section>
    </div>
  );
}
