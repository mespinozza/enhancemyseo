'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';

/**
 * Client-side gating only, exactly like the blog admin pages. It hides the UI from
 * non-admins; the real enforcement is the admin check inside every /api/results route,
 * because anything in the browser can be bypassed.
 */
export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading, subscription_status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user || subscription_status !== 'admin') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <ShieldAlert className="mx-auto h-10 w-10 text-gray-400" />
          <h1 className="mt-4 text-xl font-semibold text-gray-900">Access restricted</h1>
          <p className="mt-2 text-gray-600">
            Case study management is only available to administrators.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
