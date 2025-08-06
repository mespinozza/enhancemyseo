'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential, User, updateProfile } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useUsageRefresh } from '@/lib/usage-refresh-context';
import { createCustomerPortalSession } from '@/lib/stripe';

// Interface for debug functions attached to window
interface WindowWithDebug extends Window {
  setMeAsAdmin?: () => Promise<void>;
}

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

export default function SettingsPage() {
  const { user, refreshSubscriptionStatus } = useAuth();
  const { refreshAllUsage, refreshSidebar } = useUsageRefresh();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isGoogleLinked, setIsGoogleLinked] = useState(false);
  const [isResettingUsage, setIsResettingUsage] = useState(false);
  const [targetUserEmail, setTargetUserEmail] = useState('');
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [isOpeningBillingPortal, setIsOpeningBillingPortal] = useState(false);

  // Monitor Firebase auth user for provider data
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser?.providerData) {
        const hasGoogle = fbUser.providerData.some(provider => provider.providerId === 'google.com');
        setIsGoogleLinked(hasGoogle);
      } else {
        setIsGoogleLinked(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    setValue,
    formState: { errors: profileErrors, isDirty: isProfileDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user?.displayName || '',
      email: user?.email || '',
    },
  });

  // Update form values when user changes
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
      // Update display name in Firebase Auth
      await updateProfile(firebaseUser, {
        displayName: data.displayName,
      });

      toast.success('Profile updated successfully!');
    } catch (error: unknown) {
      console.error('Profile update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile';
      toast.error(errorMessage);
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    if (!firebaseUser || !firebaseUser.email) {
      toast.error('User not authenticated');
      return;
    }
    
    try {
      // Check if user signed up with Google (password change not allowed)
      if (isGoogleLinked && firebaseUser.providerData.length === 1 && firebaseUser.providerData[0].providerId === 'google.com') {
        toast.error('Cannot change password for Google accounts. Please manage your password through Google.');
        return;
      }

      // Re-authenticate user before changing password
      const credential = EmailAuthProvider.credential(firebaseUser.email, data.currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      
      // Update password
      await updatePassword(firebaseUser, data.newPassword);
      
      toast.success('Password updated successfully!');
      resetPasswordForm();
      setIsChangingPassword(false);
    } catch (error: unknown) {
      console.error('Password update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update password';
      
      // Handle specific Firebase auth errors
      if (error instanceof Error) {
        if (error.message.includes('wrong-password')) {
          toast.error('Current password is incorrect');
        } else if (error.message.includes('weak-password')) {
          toast.error('New password is too weak');
        } else {
          toast.error(errorMessage);
        }
      } else {
        toast.error('Failed to update password');
      }
    }
  };

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      // Implement account deletion logic
      toast.error('Account deletion is not yet implemented. Please contact support.');
    }
  };

  const handleResetUsage = async (targetEmail?: string) => {
    if (!user || user.subscription_status !== 'admin') {
      toast.error('Admin access required');
      return;
    }

    const confirmMessage = targetEmail 
      ? `Reset usage data for ${targetEmail}?`
      : 'Reset your own usage data for testing?';
      
    if (!confirm(confirmMessage)) return;

    setIsResettingUsage(true);
    
    try {
      // Get the user's ID token for authentication
      const idToken = await firebaseUser?.getIdToken();
      if (!idToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch('/api/admin/reset-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          targetUserEmail: targetEmail || undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to reset usage');
      }

      toast.success(result.message || 'Usage data reset successfully!');
      
      // CRITICAL: Refresh all usage trackers after successful reset
      if (!targetEmail) {
        // Only refresh if we reset our own usage
        console.log('Refreshing usage displays after successful reset...');
        await refreshAllUsage();
        console.log('Usage displays refreshed');
      }
      
      // Clear the target email field
      setTargetUserEmail('');
      
    } catch (error: unknown) {
      console.error('Error resetting usage:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to reset usage data';
      toast.error(errorMessage);
    } finally {
      setIsResettingUsage(false);
    }
  };

  const handleRefreshSubscriptionStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      await refreshSubscriptionStatus();
      toast.success('Subscription status refreshed successfully!');
    } catch (error: unknown) {
      console.error('Error refreshing subscription status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh subscription status';
      toast.error(errorMessage);
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  const handleDebugSubscription = async () => {
    if (!user || !firebaseUser) {
      toast.error('User not authenticated');
      return;
    }

    try {
      // Get the user's ID token
      const idToken = await firebaseUser.getIdToken();
      
      console.log('🐛 DEBUG: Frontend user object:', {
        uid: user.uid,
        email: user.email,
        subscription_status: user.subscription_status
      });

      // Test what the server sees
      const response = await fetch('/api/admin/reset-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          debug: true // Special debug flag
        }),
      });

      const result = await response.json();
      console.log('🐛 DEBUG: Server response:', result);
      
      if (response.status === 403) {
        toast.error(`Server sees you as: ${result.serverSubscriptionStatus || 'unknown'}, but frontend sees: ${user.subscription_status}`);
      } else {
        toast.success('Debug info logged to console');
      }
      
    } catch (error: unknown) {
      console.error('Debug error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Debug failed';
      toast.error(errorMessage);
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to open billing portal';
      toast.error(errorMessage);
    } finally {
      setIsOpeningBillingPortal(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      <div className="mb-8">
        <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:tracking-tight">
          Settings
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="grid gap-6 sm:gap-8 sm:grid-cols-1 md:grid-cols-2 mb-8 sm:mb-12">
        <Link
          href="/dashboard/settings/brands"
          className="block p-4 sm:p-6 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-500 hover:shadow-md transition-colors"
        >
          <h2 className="text-lg font-medium text-gray-900 mb-2">Brand Profiles</h2>
          <p className="text-sm text-gray-600">
            Manage your brand profiles and Shopify integrations
          </p>
        </Link>

        {/* Add more settings cards here if needed */}
      </div>

      <div className="space-y-8 sm:space-y-12">
        {/* Account Information */}
        <div className="bg-white shadow sm:rounded-lg overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-200 bg-gray-50">
            <h3 className="text-base sm:text-lg font-medium leading-6 text-gray-900">
              Account Information
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Update your personal information and email preferences.
            </p>
          </div>
          <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="px-4 sm:px-6 py-4 sm:py-6">
            <div className="w-full max-w-3xl grid grid-cols-1 gap-6 sm:gap-8">
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium leading-6 text-gray-900">
                  Display Name
                </label>
                <div className="mt-2">
                  <input
                    {...registerProfile('displayName')}
                    type="text"
                    className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                  />
                  {profileErrors.displayName && (
                    <p className="mt-2 text-sm text-red-600">{profileErrors.displayName.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium leading-6 text-gray-900">
                  Email Address
                </label>
                <div className="mt-2">
                  <input
                    {...registerProfile('email')}
                    type="email"
                    disabled
                    className="block w-full rounded-md border-0 py-2 px-3 text-gray-500 bg-gray-50 shadow-sm ring-1 ring-inset ring-gray-300 sm:text-sm sm:leading-6"
                  />
                  <p className="mt-1 text-xs text-gray-500">Email changes require account verification. Contact support if needed.</p>
                  {profileErrors.email && (
                    <p className="mt-2 text-sm text-red-600">{profileErrors.email.message}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={!isProfileDirty}
                className="px-4 py-2 text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>

        {/* Security Settings */}
        <div className="bg-white shadow sm:rounded-lg overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-200 bg-gray-50">
            <h3 className="text-base sm:text-lg font-medium leading-6 text-gray-900">
              Security
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Manage your password and security preferences.
            </p>
          </div>
          <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-6">
            {/* Password Change */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Password</h4>
                  <p className="text-sm text-gray-600">
                    {isGoogleLinked && firebaseUser?.providerData.length === 1 && firebaseUser.providerData[0].providerId === 'google.com' 
                      ? 'Your account uses Google authentication' 
                      : 'Change your account password'}
                  </p>
                </div>
                <button
                  onClick={() => setIsChangingPassword(!isChangingPassword)}
                  disabled={isGoogleLinked && firebaseUser?.providerData.length === 1 && firebaseUser.providerData[0].providerId === 'google.com'}
                  className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  {isChangingPassword ? 'Cancel' : 'Change Password'}
                </button>
              </div>

              {isChangingPassword && (
                <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                      Current Password
                    </label>
                    <input
                      {...registerPassword('currentPassword')}
                      type="password"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                    {passwordErrors.currentPassword && (
                      <p className="mt-1 text-sm text-red-600">{passwordErrors.currentPassword.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                      New Password
                    </label>
                    <input
                      {...registerPassword('newPassword')}
                      type="password"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                    {passwordErrors.newPassword && (
                      <p className="mt-1 text-sm text-red-600">{passwordErrors.newPassword.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                      Confirm New Password
                    </label>
                    <input
                      {...registerPassword('confirmPassword')}
                      type="password"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                    {passwordErrors.confirmPassword && (
                      <p className="mt-1 text-sm text-red-600">{passwordErrors.confirmPassword.message}</p>
                    )}
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setIsChangingPassword(false)}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPasswordSubmitting}
                      className="px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {isPasswordSubmitting ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Google Account Linking */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Google Account</h4>
                  <p className="text-sm text-gray-600">Link your Google account for easier sign-in</p>
                </div>
                <div className="flex items-center">
                  <span className="text-sm text-gray-500 mr-3">
                    {isGoogleLinked ? 'Linked' : 'Not Linked'}
                  </span>
                  <button
                    onClick={() => {
                      if (isGoogleLinked) {
                        toast.error('Google account unlinking is not yet implemented. Contact support if needed.');
                      } else {
                        toast.success('Google account linking feature coming soon!');
                      }
                    }}
                    className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                  >
                    {isGoogleLinked ? 'Unlink' : 'Link Google'}
                  </button>
                </div>
              </div>
              {isGoogleLinked && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-green-800">
                        Your account is linked with Google ({user?.email})
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Free User Upgrade Section */}
        {user?.subscription_status === 'free' && (
          <div className="bg-white shadow sm:rounded-lg overflow-hidden border border-blue-200">
            <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-blue-200 bg-blue-50">
              <h3 className="text-base sm:text-lg font-medium leading-6 text-blue-900">
                Your Subscription
              </h3>
              <p className="mt-1 text-sm text-blue-700">
                You&apos;re currently on the Free plan with 2 articles per month.
              </p>
            </div>
            <div className="px-4 sm:px-6 py-4 sm:py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Upgrade for More Features</h4>
                  <p className="text-sm text-gray-600">
                    Get more articles, advanced features, and priority support
                  </p>
                </div>
                <Link
                  href="/#pricing"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  View Plans
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Billing & Subscription Management */}
        {user?.subscription_status !== 'free' && (
          <div className="bg-white shadow sm:rounded-lg overflow-hidden">
            <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-200 bg-gray-50">
              <h3 className="text-base sm:text-lg font-medium leading-6 text-gray-900">
                Billing & Subscription
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Manage your subscription, payment methods, and billing history.
              </p>
            </div>
            <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-6">
              {/* Current Subscription Info */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Current Plan</h4>
                                         <p className="text-sm text-gray-600">
                       You&apos;re currently on the{' '}
                       <span className="font-medium capitalize">
                         {user?.subscription_status === 'kickstart' ? 'Kickstart' : 
                          user?.subscription_status === 'seo_takeover' ? 'SEO Takeover' : 
                          user?.subscription_status === 'agency' ? 'Agency' : 
                          'Free'} plan
                       </span>
                     </p>
                  </div>
                  <div className="flex items-center">
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Active
                    </span>
                  </div>
                </div>
              </div>

              {/* Billing Portal Access */}
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Billing Management</h4>
                    <p className="text-sm text-gray-600">
                      Update your payment method, view invoices, and manage your subscription
                    </p>
                  </div>
                  <button
                    onClick={handleOpenBillingPortal}
                    disabled={isOpeningBillingPortal}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isOpeningBillingPortal ? 'Opening...' : 'Manage Billing'}
                  </button>
                </div>
                <div className="mt-3 text-xs text-gray-500">
                  <p>
                    You&apos;ll be redirected to a secure billing portal where you can:
                  </p>
                  <ul className="mt-1 ml-4 list-disc space-y-1">
                    <li>Update your payment method</li>
                    <li>Download invoices and receipts</li>
                    <li>Update billing information</li>
                    <li>Cancel or modify your subscription</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Admin Tools - Only visible to admin users */}
        {user?.subscription_status === 'admin' && (
          <div className="bg-white shadow sm:rounded-lg overflow-hidden border border-blue-200">
            <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-blue-200 bg-blue-50">
              <h3 className="text-base sm:text-lg font-medium leading-6 text-blue-900">
                Admin Tools
              </h3>
              <p className="mt-1 text-sm text-blue-700">
                Administrative functions for testing and user management.
              </p>
            </div>
            <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-6">
              {/* Reset Own Usage */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Reset My Usage Data</h4>
                    <p className="text-sm text-gray-600">
                      Clear your usage limits for testing different subscription tiers
                    </p>
                  </div>
                  <button
                    onClick={() => handleResetUsage()}
                    disabled={isResettingUsage}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isResettingUsage ? 'Resetting...' : 'Reset My Usage'}
                  </button>
                </div>
              </div>

              {/* Refresh Subscription Status */}
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Refresh Subscription Status</h4>
                    <p className="text-sm text-gray-600">
                      Sync your subscription status after manual Firestore changes (Current: <span className="font-medium text-blue-600">{user?.subscription_status}</span>)
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={handleDebugSubscription}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                    >
                      Debug
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          // Use the browser debug function to set admin status
                          if (typeof (window as WindowWithDebug).setMeAsAdmin === 'function') {
                            await (window as WindowWithDebug).setMeAsAdmin!();
                            setTimeout(() => {
                              handleRefreshSubscriptionStatus();
                            }, 1000);
                          } else {
                            toast.error('Admin setter function not available');
                          }
                        } catch (error: unknown) {
                          console.error('Error fixing admin status:', error);
                          const errorMessage = error instanceof Error ? error.message : 'Failed to fix admin status';
                          toast.error(errorMessage);
                        }
                      }}
                      className="px-3 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      Fix Admin
                    </button>
                    <button
                      onClick={handleRefreshSubscriptionStatus}
                      disabled={isRefreshingStatus}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRefreshingStatus ? 'Refreshing...' : 'Refresh Status'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Debug Sidebar Refresh */}
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Debug Sidebar History</h4>
                    <p className="text-sm text-gray-600">
                      Manually refresh the sidebar recent items to test history updates
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        console.log('Manual sidebar refresh triggered from admin settings');
                        await refreshSidebar();
                        toast.success('Sidebar history refreshed successfully!');
                      } catch (error: unknown) {
                        console.error('Sidebar refresh error:', error);
                        const errorMessage = error instanceof Error ? error.message : 'Failed to refresh sidebar';
                        toast.error(errorMessage);
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                  >
                    🔄 Refresh Sidebar
                  </button>
                </div>
              </div>

              {/* Reset Other User's Usage */}
              <div className="border-t border-gray-200 pt-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Reset Another User&apos;s Usage</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    Enter a user&apos;s email to reset their usage data (admin only)
                  </p>
                  
                  <div className="flex space-x-3">
                    <div className="flex-1">
                      <input
                        type="email"
                        value={targetUserEmail}
                        onChange={(e) => setTargetUserEmail(e.target.value)}
                        placeholder="user@example.com"
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      />
                    </div>
                    <button
                      onClick={() => handleResetUsage(targetUserEmail)}
                      disabled={isResettingUsage || !targetUserEmail.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isResettingUsage ? 'Resetting...' : 'Reset User'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Admin Notice */}
              <div className="border-t border-gray-200 pt-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        Testing Notice
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>
                          Use these tools to reset usage limits when testing different subscription tiers. 
                          This allows you to test the full user experience without waiting for cooldown periods.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="bg-white shadow sm:rounded-lg overflow-hidden border border-red-200">
          <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-red-200 bg-red-50">
            <h3 className="text-base sm:text-lg font-medium leading-6 text-red-900">
              Danger Zone
            </h3>
            <p className="mt-1 text-sm text-red-700">
              Irreversible and destructive actions.
            </p>
          </div>
          <div className="px-4 sm:px-6 py-4 sm:py-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-gray-900">Delete Account</h4>
                <p className="text-sm text-gray-600">Permanently delete your account and all associated data</p>
              </div>
              <button
                onClick={handleDeleteAccount}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 