'use client';

import { AuthProvider } from '@/lib/firebase/auth-context';
import MainLayout from '@/components/layout/MainLayout';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <MainLayout>
        {children}
      </MainLayout>
    </AuthProvider>
  );
} 