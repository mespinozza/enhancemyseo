'use client';

import React, { createContext, useContext, useRef, useCallback } from 'react';

export interface UsageRefreshContextValue {
  registerRefreshFunction: (tool: 'articles' | 'keywords' | 'thumbnails', refreshFn: () => Promise<void>) => void;
  unregisterRefreshFunction: (tool: 'articles' | 'keywords' | 'thumbnails') => void;
  refreshUsage: (tool?: 'articles' | 'keywords' | 'thumbnails') => Promise<void>;
  refreshAllUsage: () => Promise<void>;
  registerSidebarRefreshFunction: (refreshFn: () => Promise<void>) => void;
  unregisterSidebarRefreshFunction: () => void;
  refreshSidebar: () => Promise<void>;
}

const UsageRefreshContext = createContext<UsageRefreshContextValue | null>(null);

export function UsageRefreshProvider({ children }: { children: React.ReactNode }) {
  const refreshFunctions = useRef<{
    articles?: () => Promise<void>;
    keywords?: () => Promise<void>;
    thumbnails?: () => Promise<void>;
  }>({});

  // Add sidebar refresh function ref
  const sidebarRefreshFunction = useRef<(() => Promise<void>) | null>(null);

  const registerRefreshFunction = useCallback((tool: 'articles' | 'keywords' | 'thumbnails', refreshFn: () => Promise<void>) => {
    console.log(`Registering refresh function for ${tool}`);
    refreshFunctions.current[tool] = refreshFn;
  }, []);

  const unregisterRefreshFunction = useCallback((tool: 'articles' | 'keywords' | 'thumbnails') => {
    console.log(`Unregistering refresh function for ${tool}`);
    delete refreshFunctions.current[tool];
  }, []);

  const registerSidebarRefreshFunction = useCallback((refreshFn: () => Promise<void>) => {
    console.log('Registering sidebar refresh function');
    sidebarRefreshFunction.current = refreshFn;
  }, []);

  const unregisterSidebarRefreshFunction = useCallback(() => {
    console.log('Unregistering sidebar refresh function');
    sidebarRefreshFunction.current = null;
  }, []);

  const refreshUsage = useCallback(async (tool?: 'articles' | 'keywords' | 'thumbnails') => {
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

  const refreshSidebar = useCallback(async () => {
    if (sidebarRefreshFunction.current) {
      console.log('Refreshing sidebar');
      await sidebarRefreshFunction.current();
    } else {
      console.warn('No sidebar refresh function registered');
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
    registerSidebarRefreshFunction,
    unregisterSidebarRefreshFunction,
    refreshSidebar,
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