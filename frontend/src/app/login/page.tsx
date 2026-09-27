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

// ── Disposable / burner email domains blocklist ──────────────────────────────
// Extend this list as new throwaway services appear.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com','guerrillamail.com','guerrillamail.net','guerrillamail.org',
  'guerrillamail.biz','guerrillamail.de','guerrillamail.info','grr.la',
  'sharklasers.com','guerrillamailblock.com','spam4.me','yopmail.com',
  'yopmail.fr','cool.fr.nf','jetable.fr.nf','nospam.ze.tc','nomail.xl.cx',
  'mega.zik.dj','speed.1s.fr','courriel.fr.nf','moncourrier.fr.nf',
  'monemail.fr.nf','monmail.fr.nf','trashmail.com','trashmail.me',
  'trashmail.net','trashmail.org','trashmail.at','trashmail.io',
  'trashmail.xyz','dispostable.com','mailnull.com','spamgourmet.com',
  'spamgourmet.net','spamgourmet.org','throwam.com','throwam.net',
  'throwam.org','throwam.me','maildrop.cc','mailnesia.com','mailnull.com',
  'tempmail.com','tempmail.net','temp-mail.org','tempr.email',
  'fakeinbox.com','fakeinbox.net','getnada.com','getairmail.com',
  'discard.email','spamthisplease.com','mailcatch.com','mailsucker.net',
  'spammotel.com','spamfree24.org','spamfree.eu','deadaddress.com',
  'nwldx.com','ezztt.com','spamgob.com','discardmail.com','discardmail.de',
  'spam.la','cuvox.de','dayrep.com','einrot.com','fleckens.hu','gustr.com',
  'jourrapide.com','rhyta.com','superrito.com','teleworm.us',
  'armyspy.com','cuvox.de','dayrep.com','einrot.com','fleckens.hu',
  'teleworm.us','superrito.com','rhyta.com','jourrapide.com','gustr.com',
  'armyspy.com','10minutemail.com','10minutemail.net','10minutemail.org',
  '10minutemail.co.za','10minutemail.de','10minutemail.eu',
  'minutemailbox.com','20minutemail.com','getonemail.com','binkmail.com',
  'bobmail.info','chacuo.net','devnullmail.com','dispostable.com',
  'dump-email.info','e4ward.com','emaildienst.de','fakeinbox.com',
  'filzmail.com','flyspam.com','gift4me.org','google.com.com',
  'greensloth.com','hartbot.de','incognitomail.com','jetable.com',
  'kasmail.com','klassmaster.net','koszmail.pl','lol.ovpn.to',
  'mail-temporaire.fr','maileimer.de','mailexpire.com','mailforspam.com',
  'mailinater.com','mailme.lv','mailnew.com','mailnull.com',
  'mailseal.de','mailslapping.com','mailzilla.org','megxo.com',
  'melt.in','momentics.ru','moncourrier.fr.nf','nospamfor.us',
  'nowmymail.com','objectmail.com','obobbo.com','onewaymail.com',
  'owlpic.com','pecinan.com','proxymail.eu','rcpt.at','rklips.com',
  'rmqkr.net','royal.net','safetymail.info','sandelf.de',
  'spamavert.com','spambox.us','spaml.com','spaml.de',
  'speed.1s.fr','super-auswahl.de','temporaryinbox.com','thanksnospam.com',
  'thc.st','the-fastest.net','thelimestones.com','throwam.com',
  'tilien.com','tmailinator.com','toiea.com','tradermail.info',
  'trash-amil.com','trash2009.com','trashdevil.com','trashdevil.net',
  'turual.com','twinmail.de','uggsrock.com','veryrealemail.com',
  'viditag.com','webm4il.info','wetrainbayarea.com','wh4f.org',
  'whyspam.me','willhackforfood.biz','wilemail.com','willhackforfood.biz',
  'willselfdestruct.com','wuzupmail.net','xoxy.net','yogamaven.com',
  'yopmail.com','yopmail.fr','you-spam.com','ypmail.webarnak.fr.eu.org',
  'z1p.biz','zerocrime.net','zippymail.info','zkozmail.com',
]);

function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_DOMAINS.has(domain);
}

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
      // Block disposable / throwaway email addresses
      if (isDisposableEmail(data.email)) {
        setError('Please use a real email address. Temporary or disposable email services are not allowed.');
        return;
      }
      await registerUser(data.email, data.password);
      // ── CompleteRegistration pixel event ──────────────────────────────
      try {
        (window as Window & { fbq?: (...args: unknown[]) => void }).fbq?.('track', 'CompleteRegistration', {
          status: 'success',
          content_name: 'Email Signup',
        });
      } catch { /* pixel not ready — safe to ignore */ }
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
                      {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
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
                      {showPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
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
                      {showConfirmPassword ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
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