'use client';

import { useState, Suspense } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect } from 'react';
import { FcGoogle } from 'react-icons/fc';
import { Eye, EyeOff } from 'lucide-react';
import { createCheckoutSession } from '@/lib/stripe';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = z
  .object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

// Separate component for purchase intent handling that uses useSearchParams
function PurchaseIntentHandler() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (user) {
      // Check for purchase intent parameters
      const intent = searchParams.get('intent');
      const priceId = searchParams.get('priceId');
      const tierName = searchParams.get('tierName');
      
      if (intent === 'purchase' && priceId && tierName) {
        // User logged in with purchase intent - redirect to Stripe checkout
        handlePurchaseIntent(priceId, tierName);
      } else {
        // Normal login - redirect to dashboard
        router.push('/dashboard');
      }
    }
  }, [user, router, searchParams]);

  const handlePurchaseIntent = async (priceId: string, tierName: string) => {
    try {
      console.log('Processing purchase intent for:', tierName, 'with priceId:', priceId);
      
      if (tierName === 'Free') {
        // Free tier - just go to dashboard
        router.push('/dashboard');
        return;
      }

      // Get user token and create checkout session
      const userToken = await user!.getIdToken();
      await createCheckoutSession(priceId, userToken);
    } catch (error) {
      console.error('Purchase intent error:', error);
      alert(`Payment Error: ${error instanceof Error ? error.message : 'Something went wrong. Please try again.'}`);
      // Fallback to dashboard on error
      router.push('/dashboard');
    }
  };

  return null; // This component doesn't render anything
}

function LoginForm() {
  const { login, register: registerUser, signInWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const activeForm = isLogin ? loginForm : signupForm;
  const { formState: { isSubmitting } } = activeForm;

  const switchTab = (toLogin: boolean) => {
    setIsLogin(toLogin);
    setError('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    loginForm.reset();
    signupForm.reset();
  };

  const onLoginSubmit = async (data: LoginFormData) => {
    try {
      setError('');
      await login(data.email, data.password);
    } catch (err: unknown) {
      if (err instanceof Error && err.message) setError(err.message);
    }
  };

  const onSignupSubmit = async (data: SignupFormData) => {
    try {
      setError('');
      await registerUser(data.email, data.password);
    } catch (err: unknown) {
      if (err instanceof Error && err.message) setError(err.message);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      await signInWithGoogle();
    } catch (err: unknown) {
      if (err instanceof Error && err.message) setError(err.message);
    }
  };

  const loginErrors = loginForm.formState.errors;
  const signupErrors = signupForm.formState.errors;

  return (
    <div className="min-h-screen flex flex-col py-12 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white shadow sm:rounded-lg">
          {/* Tabs */}
          <div className="flex border-b">
            <button
              onClick={() => switchTab(true)}
              className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${
                isLogin ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => switchTab(false)}
              className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${
                !isLogin ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="px-4 py-8 sm:px-10">
            {error && (
              <div className="rounded-md bg-red-50 p-4 mb-6">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            {/* ── Sign In ── */}
            {isLogin && (
              <form className="space-y-6" onSubmit={loginForm.handleSubmit(onLoginSubmit)}>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email address</label>
                  <div className="mt-1">
                    <input
                      {...loginForm.register('email')}
                      type="email"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                    {loginErrors.email && (
                      <p className="mt-2 text-sm text-red-600">{loginErrors.email.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <div className="mt-1 relative">
                    <input
                      {...loginForm.register('password')}
                      type={showPassword ? 'text' : 'password'}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {loginErrors.password && (
                    <p className="mt-2 text-sm text-red-600">{loginErrors.password.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200"
                >
                  {isSubmitting ? 'Processing...' : 'Sign In'}
                </button>
              </form>
            )}

            {/* ── Sign Up ── */}
            {!isLogin && (
              <form className="space-y-6" onSubmit={signupForm.handleSubmit(onSignupSubmit)}>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email address</label>
                  <div className="mt-1">
                    <input
                      {...signupForm.register('email')}
                      type="email"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                    {signupErrors.email && (
                      <p className="mt-2 text-sm text-red-600">{signupErrors.email.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <div className="mt-1 relative">
                    <input
                      {...signupForm.register('password')}
                      type={showPassword ? 'text' : 'password'}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {signupErrors.password && (
                    <p className="mt-2 text-sm text-red-600">{signupErrors.password.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
                  <div className="mt-1 relative">
                    <input
                      {...signupForm.register('confirmPassword')}
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {signupErrors.confirmPassword && (
                    <p className="mt-2 text-sm text-red-600">{signupErrors.confirmPassword.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200"
                >
                  {isSubmitting ? 'Creating account...' : 'Sign Up'}
                </button>
              </form>
            )}

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">Or continue with</span>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-3 px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
                >
                  <FcGoogle className="h-5 w-5" />
                  Continue with Google
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <>
      <Suspense fallback={<div>Loading...</div>}>
        <PurchaseIntentHandler />
      </Suspense>
      <LoginForm />
    </>
  );
} 