'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ApolloClient, NormalizedCacheObject } from '@apollo/client';
import { createShopifyApolloClient } from '@/lib/apollo/client';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations, BrandProfile } from '@/lib/firebase/firestore';

interface ShopifyContextType {
  isConnected: boolean;
  shopDomain: string | null;
  accessToken: string | null;
  apolloClient: ApolloClient<NormalizedCacheObject> | null;
  connect: (domain: string, token: string) => void;
  disconnect: () => void;
  brandProfiles: BrandProfile[];
  selectedBrandProfile: BrandProfile | null;
  setSelectedBrandProfile: (profile: BrandProfile | null) => void;
  loading: boolean;
}

const ShopifyContext = createContext<ShopifyContextType | undefined>(undefined);

export const useShopify = () => {
  const context = useContext(ShopifyContext);
  if (context === undefined) {
    throw new Error('useShopify must be used within a ShopifyProvider');
  }
  return context;
};

interface ShopifyProviderProps {
  children: React.ReactNode;
}

export const ShopifyProvider: React.FC<ShopifyProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [shopDomain, setShopDomain] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [apolloClient, setApolloClient] = useState<ApolloClient<NormalizedCacheObject> | null>(null);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandProfile, setSelectedBrandProfile] = useState<BrandProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Load brand profiles when user is available
  useEffect(() => {
    async function loadBrandProfiles() {
      if (!user) {
        setBrandProfiles([]);
        setLoading(false);
        return;
      }

      try {
        const profiles = await brandProfileOperations.getAll(user.uid);
        setBrandProfiles(profiles);
        
        // Auto-connect if we have a profile with Shopify credentials
        const profileWithShopify = profiles.find(p => p.shopifyStoreUrl && p.shopifyAccessToken);
        if (profileWithShopify && profileWithShopify.shopifyStoreUrl && profileWithShopify.shopifyAccessToken) {
          const domain = extractShopDomain(profileWithShopify.shopifyStoreUrl);
          if (domain) {
            connect(domain, profileWithShopify.shopifyAccessToken);
            setSelectedBrandProfile(profileWithShopify);
          }
        }
      } catch (error) {
        console.error('Error loading brand profiles:', error);
      } finally {
        setLoading(false);
      }
    }

    loadBrandProfiles();
  }, [user]);

  const extractShopDomain = (url: string): string | null => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      const hostname = urlObj.hostname;
      
      // Extract shop domain from various Shopify URL formats
      if (hostname.includes('.myshopify.com')) {
        return hostname;
      } else if (hostname.includes('shopify.com')) {
        // Handle admin URLs like admin.shopify.com/store/shopname
        const pathParts = urlObj.pathname.split('/');
        const storeIndex = pathParts.indexOf('store');
        if (storeIndex >= 0 && pathParts[storeIndex + 1]) {
          return `${pathParts[storeIndex + 1]}.myshopify.com`;
        }
      }
      
      // Default: assume it's a custom domain, try to find the shop name
      return hostname;
    } catch {
      return null;
    }
  };

  const connect = (domain: string, token: string) => {
    try {
      const client = createShopifyApolloClient(domain, token);
      setApolloClient(client);
      setShopDomain(domain);
      setAccessToken(token);
      setIsConnected(true);
    } catch (error) {
      console.error('Error connecting to Shopify:', error);
      setIsConnected(false);
    }
  };

  const disconnect = () => {
    setApolloClient(null);
    setShopDomain(null);
    setAccessToken(null);
    setIsConnected(false);
    setSelectedBrandProfile(null);
  };

  const contextValue: ShopifyContextType = {
    isConnected,
    shopDomain,
    accessToken,
    apolloClient,
    connect,
    disconnect,
    brandProfiles,
    selectedBrandProfile,
    setSelectedBrandProfile,
    loading,
  };

  return (
    <ShopifyContext.Provider value={contextValue}>
      {children}
    </ShopifyContext.Provider>
  );
}; 