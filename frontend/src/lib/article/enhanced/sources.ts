import type { ResearchSource } from './types';

/**
 * Sites a Sources list must never cite. Retailers and marketplaces are competitors for
 * the stores this writes for; forums and social sites carry no authority. The writer is
 * also told to choose only authoritative sources, but a list it cannot pick from is a
 * stronger guarantee than an instruction.
 */
const BLOCKED_DOMAINS = [
  'amazon.', 'ebay.', 'walmart.', 'target.com', 'homedepot.', 'lowes.', 'wayfair.',
  'overstock.', 'etsy.', 'alibaba.', 'aliexpress.', 'temu.', 'costco.', 'bestbuy.',
  'samsclub.', 'build.com', 'ferguson.com', 'webstaurantstore.', 'katom.', 'ckitchen.',
  'centralrestaurant.', 'therestaurantstore.', 'restaurantsupply.', 'partstown.',
  'reddit.', 'quora.', 'pinterest.', 'facebook.', 'instagram.', 'tiktok.', 'x.com',
  'twitter.', 'youtube.', 'medium.com', 'linkedin.',
];

export const MAX_SOURCES_OFFERED = 12;

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Sources the writer may cite: deduplicated by URL, http(s) only, nothing blocked, and
 * nothing on the brand's own sites, which belong in internal links rather than a
 * Sources list.
 */
export function filterSources(sources: ResearchSource[], ownUrls: string[]): ResearchSource[] {
  const ownHosts = new Set(ownUrls.map(hostOf).filter((host): host is string => Boolean(host)));
  const seen = new Set<string>();
  const kept: ResearchSource[] = [];

  for (const source of sources) {
    const host = hostOf(source.url);
    if (!host || ownHosts.has(host)) continue;
    if (BLOCKED_DOMAINS.some((blocked) => host.includes(blocked))) continue;

    const key = source.url.replace(/[#?].*$/, '').replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);

    kept.push({ title: (source.title || host).trim(), url: source.url });
    if (kept.length >= MAX_SOURCES_OFFERED) break;
  }

  return kept;
}
