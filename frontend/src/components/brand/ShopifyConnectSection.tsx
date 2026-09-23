'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/firebase/auth-context';

interface ShopifyConnectSectionProps {
  /** Undefined while the brand profile is still unsaved and has no ID to attach to. */
  brandId?: string;
  /** Taken from the form, so the store can be connected before the profile is saved. */
  storeUrl?: string;
  /** Where the OAuth round trip should land afterwards. */
  returnTo?: string;
}

interface ShopifyStatus {
  configured: boolean;
  connected: boolean;
  storeUrl?: string | null;
  shopDomain?: string | null;
  scope?: string | null;
  connectedAt?: string | null;
  hasLegacyToken: boolean;
  source: 'oauth' | 'stored' | 'app' | null;
}

export default function ShopifyConnectSection({
  brandId,
  storeUrl,
  returnTo = '/dashboard/settings/brands',
}: ShopifyConnectSectionProps) {
  const { user } = useAuth();
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!user || !brandId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/shopify/status?brandId=${encodeURIComponent(brandId)}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not check the store connection');
      setStatus(payload as ShopifyStatus);
    } catch (error) {
      console.error('Error checking Shopify connection:', error);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [user, brandId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // The callback can only report back through the URL, since it returns as a plain
  // browser redirect from Shopify.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('shopify');
    if (!result) return;

    if (result === 'connected') {
      toast.success(`Connected to ${params.get('shop') || 'your store'}`);
    } else {
      toast.error(params.get('reason') || 'Could not connect your store');
    }

    window.history.replaceState({}, '', window.location.pathname);
    void loadStatus();
  }, [loadStatus]);

  const handleConnect = async () => {
    if (!user || !brandId) return;

    setIsWorking(true);
    try {
      const response = await fetch('/api/shopify/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ brandId, shopDomain: storeUrl, returnTo }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not start the connection');

      window.location.href = payload.url;
    } catch (error) {
      console.error('Error connecting Shopify:', error);
      toast.error(error instanceof Error ? error.message : 'Could not connect your store');
      setIsWorking(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user || !brandId) return;
    if (!confirm('Disconnect this Shopify store? Automations that push to it will stop.')) {
      return;
    }

    setIsWorking(true);
    try {
      const response = await fetch('/api/shopify/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ brandId }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not disconnect');

      toast.success('Store disconnected');
      await loadStatus();
    } catch (error) {
      console.error('Error disconnecting Shopify:', error);
      toast.error(error instanceof Error ? error.message : 'Could not disconnect');
    } finally {
      setIsWorking(false);
    }
  };

  if (!brandId) {
    return (
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-lg font-medium text-gray-900">Store connection</h3>
        <p className="mt-2 text-sm text-gray-600">
          Save this brand profile first, then connect its Shopify store.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-200 pt-4">
      <h3 className="text-lg font-medium text-gray-900">Store connection</h3>
      <p className="mt-1 mb-4 text-sm text-gray-600">
        Approve access once in Shopify and we hold the connection for you. This is how
        articles get pushed, and how products and collections are found for linking.
      </p>

      {isLoading && !status ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking the connection...
        </div>
      ) : status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-sm text-green-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">Connected to {status.shopDomain}</p>
              {status.scope && (
                <p className="text-xs text-green-600">Permissions granted: {status.scope}</p>
              )}
            </div>
          </div>

          {status.hasLegacyToken && (
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              This profile still has an old access token saved. The connection above is
              what gets used, so the token field is ignored and safe to clear.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConnect}
              disabled={isWorking}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Reconnect
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isWorking}
              className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {!status?.configured && (
            <p className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              The Shopify app is not configured on this deployment yet, so connecting will
              fail until SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are set.
            </p>
          )}

          {status?.hasLegacyToken && (
            <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
              This profile is using an access token saved by hand. Shopify no longer issues
              those, and it stops working once revoked — connecting below replaces it.
            </p>
          )}

          <button
            type="button"
            onClick={handleConnect}
            disabled={isWorking || !status?.configured}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isWorking && <Loader2 className="h-4 w-4 animate-spin" />}
            Connect Shopify
          </button>

          <p className="text-xs text-gray-500">
            Uses the store URL above. It has to be the permanent
            my-store.myshopify.com address, not a custom domain.
          </p>
        </div>
      )}
    </div>
  );
}
