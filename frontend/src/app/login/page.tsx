'use client';

import { useAuth } from '@/lib/firebase/auth-context';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FcGoogle } from 'react-icons/fc';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle, user } = useAuth();
  const [error, setError] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  // Redirect to dashboard if user is already authenticated
  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError('');
      if (isLogin) {
        await signIn(data.email, data.password);
        router.push('/dashboard');
      } else {
        await signUp(data.email, data.password);
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || `An error occurred during sign ${isLogin ? 'in' : 'up'}`);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setError('');
      await signInWithGoogle();
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'An error occurred during Google sign in');
    }
  };

  return (
    <div className="min-h-screen flex flex-col py-12 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="flex border-b">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${
                isLogin
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-4 text-sm font-medium text-center transition-colors ${
                !isLogin
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="px-4 py-8 sm:px-10">
            <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
              {error && (
                <div className="rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700"
                >
                  Email address
                </label>
                <div className="mt-1">
                  <input
                    {...register('email')}
                    type="email"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                  {errors.email && (
                    <p className="mt-2 text-sm text-red-600">
                      {errors.email.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700"
                >
                  Password
                </label>
                <div className="mt-1">
                  <input
                    {...register('password')}
                    type="password"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  />
                  {errors.password && (
                    <p className="mt-2 text-sm text-red-600">
                      {errors.password.message}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200"
                >
                  {isSubmitting ? 'Processing...' : isLogin ? 'Sign In' : 'Sign Up'}
                </button>
              </div>
            </form>

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