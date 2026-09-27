/**
 * Meta Conversions API (CAPI) — server-side event sending.
 *
 * Fires events directly from our server to Meta, bypassing browser
 * ad-blockers and iOS 14+ restrictions. Used primarily for Purchase
 * events triggered by Stripe webhooks.
 *
 * Docs: https://developers.facebook.com/docs/marketing-api/conversions-api
 */

import crypto from 'crypto';

const PIXEL_ID = '1623137655971546';
const CAPI_ENDPOINT = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`;

/** SHA-256 hash required by Meta for PII fields (email, phone, etc.) */
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

export interface CAPIEventOptions {
  /** Meta standard event name e.g. "Purchase", "CompleteRegistration" */
  eventName: string;
  /** Customer email address (will be hashed automatically) */
  email?: string | null;
  /** Raw client IP forwarded from request headers */
  clientIp?: string | null;
  /** Raw user-agent forwarded from request headers */
  clientUserAgent?: string | null;
  /** Monetary value for Purchase / Subscribe events */
  value?: number;
  /** ISO currency code, defaults to USD */
  currency?: string;
  /** Human-readable plan name e.g. "Kickstart Monthly" */
  contentName?: string;
  /**
   * Deduplication ID — set the same value in the browser fbq() call to avoid
   * double-counting. Use the Stripe invoice ID or session ID.
   */
  eventId?: string;
}

/**
 * Send a single event to Meta's Conversions API.
 * Fire-and-forget — errors are logged but never thrown so they don't
 * break the calling webhook handler.
 */
export async function sendMetaCAPIEvent(options: CAPIEventOptions): Promise<void> {
  const accessToken = process.env.META_CONVERSIONS_API_TOKEN;
  if (!accessToken) {
    console.warn('[CAPI] META_CONVERSIONS_API_TOKEN not set — skipping event:', options.eventName);
    return;
  }

  // Build hashed user data
  const userData: Record<string, unknown> = {};
  if (options.email) {
    userData.em = [sha256(options.email)];
  }
  if (options.clientIp) {
    userData.client_ip_address = options.clientIp;
  }
  if (options.clientUserAgent) {
    userData.client_user_agent = options.clientUserAgent;
  }

  // Build event object
  const event: Record<string, unknown> = {
    event_name: options.eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data: userData,
  };

  if (options.eventId) {
    event.event_id = options.eventId;
  }

  if (options.value !== undefined) {
    event.custom_data = {
      value: options.value,
      currency: options.currency ?? 'USD',
      ...(options.contentName ? { content_name: options.contentName } : {}),
    };
  }

  try {
    const res = await fetch(CAPI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [event],
        access_token: accessToken,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[CAPI] Error sending event:', options.eventName, body);
    } else {
      console.log(`[CAPI] ✅ ${options.eventName} sent — id: ${options.eventId ?? 'n/a'}`);
    }
  } catch (err) {
    console.error('[CAPI] Network error sending event:', options.eventName, err);
  }
}
