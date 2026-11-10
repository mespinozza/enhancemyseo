import { NextResponse } from 'next/server';
import { shopifyCredentialResponse } from '@/lib/shopify/credentials';

export function planFailure(error: unknown, fallback: string) {
  if (error instanceof Error && error.name === 'ShopifyCredentialError') {
    const { error: message, status } = shopifyCredentialResponse(error);
    return NextResponse.json({ error: message, code: 'shopify' }, { status });
  }
  console.error(`${fallback}:`, error);
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}
