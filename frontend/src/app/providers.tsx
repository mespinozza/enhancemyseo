'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApolloProvider } from '@apollo/client';
import { AuthProvider } from '@/lib/firebase/auth-context';
import { ShopifyProvider } from '@/contexts/ShopifyContext';
import { UsageRefreshProvider } from '@/lib/usage-refresh-context';
import { defaultApolloClient } from '@/lib/apollo/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ApolloProvider client={defaultApolloClient}>
        <AuthProvider>
          <UsageRefreshProvider>
            <ShopifyProvider>
              {children}
            </ShopifyProvider>
          </UsageRefreshProvider>
        </AuthProvider>
      </ApolloProvider>
    </QueryClientProvider>
  );
} 