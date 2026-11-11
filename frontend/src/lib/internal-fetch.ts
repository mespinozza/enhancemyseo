import { Agent, fetch as undiciFetch } from 'undici';

/**
 * Article generation answers only when the whole article is done, which can take longer
 * than the five minutes Node's fetch waits for response headers. Server-to-server calls
 * within this service wait up to this long instead.
 */
export const INTERNAL_TIMEOUT_MS = 15 * 60 * 1000;

const agent = new Agent({ headersTimeout: INTERNAL_TIMEOUT_MS, bodyTimeout: INTERNAL_TIMEOUT_MS });

/** `fetch` for calls from this service to its own API routes. Server-only. */
export async function internalFetch(url: string, init: RequestInit): Promise<Response> {
  const response = await undiciFetch(url, { ...(init as object), dispatcher: agent });
  return response as unknown as Response;
}
