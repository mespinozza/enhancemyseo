'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import type { TokenUser as User } from '@/lib/thumbnail/client';
import type { CreditBalance, CreditKind, CreditPack } from './packs';

export interface CreditsResponse {
  credits: CreditBalance;
  canBuy: boolean;
  packs: Pick<CreditPack, 'id' | 'kind' | 'credits' | 'priceUsd' | 'label'>[];
}

async function authed(user: User, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}`, ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const fetchCredits = (user: User): Promise<CreditsResponse> => authed(user, '/api/credits');

/** Sends the browser to Stripe Checkout for a pack; it comes back to `returnTo`. */
export async function buyPack(user: User, pack: CreditPack['id'], returnTo: string): Promise<void> {
  const { checkoutUrl } = await authed(user, '/api/credits/checkout', {
    method: 'POST',
    body: JSON.stringify({ pack, returnTo }),
  });
  window.location.assign(checkoutUrl);
}

/** Thanks the buyer when Stripe sends them back, and drops the marker from the address. */
export function useCreditReturn() {
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('credits')) return;
    toast.success('Payment received. Your extra credits are added within a few seconds.');
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
}

export const creditNoun = (kind: CreditKind, n: number) =>
  kind === 'articles' ? `${n} extra article${n === 1 ? '' : 's'}` : `${n} extra photo${n === 1 ? '' : 's'}`;
