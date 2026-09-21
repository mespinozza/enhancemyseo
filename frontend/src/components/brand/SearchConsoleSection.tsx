'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/firebase/auth-context';

interface SearchConsoleSectionProps {
  /** Undefined while the brand profile is still unsaved and has no ID to attach to. */
  brandId?: string;
  /** Where the OAuth round trip should land afterwards. */
  returnTo?: string;
}

interface GscStatus {
  configured: boolean;
  connected: boolean;
  needsReconnect?: boolean;
  googleEmail?: string | null;
  sites: Array<{ siteUrl: string; permissionLevel: string }>;
  error?: string;
}

export default function SearchConsoleSection({
  brandId,
  returnTo = '/dashboard/settings/brands',
}: SearchConsoleSectionProps) {
  const { user } = useAuth();
  const [status, setStatus] = useState<GscStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!user || !brandId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/gsc/status?brandId=${encodeURIComponent(brandId)}`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not check Search Console');
      setStatus(payload as GscStatus);
    } catch (error) {
      console.error('Error checking Search Console:', error);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [user, brandId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);


  const handleConnect = async () => {
    if (!user || !brandId) return;

    setIsWorking(true);
    try {
      const response = await fetch('/api/gsc/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ brandId, returnTo }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not start the connection');

      window.location.href = payload.url;
    } catch (error) {
      console.error('Error connecting Search Console:', error);
      toast.error(error instanceof Error ? error.message : 'Could not connect Search Console');
      setIsWorking(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user || !brandId) return;
    if (!confirm('Disconnect Search Console from this brand? Automations using it will stop.')) {
      return;
    }

    setIsWorking(true);
    try {
      const response = await fetch('/api/gsc/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ brandId }),
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Could not disconnect');
      }

      toast.success('Search Console disconnected');
      await loadStatus();
    } catch (error) {
      console.error('Error disconnecting Search Console:', error);
      toast.error(error instanceof Error ? error.message : 'Could not disconnect');
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="border-t border-gray-200 pt-4">
      <h3 className="mb-4 text-lg font-medium text-gray-900">Google Search Console</h3>
      <p className="mb-4 text-sm text-gray-600">
        Read-only access to this brand&apos;s search performance, so automations can write about the
        terms already sending you traffic.
      </p>

      {!brandId ? (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          Save this brand profile first, then connect Search Console to it.
        </p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking connection...
        </div>
      ) : !status?.configured ? (
        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Search Console is not set up on this deployment yet. It needs Google OAuth credentials
            before it can be connected.
          </p>
        </div>
      ) : status.connected ? (
        <div className="space-y-3">
          <div
            className={`flex items-start gap-2 rounded-md border p-3 text-xs ${
              status.needsReconnect
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-green-200 bg-green-50 text-green-800'
            }`}
          >
            {status.needsReconnect ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div>
              <p className="font-medium">
                {status.needsReconnect
                  ? 'Reconnection needed'
                  : `Connected${status.googleEmail ? ` as ${status.googleEmail}` : ''}`}
              </p>
              {status.needsReconnect ? (
                <p className="mt-0.5">{status.error}</p>
              ) : (
                <p className="mt-0.5">
                  {status.sites.length} propert{status.sites.length === 1 ? 'y' : 'ies'} available
                  {status.googleEmail ? '' : ' for this account'}.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={isWorking}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Reconnect
            </button>
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              disabled={isWorking}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={isWorking}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isWorking ? 'Opening Google...' : 'Connect Search Console'}
          </button>
          <p className="mt-2 text-xs text-gray-500">
            Save any unsaved changes first — connecting leaves this page and comes back.
          </p>
        </div>
      )}
    </div>
  );
}
