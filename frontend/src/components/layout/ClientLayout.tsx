'use client';

import { AuthProvider } from '@/lib/firebase/auth-context';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex flex-col min-h-screen">
        <main className="flex-grow">
          {children}
        </main>
      </div>
    </AuthProvider>
  );
} 