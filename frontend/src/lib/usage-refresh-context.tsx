'use client';

import React, { createContext, useContext, useRef, useCallback } from 'react';

export interface UsageRefreshContextValue {
  registerRefreshFunction: (tool: 'articles' | 'keywords', refreshFn: () => Promise<void>) => void;
  unregisterRefreshFunction: (tool: 'articles' | 'keywords') => void;
  refreshUsage: (tool?: 'articles' | 'keywords') => Promise<void>;
  refreshAllUsage: () => Promise<void>;
}

const UsageRefreshContext = createContext<UsageRefreshContextValue | null>(null);

export function UsageRefreshProvider({ children }: { children: React.ReactNode }) {
  const refreshFunctions = useRef<{
    articles?: () => Promise<void>;
    keywords?: () => Promise<void>;
  }>({});

  const registerRefreshFunction = useCallback((tool: 'articles' | 'keywords', refreshFn: () => Promise<void>) => {
    console.log(`Registering refresh function for ${tool}`);
    refreshFunctions.current[tool] = refreshFn;
  }, []);

  const unregisterRefreshFunction = useCallback((tool: 'articles' | 'keywords') => {
    console.log(`Unregistering refresh function for ${tool}`);
    delete refreshFunctions.current[tool];
  }, []);

  const refreshUsage = useCallback(async (tool?: 'articles' | 'keywords') => {
    if (tool) {
      const refreshFn = refreshFunctions.current[tool];
      if (refreshFn) {
        console.log(`Refreshing usage for ${tool}`);
        await refreshFn();
      } else {
        console.warn(`No refresh function registered for ${tool}`);
      }
    }
  }, []);

  const refreshAllUsage = useCallback(async () => {
    console.log('Refreshing all usage data');
    const promises = Object.entries(refreshFunctions.current).map(([tool, refreshFn]) => {
      if (refreshFn) {
        console.log(`Refreshing usage for ${tool}`);
        return refreshFn();
      }
      return Promise.resolve();
    });
    
    await Promise.all(promises);
    console.log('All usage data refreshed');
  }, []);

  const value: UsageRefreshContextValue = {
    registerRefreshFunction,
    unregisterRefreshFunction,
    refreshUsage,
    refreshAllUsage,
  };

  return (
    <UsageRefreshContext.Provider value={value}>
      {children}
    </UsageRefreshContext.Provider>
  );
}

export function useUsageRefresh() {
  const context = useContext(UsageRefreshContext);
  if (!context) {
    throw new Error('useUsageRefresh must be used within a UsageRefreshProvider');
  }
  return context;
} 