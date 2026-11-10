import { AsyncLocalStorage } from 'node:async_hooks';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { serverSideUsageUtils } from '@/lib/server-usage-utils';

/**
 * USD list prices. Providers change these, so check them against the Anthropic and
 * Perplexity pricing pages now and then; raw token counts are stored alongside the
 * dollar figure, so a correction here can be re-applied to past months.
 */
const ANTHROPIC_PER_MTOK: { match: string; input: number; output: number }[] = [
  { match: 'haiku', input: 1, output: 5 },
  { match: 'opus', input: 15, output: 75 },
  { match: 'sonnet', input: 3, output: 15 },
];
const ANTHROPIC_CACHE_WRITE = 1.25;
const ANTHROPIC_CACHE_READ = 0.1;
const ANTHROPIC_WEB_SEARCH = 10 / 1000;
const PERPLEXITY_PER_MTOK = 1;
const PERPLEXITY_PER_REQUEST = 5 / 1000;
/** gpt-image-1: text prompt tokens and generated image tokens. */
const OPENAI_IMAGE_INPUT_PER_MTOK = 5;
const OPENAI_IMAGE_OUTPUT_PER_MTOK = 40;

export interface MeterTotals {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  requests: number;
}

interface MeterScope {
  uid: string | null;
  totals: MeterTotals;
}

const storage = new AsyncLocalStorage<MeterScope>();

/**
 * Runs a request with a cost meter attached. Every AI call made inside it through
 * `meteredFetch` is priced and, once `attributeTo` names the user, added to that
 * user's monthly usage document.
 */
export function runMetered<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run(
    { uid: null, totals: { costUsd: 0, inputTokens: 0, outputTokens: 0, webSearches: 0, requests: 0 } },
    fn,
  );
}

/**
 * Starts metering for the rest of the calling async function, for routes that don't
 * wrap their handler in `runMetered`.
 */
export function meterAs(uid: string): void {
  storage.enterWith({
    uid,
    totals: { costUsd: 0, inputTokens: 0, outputTokens: 0, webSearches: 0, requests: 0 },
  });
}

/** Names the user the current request's AI spend belongs to. Call it right after auth. */
export function attributeTo(uid: string): void {
  const scope = storage.getStore();
  if (scope) scope.uid = uid;
}

/** What the current request has spent so far. */
export function meterTotals(): MeterTotals | null {
  return storage.getStore()?.totals ?? null;
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number } | null;
}

interface PerplexityUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: { total_cost?: number };
}

function priceAnthropic(model: string, usage: AnthropicUsage): MeterTotals {
  const rate =
    ANTHROPIC_PER_MTOK.find((entry) => model.includes(entry.match)) ??
    ANTHROPIC_PER_MTOK[ANTHROPIC_PER_MTOK.length - 1];
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;

  const costUsd =
    (input * rate.input +
      cacheWrite * rate.input * ANTHROPIC_CACHE_WRITE +
      cacheRead * rate.input * ANTHROPIC_CACHE_READ +
      output * rate.output) /
      1_000_000 +
    searches * ANTHROPIC_WEB_SEARCH;

  return {
    costUsd,
    inputTokens: input + cacheWrite + cacheRead,
    outputTokens: output,
    webSearches: searches,
    requests: 1,
  };
}

function pricePerplexity(usage: PerplexityUsage): MeterTotals {
  const input = usage.prompt_tokens ?? 0;
  const output = usage.completion_tokens ?? 0;
  const costUsd =
    usage.cost?.total_cost ??
    ((input + output) * PERPLEXITY_PER_MTOK) / 1_000_000 + PERPLEXITY_PER_REQUEST;
  return { costUsd, inputTokens: input, outputTokens: output, webSearches: 0, requests: 1 };
}

function record(scope: MeterScope, url: string, body: unknown): void {
  if (!body || typeof body !== 'object' || !('usage' in body)) return;
  const { usage, model } = body as { usage: unknown; model?: string };
  if (!usage || typeof usage !== 'object') return;

  let spend: MeterTotals;
  if (url.includes('anthropic.com')) {
    spend = priceAnthropic(model ?? '', usage as AnthropicUsage);
  } else if (url.includes('perplexity.ai')) {
    spend = pricePerplexity(usage as PerplexityUsage);
  } else if (url.includes('api.openai.com/v1/images')) {
    const { input_tokens = 0, output_tokens = 0 } = usage as { input_tokens?: number; output_tokens?: number };
    spend = {
      costUsd: (input_tokens * OPENAI_IMAGE_INPUT_PER_MTOK + output_tokens * OPENAI_IMAGE_OUTPUT_PER_MTOK) / 1_000_000,
      inputTokens: input_tokens,
      outputTokens: output_tokens,
      webSearches: 0,
      requests: 1,
    };
  } else {
    return;
  }

  const totals = scope.totals;
  totals.costUsd += spend.costUsd;
  totals.inputTokens += spend.inputTokens;
  totals.outputTokens += spend.outputTokens;
  totals.webSearches += spend.webSearches;
  totals.requests += spend.requests;

  if (!scope.uid) return;

  // Written per call rather than once at the end, so spend from a request that dies
  // part-way (a timeout, a crash in a later step) is still counted.
  initializeFirebaseAdmin();
  const docId = `${scope.uid}_${serverSideUsageUtils.getCurrentMonth()}`;
  const day = String(new Date().getDate()).padStart(2, '0');
  getFirestore()
    .collection('usage')
    .doc(docId)
    .set(
      {
        aiCostUsd: FieldValue.increment(spend.costUsd),
        aiCostDaily: { [day]: FieldValue.increment(spend.costUsd) },
        aiInputTokens: FieldValue.increment(spend.inputTokens),
        aiOutputTokens: FieldValue.increment(spend.outputTokens),
        aiWebSearches: FieldValue.increment(spend.webSearches),
        aiRequests: FieldValue.increment(spend.requests),
      },
      { merge: true },
    )
    .catch((error) => console.error('Failed to record AI spend:', error));
}

/**
 * A drop-in `fetch` for AI clients. It passes every response through untouched and
 * reads a copy of the body to price the call. Outside a metered request it does nothing.
 */
export const meteredFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  const scope = storage.getStore();
  if (!scope || !response.ok) return response;
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return response;

  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  response
    .clone()
    .json()
    .then((body) => record(scope, url, body))
    .catch(() => {});
  return response;
};
