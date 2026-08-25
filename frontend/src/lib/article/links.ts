import type { ArticleBlock } from './blocks';
import { htmlToText } from './blocks';

/**
 * Shopify links are written inline by the generator as plain anchors with no
 * class or data attributes, so they can only be identified by URL path shape.
 * Rewrites operate on the owning block by anchor ordinal rather than by string
 * replacement, because the same href legitimately appears more than once.
 */

export type LinkKind = 'product' | 'collection' | 'page' | 'other';

export interface ArticleLink {
  blockId: string;
  /** Zero-based index of this anchor within its block. */
  occurrence: number;
  href: string;
  anchorText: string;
  kind: LinkKind;
  handle: string | null;
}

const ANCHOR_RE = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
const HREF_RE = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

const KIND_PATTERNS: Array<{ kind: LinkKind; re: RegExp }> = [
  { kind: 'product', re: /\/products\/([^/?#\s"']+)/i },
  { kind: 'collection', re: /\/collections\/([^/?#\s"']+)/i },
  { kind: 'page', re: /\/pages\/([^/?#\s"']+)/i },
];

export function classifyHref(href: string): { kind: LinkKind; handle: string | null } {
  for (const { kind, re } of KIND_PATTERNS) {
    const match = re.exec(href);
    if (match) return { kind, handle: match[1] };
  }
  return { kind: 'other', handle: null };
}

function readHref(attrs: string): string | null {
  const match = HREF_RE.exec(attrs);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

export function extractBlockLinks(block: ArticleBlock): ArticleLink[] {
  const links: ArticleLink[] = [];
  let occurrence = 0;

  ANCHOR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANCHOR_RE.exec(block.html)) !== null) {
    const href = readHref(match[1]);
    const current = occurrence++;
    if (!href) continue;

    const { kind, handle } = classifyHref(href);
    links.push({
      blockId: block.id,
      occurrence: current,
      href,
      anchorText: htmlToText(match[2]),
      kind,
      handle,
    });
  }

  return links;
}

export function extractLinks(blocks: ArticleBlock[]): ArticleLink[] {
  return blocks.flatMap(extractBlockLinks);
}

/** Only the links that point at Shopify resources we can validate and swap. */
export function extractShopifyLinks(blocks: ArticleBlock[]): ArticleLink[] {
  return extractLinks(blocks).filter((link) => link.kind !== 'other');
}

export interface LinkRewrite {
  href: string;
  /** When provided, replaces the anchor's visible text as well. */
  anchorText?: string;
}

/**
 * Rewrites a single anchor inside one block, leaving every other byte untouched.
 */
export function rewriteBlockLink(
  blockHtml: string,
  occurrence: number,
  rewrite: LinkRewrite,
): string {
  let index = 0;

  ANCHOR_RE.lastIndex = 0;
  return blockHtml.replace(ANCHOR_RE, (full, attrs: string, inner: string) => {
    if (index++ !== occurrence) return full;

    const nextAttrs = HREF_RE.test(attrs)
      ? attrs.replace(HREF_RE, `href="${escapeAttribute(rewrite.href)}"`)
      : `${attrs} href="${escapeAttribute(rewrite.href)}"`;

    const nextInner = rewrite.anchorText !== undefined
      ? escapeText(rewrite.anchorText)
      : inner;

    return `<a${nextAttrs}>${nextInner}</a>`;
  });
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Builds a storefront URL for a resource, matching how the generator writes them. */
export function buildResourceUrl(baseUrl: string, kind: LinkKind, handle: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  const segment = kind === 'product' ? 'products' : kind === 'collection' ? 'collections' : 'pages';
  return `${trimmed}/${segment}/${handle}`;
}

/** Origin of an existing href, so swaps keep whatever domain the article already uses. */
export function originOfHref(href: string): string | null {
  const match = /^(https?:\/\/[^/]+)/i.exec(href);
  return match ? match[1] : null;
}
