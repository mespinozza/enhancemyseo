/**
 * Splits generated article HTML into top-level editable blocks and back again.
 *
 * Round-trip fidelity is the hard requirement: `serializeBlocks(parseBlocks(html))`
 * must equal `html` byte for byte. This is achieved by slicing the original string
 * rather than re-serializing a DOM, because generated articles contain hand-built
 * chart/table markup with inline styles that a DOM round-trip would normalize.
 */

export type BlockKind = 'prose' | 'visual' | 'raw';

export interface ArticleBlock {
  id: string;
  kind: BlockKind;
  /** Lowercased tag name, or null for whitespace/comment segments. */
  tag: string | null;
  /** Exact source slice for this segment. */
  html: string;
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const PROSE_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote',
]);

function classify(tag: string): BlockKind {
  return PROSE_TAGS.has(tag) ? 'prose' : 'visual';
}

/** Index just past the `>` that closes the tag starting at `start`. */
function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i + 1;
  }
  return -1;
}

/** True when `index` sits at a real tag-name boundary (so `<div` !== `<divider`). */
function isTagBoundary(html: string, index: number): boolean {
  const ch = html[index];
  return ch === undefined || ch === '>' || ch === '/' || /\s/.test(ch);
}

/** Index just past the `</tag>` matching the element opened before `from`. */
function findMatchingClose(html: string, tag: string, from: number): number {
  const lower = html.toLowerCase();
  const openNeedle = `<${tag}`;
  const closeNeedle = `</${tag}`;
  let depth = 1;
  let i = from;

  while (i < html.length) {
    const nextComment = lower.indexOf('<!--', i);
    const nextOpen = lower.indexOf(openNeedle, i);
    const nextClose = lower.indexOf(closeNeedle, i);

    if (nextClose === -1) return -1;

    // Comments can contain tag-like text; skip over them wholesale.
    if (nextComment !== -1 && nextComment < nextClose && (nextOpen === -1 || nextComment < nextOpen)) {
      const end = lower.indexOf('-->', nextComment + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      if (isTagBoundary(html, nextOpen + openNeedle.length)) {
        depth++;
        const end = findTagEnd(html, nextOpen);
        i = end === -1 ? nextOpen + openNeedle.length : end;
      } else {
        i = nextOpen + openNeedle.length;
      }
      continue;
    }

    if (!isTagBoundary(html, nextClose + closeNeedle.length)) {
      i = nextClose + closeNeedle.length;
      continue;
    }

    depth--;
    const gt = html.indexOf('>', nextClose);
    const stop = gt === -1 ? html.length : gt + 1;
    if (depth === 0) return stop;
    i = stop;
  }

  return -1;
}

export function parseBlocks(html: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  if (!html) return blocks;

  let counter = 0;
  const push = (kind: BlockKind, tag: string | null, text: string) => {
    if (!text) return;
    blocks.push({ id: `b${counter++}`, kind, tag, html: text });
  };

  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      push('raw', null, html.slice(i));
      break;
    }
    if (lt > i) push('raw', null, html.slice(i, lt));

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      const stop = end === -1 ? html.length : end + 3;
      push('raw', null, html.slice(lt, stop));
      i = stop;
      continue;
    }

    const next = html[lt + 1];

    if (next === '!' || next === '?' || next === '/') {
      const end = html.indexOf('>', lt);
      const stop = end === -1 ? html.length : end + 1;
      push('raw', null, html.slice(lt, stop));
      i = stop;
      continue;
    }

    const nameMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 64));
    if (!nameMatch) {
      push('raw', null, html.slice(lt, lt + 1));
      i = lt + 1;
      continue;
    }

    const tag = nameMatch[1].toLowerCase();
    const openEnd = findTagEnd(html, lt);
    if (openEnd === -1) {
      push('raw', null, html.slice(lt));
      break;
    }

    const openTag = html.slice(lt, openEnd);
    if (VOID_TAGS.has(tag) || /\/>\s*$/.test(openTag)) {
      push(classify(tag), tag, openTag);
      i = openEnd;
      continue;
    }

    const closeEnd = findMatchingClose(html, tag, openEnd);
    const stop = closeEnd === -1 ? html.length : closeEnd;
    push(classify(tag), tag, html.slice(lt, stop));
    i = stop;
  }

  return blocks;
}

export function serializeBlocks(blocks: ArticleBlock[]): string {
  return blocks.map((block) => block.html).join('');
}

export interface SplitElement {
  open: string;
  inner: string;
  close: string;
}

/**
 * Separates an element's opening tag, inner HTML, and closing tag so the inner
 * content can be edited without disturbing attributes on the wrapper.
 */
export function splitElement(html: string): SplitElement | null {
  const openEnd = findTagEnd(html, 0);
  if (openEnd === -1) return null;

  const nameMatch = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html);
  if (!nameMatch) return null;

  const tag = nameMatch[1].toLowerCase();
  if (VOID_TAGS.has(tag)) return null;

  const closeStart = html.toLowerCase().lastIndexOf(`</${tag}`);
  if (closeStart < openEnd) return null;

  return {
    open: html.slice(0, openEnd),
    inner: html.slice(openEnd, closeStart),
    close: html.slice(closeStart),
  };
}

/** Rebuilds an element with new inner HTML, preserving the wrapper's attributes. */
export function replaceInner(html: string, inner: string): string {
  const parts = splitElement(html);
  if (!parts) return html;
  return `${parts.open}${inner}${parts.close}`;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
};

/** Visible text of an HTML fragment, for diffing, word counts, and previews. */
export function htmlToText(html: string): string {
  let text = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|section)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  for (const [entity, char] of Object.entries(ENTITIES)) {
    text = text.split(entity).join(char);
  }
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));

  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function countWords(html: string): number {
  const text = htmlToText(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function isEditableBlock(block: ArticleBlock): boolean {
  return block.kind !== 'raw';
}

/** Short human label for a block, used by the outline and AI panel headers. */
export function blockLabel(block: ArticleBlock): string {
  if (block.kind === 'raw') return 'spacing';
  const tag = block.tag ?? 'element';
  if (tag === 'h1') return 'Title';
  if (/^h[2-6]$/.test(tag)) return `Heading ${tag.slice(1)}`;
  if (tag === 'p') return 'Paragraph';
  if (tag === 'ul' || tag === 'ol') return 'List';
  if (tag === 'table') return 'Table';
  if (tag === 'blockquote') return 'Quote';
  if (tag === 'div') return 'Visual block';
  return tag;
}
