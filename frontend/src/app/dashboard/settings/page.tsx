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
  const { user } = useAuth();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isGoogleLinked, setIsGoogleLinked] = useState(false);

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
    } catch (error: any) {
      console.error('Profile update error:', error);
      toast.error(error.message || 'Failed to update profile');
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
    } catch (error: any) {
      console.error('Password update error:', error);
      
      // Handle specific Firebase errors
      if (error.code === 'auth/wrong-password') {
        toast.error('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        toast.error('New password is too weak');
      } else if (error.code === 'auth/requires-recent-login') {
        toast.error('Please log out and log back in before changing your password');
      } else {
        toast.error(error.message || 'Failed to update password');
      }
    }
  };

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      // Implement account deletion logic
      toast.error('Account deletion is not yet implemented. Please contact support.');
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