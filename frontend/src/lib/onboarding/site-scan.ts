/**
 * Reads a new customer's website for the tutorial: the homepage's title and description,
 * and what their sitemap says they sell.
 *
 * The URL comes straight from a sign-up form, so every request is treated as hostile.
 * Addresses are checked when the socket connects, not before, so a hostname that resolves
 * to a public address for the check and a private one for the request (DNS rebinding)
 * still cannot reach internal services. Redirects are followed by hand so each hop gets
 * the same check, and every body is capped in size and time.
 */
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import type { LookupFunction } from 'node:net';

const TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 4;
const MAX_HTML_BYTES = 1_500_000;
const MAX_SITEMAP_BYTES = 4_000_000;
/** Sitemap indexes on large stores list hundreds of files; a handful is enough to profile one. */
const MAX_CHILD_SITEMAPS = 6;
const USER_AGENT = 'EnhanceMySEO-SiteScan/1.0 (+https://enhancemyseo.com)';

export class ScanError extends Error {}

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    lower === '::' ||
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb') ||
    lower.startsWith('ff')
  );
}

const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '', 0);
    const list = addresses as dns.LookupAddress[];
    const blocked = list.find((entry) => isPrivateAddress(entry.address));
    if (blocked || list.length === 0) {
      return callback(new ScanError('That address is not a public website.'), '', 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

/** Accepts what people actually type: a bare domain, a full URL, or a sitemap URL. */
export function normalizeSiteInput(raw: string): { origin: string; sitemapUrl: string | null } {
  let value = raw.trim();
  if (!value) throw new ScanError('Enter your website address.');
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ScanError('That does not look like a website address.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ScanError('Only http and https websites can be scanned.');
  }
  if (url.username || url.password) throw new ScanError('Leave the login details out of the address.');
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new ScanError('Use the address your customers visit, without a port number.');
  }

  const host = url.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, '')) || !host.includes('.') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new ScanError('Use your website’s domain name, like yourstore.com.');
  }

  const sitemapUrl = /\.xml(\.gz)?$/i.test(url.pathname) ? `${url.origin}${url.pathname}` : null;
  return { origin: url.origin, sitemapUrl };
}

interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
}

function decode(buffer: Buffer, encoding: string | undefined): Buffer {
  switch ((encoding || '').toLowerCase()) {
    case 'gzip':
      return zlib.gunzipSync(buffer);
    case 'deflate':
      return zlib.inflateSync(buffer);
    case 'br':
      return zlib.brotliDecompressSync(buffer);
    default:
      return buffer;
  }
}

function requestOnce(target: URL, maxBytes: number): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const client = target.protocol === 'https:' ? https : http;
    const req = client.request(
      target,
      {
        method: 'GET',
        lookup: publicOnlyLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(new ScanError('That page is too large to scan.'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      }
    );
    const deadline = setTimeout(() => req.destroy(new ScanError('The website took too long to answer.')), TIMEOUT_MS * 2);
    req.on('timeout', () => req.destroy(new ScanError('The website took too long to answer.')));
    req.on('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    req.on('close', () => clearTimeout(deadline));
    req.end();
  });
}

export async function safeGet(url: string, maxBytes = MAX_HTML_BYTES): Promise<FetchResult> {
  let current = new URL(url);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'https:' && current.protocol !== 'http:') {
      throw new ScanError('The website redirected somewhere we cannot follow.');
    }
    const res = await requestOnce(current, maxBytes);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = new URL(res.headers.location, current);
      continue;
    }
    let body = res.body;
    try {
      body = decode(res.body, res.headers['content-encoding'] as string | undefined);
    } catch {
      // A server that mislabels its encoding still usually sent readable text.
    }
    if (/\.gz$/i.test(current.pathname) && body[0] === 0x1f && body[1] === 0x8b) {
      body = zlib.gunzipSync(body);
    }
    return {
      url: current.toString(),
      status: res.status,
      contentType: String(res.headers['content-type'] || ''),
      body: body.toString('utf8'),
    };
  }
  throw new ScanError('The website redirected too many times.');
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&[lr]squo;/g, '’')
    .replace(/&[lr]dquo;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(html: string, key: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return '';
}

export interface HomepageInfo {
  finalUrl: string;
  title: string;
  description: string;
  siteName: string;
  isShopify: boolean;
  shopDomain: string | null;
  headings: string[];
}

export function readHomepage(html: string, finalUrl: string): HomepageInfo {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const headings = Array.from(html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi))
    .map((match) => decodeEntities(match[1].replace(/<[^>]+>/g, ' ')))
    .filter((text) => text.length > 2 && text.length < 120)
    .slice(0, 12);
  const shopDomain = html.match(/["'\s/]([a-z0-9][a-z0-9-]*\.myshopify\.com)/i)?.[1]?.toLowerCase() || null;
  return {
    finalUrl,
    title,
    description: metaContent(html, 'description') || metaContent(html, 'og:description'),
    siteName: metaContent(html, 'og:site_name'),
    isShopify: Boolean(shopDomain) || /cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(html),
    shopDomain,
    headings,
  };
}

export type PageKind = 'product' | 'collection' | 'blog' | 'page';

export interface SitemapSummary {
  sitemapUrl: string | null;
  counts: Record<PageKind, number>;
  /** Readable names taken from URL slugs, used to suggest topics and in the summary. */
  samples: Record<PageKind, string[]>;
  /** Some sitemap files were not read, so the counts are a floor rather than a total. */
  partial: boolean;
}

function classify(pathname: string): PageKind {
  const path = pathname.toLowerCase();
  if (/\/products?\//.test(path) || /\/shop\/[^/]+\/?$/.test(path)) return 'product';
  if (/\/(collections?|categor(y|ies)|product-category)\//.test(path)) return 'collection';
  if (/\/(blogs?|news|articles?|posts?)\//.test(path)) return 'blog';
  return 'page';
}

function slugToName(pathname: string): string | null {
  const slug = decodeURIComponent(pathname.replace(/\/+$/, '').split('/').pop() || '')
    .replace(/\.(html?|php|aspx?)$/i, '');
  if (!slug || slug.length < 3 || /^\d+$/.test(slug)) return null;
  const words = slug.replace(/[-_+]+/g, ' ').trim();
  if (!/[a-z]/i.test(words)) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function locs(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi)).map((m) =>
    decodeEntities(m[1])
  );
}

function childKind(url: string): number {
  const lower = url.toLowerCase();
  if (lower.includes('product')) return 0;
  if (lower.includes('collection') || lower.includes('categor')) return 1;
  if (lower.includes('page')) return 2;
  if (lower.includes('blog') || lower.includes('post')) return 3;
  return 4;
}

/**
 * One file of each kind before a second of any, so a store whose index lists a dozen
 * product files still has its collections and pages read.
 */
function pickChildSitemaps(urls: string[]): string[] {
  const byKind = new Map<number, string[]>();
  for (const url of urls) {
    const kind = childKind(url);
    byKind.set(kind, [...(byKind.get(kind) || []), url]);
  }
  const picked: string[] = [];
  const kinds = Array.from(byKind.keys()).sort();
  for (let round = 0; picked.length < MAX_CHILD_SITEMAPS && round < urls.length; round++) {
    for (const kind of kinds) {
      const next = byKind.get(kind)?.[round];
      if (next && picked.length < MAX_CHILD_SITEMAPS) picked.push(next);
    }
  }
  return picked;
}

async function candidateSitemaps(origin: string, given: string | null): Promise<string[]> {
  const candidates: string[] = [];
  if (given) candidates.push(given);
  try {
    const robots = await safeGet(`${origin}/robots.txt`, 200_000);
    if (robots.status === 200) {
      for (const match of robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)) candidates.push(match[1]);
    }
  } catch {
    // No robots.txt is common and not a reason to stop.
  }
  candidates.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`);

  const host = new URL(origin).hostname.replace(/^www\./, '');
  return Array.from(new Set(candidates)).filter((candidate) => {
    try {
      // A sitemap on someone else's domain says nothing about this business.
      return new URL(candidate).hostname.replace(/^www\./, '') === host;
    } catch {
      return false;
    }
  });
}

export async function readSitemap(origin: string, given: string | null): Promise<SitemapSummary> {
  const counts: Record<PageKind, number> = { product: 0, collection: 0, blog: 0, page: 0 };
  const samples: Record<PageKind, string[]> = { product: [], collection: [], blog: [], page: [] };
  const seen = new Set<string>();
  let partial = false;

  const add = (pageUrl: string) => {
    if (seen.has(pageUrl)) return;
    seen.add(pageUrl);
    let pathname: string;
    try {
      pathname = new URL(pageUrl).pathname;
    } catch {
      return;
    }
    if (pathname === '/' || pathname === '') return;
    const kind = classify(pathname);
    counts[kind] += 1;
    const name = samples[kind].length < 40 ? slugToName(pathname) : null;
    if (name && !samples[kind].includes(name)) samples[kind].push(name);
  };

  for (const candidate of await candidateSitemaps(origin, given)) {
    let root: FetchResult;
    try {
      root = await safeGet(candidate, MAX_SITEMAP_BYTES);
    } catch {
      continue;
    }
    if (root.status !== 200 || !/<(urlset|sitemapindex)/i.test(root.body)) continue;

    if (/<sitemapindex/i.test(root.body)) {
      const listed = locs(root.body);
      const children = pickChildSitemaps(listed);
      partial = children.length < listed.length;
      const results = await Promise.allSettled(children.map((child) => safeGet(child, MAX_SITEMAP_BYTES)));
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.status === 200) locs(result.value.body).forEach(add);
      }
    } else {
      locs(root.body).forEach(add);
    }

    if (seen.size > 0) return { sitemapUrl: root.url, counts, samples, partial };
  }

  return { sitemapUrl: null, counts, samples, partial: false };
}
