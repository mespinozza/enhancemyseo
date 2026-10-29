/**
 * Turns a structured Enhanced article into the HTML that is stored, edited and pushed.
 *
 * Constraints every template here honours:
 * - One top-level element per block, so the article editor treats it as one unit.
 * - No scripts, buttons, inputs or data attributes: the sanitizer strips them, and
 *   Shopify article bodies cannot rely on them. Interactive blocks use <details>.
 * - Inline styles only, since the stored HTML is shown inside other sites' themes.
 * - A plain `<h1>` with no attributes, which the issue detector and title extraction
 *   both look for.
 * - Every class starts with `emseo-` so the editor can name the block.
 */
import { hardenHtml } from '@/lib/article/rewrite';
import type {
  ArticleBlockData,
  CatalogProduct,
  EnhancedArticle,
  LinkTarget,
  ResearchSource,
} from './types';

export interface RenderContext {
  brandColor: string;
  products: CatalogProduct[];
  links: LinkTarget[];
  /** The numbered list the writer chose from. Empty when sources are off. */
  sources: ResearchSource[];
}

/* ------------------------------------------------------------------ helpers -- */

export function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Comparable form of a URL: no protocol, www, query, fragment or trailing slash. */
export function urlKey(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[#?].*$/, '')
    .replace(/\/+$/, '');
}

/** Dark or light text, whichever reads on this background. */
export function readableOn(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return '#ffffff';
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  return luminance > 0.45 ? '#111111' : '#ffffff';
}

export function headingId(text: string, used: Set<string>): string {
  const base =
    text
      .toLowerCase()
      .replace(/<[^>]+>/g, '')
      .replace(/&[a-z#0-9]+;/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 60)
      .replace(/-+$/, '') || 'section';
  let id = base;
  for (let n = 2; used.has(id); n += 1) id = `${base}-${n}`;
  used.add(id);
  return id;
}

/**
 * Cleans model-written body HTML: XSS hardening, no styles or classes the model was
 * told not to use, headings demoted below the section's H2, and every link checked
 * against the URLs this article was actually given. An invented link keeps its text and
 * loses the anchor, because a confident 404 is worse than plain text.
 */
const BODY_TAGS = new Set(['p', 'ul', 'ol', 'li', 'h3', 'strong', 'em', 'b', 'i', 'a', 'br']);

export function cleanBodyHtml(html: string, allowedUrls: Set<string>): string {
  let out = hardenHtml(String(html ?? ''));
  out = out.replace(/<\s*(style|svg|noscript|template|textarea|select)\b[\s\S]*?<\/\s*\1\s*>/gi, '');
  out = out.replace(/<(\/?)h[1-6]\b[^>]*>/gi, '<$1h3>');
  out = out.replace(/<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi, (_match, slash: string, tag: string, attrs: string) => {
    const name = tag.toLowerCase();
    if (!BODY_TAGS.has(name)) return '';
    if (slash) return name === 'br' ? '' : `</${name}>`;
    if (name !== 'a') return `<${name}>`;
    const href = (/\shref\s*=\s*(["'])(.*?)\1/i.exec(attrs)?.[2] ?? '').replace(/&amp;/g, '&').trim();
    return `<a href="${escapeHtml(href)}">`;
  });
  out = out.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (_match, href: string, text: string) => {
    const raw = href.replace(/&amp;/g, '&');
    if (raw.startsWith('#') && /^#[a-z0-9-]+$/i.test(raw)) return `<a href="${href}">${text}</a>`;
    if (!safeUrl(raw) || !allowedUrls.has(urlKey(raw))) return text;
    return `<a href="${href}">${text}</a>`;
  });
  return out.replace(/<a href="[^"]*">(?![\s\S]*?<\/a>)/g, '').trim();
}

/** Plain text with optional <strong>/<em>, for short fields like answers and stats. */
function inlineText(text: string): string {
  return escapeHtml(text)
    .replace(/&lt;(\/?)(strong|em)&gt;/g, '<$1$2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/* -------------------------------------------------------------- the blocks -- */

const BOX = 'margin:28px 0;padding:20px 22px;border-radius:12px';
const LABEL = 'margin:0 0 12px;font-size:1.1em;font-weight:700';
const MUTED = '#4b5563';

function quiz(block: ArticleBlockData, color: string): string {
  const questions = (block.questions ?? []).filter((q) => q.question && (q.options?.length ?? 0) >= 2);
  if (questions.length === 0) return '';

  const items = questions
    .map((q, index) => {
      const answer = Math.min(Math.max(0, Math.floor(q.answerIndex ?? 0)), q.options.length - 1);
      const letter = (i: number) => String.fromCharCode(65 + i);
      const options = q.options
        .map((option, i) => `<li style="margin:4px 0">${letter(i)}. ${inlineText(option)}</li>`)
        .join('');
      return (
        `<div style="margin:16px 0 0;padding-top:16px;border-top:1px solid #eef0f2">` +
        `<p style="margin:0 0 8px;font-weight:600">${index + 1}. ${inlineText(q.question)}</p>` +
        `<ul style="list-style:none;margin:0 0 10px;padding:0">${options}</ul>` +
        `<details><summary style="cursor:pointer;color:${color};font-weight:600">Reveal answer</summary>` +
        `<p style="margin:10px 0 0;padding:10px 14px;background:#f8f9fa;border-left:4px solid ${color};border-radius:0 6px 6px 0">` +
        `<strong>${letter(answer)}. ${inlineText(q.options[answer])}</strong> ${inlineText(q.explanation || '')}</p>` +
        `</details></div>`
      );
    })
    .join('');

  return (
    `<div class="emseo-quiz" style="${BOX};border:1px solid #e5e7eb;border-top:5px solid ${color};background:#ffffff">` +
    `<p style="${LABEL}">${escapeHtml(block.title || 'Test your knowledge')}</p>` +
    `<p style="margin:0;color:${MUTED};font-size:0.95em">Pick an answer for each question, then reveal it to check.</p>` +
    `${items}</div>`
  );
}

function decisionGuide(block: ArticleBlockData, color: string, allowed: Set<string>): string {
  const options = (block.options ?? []).filter((o) => o.condition && o.recommendation);
  if (options.length === 0) return '';

  const cards = options
    .map((option) => {
      const href = option.url && allowed.has(urlKey(option.url)) ? safeUrl(option.url) : null;
      const link = href
        ? `<p style="margin:10px 0 0"><a href="${escapeHtml(href)}" style="color:${color};font-weight:600">See the options &rarr;</a></p>`
        : '';
      return (
        `<div style="padding:14px 16px;background:#ffffff;border:1px solid #e5e7eb;border-left:4px solid ${color};border-radius:8px">` +
        `<p style="margin:0 0 6px;color:${MUTED};font-size:0.9em">If ${inlineText(option.condition)}</p>` +
        `<p style="margin:0;font-weight:600">${inlineText(option.recommendation)}</p>${link}</div>`
      );
    })
    .join('');

  return (
    `<div class="emseo-decision-guide" style="${BOX};background:#f8f9fa">` +
    `<p style="${LABEL}">${escapeHtml(block.title || 'Which one is right for you?')}</p>` +
    `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">${cards}</div></div>`
  );
}

function comparisonTable(block: ArticleBlockData, color: string): string {
  const columns = block.columns ?? [];
  const rows = (block.rows ?? []).filter((row) => Array.isArray(row) && row.length > 0);
  if (columns.length < 2 || rows.length === 0) return '';
  const fg = readableOn(color);

  const head = columns
    .map((c) => `<th style="background:${color};color:${fg};padding:10px 12px;text-align:left;border:1px solid #dddddd">${escapeHtml(c)}</th>`)
    .join('');
  const body = rows
    .map((row, r) => {
      const cells = columns
        .map((_, i) => {
          const tag = i === 0 ? 'th' : 'td';
          const weight = i === 0 ? 'font-weight:600;' : '';
          return `<${tag} style="${weight}padding:10px 12px;border:1px solid #dddddd;text-align:left">${inlineText(row[i] ?? '')}</${tag}>`;
        })
        .join('');
      return `<tr style="background:${r % 2 ? '#f8f9fa' : '#ffffff'}">${cells}</tr>`;
    })
    .join('');
  const verdict = block.verdict
    ? `<p style="margin:12px 0 0;padding:10px 14px;background:#f8f9fa;border-left:4px solid ${color};border-radius:0 6px 6px 0"><strong>Our verdict:</strong> ${inlineText(block.verdict)}</p>`
    : '';

  return (
    `<div class="emseo-comparison" style="margin:28px 0;overflow-x:auto">` +
    (block.title ? `<p style="${LABEL}">${escapeHtml(block.title)}</p>` : '') +
    `<table style="width:100%;border-collapse:collapse;font-size:0.95em"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` +
    `${verdict}</div>`
  );
}

function prosCons(block: ArticleBlockData, color: string): string {
  const pros = (block.pros ?? []).filter(Boolean);
  const cons = (block.cons ?? []).filter(Boolean);
  if (pros.length === 0 && cons.length === 0) return '';
  const column = (heading: string, items: string[], mark: string, accent: string) =>
    `<div style="padding:14px 16px;background:#ffffff;border:1px solid #e5e7eb;border-top:4px solid ${accent};border-radius:8px">` +
    `<p style="margin:0 0 8px;font-weight:700">${heading}</p>` +
    `<ul style="list-style:none;margin:0;padding:0">${items
      .map((item) => `<li style="margin:6px 0;padding-left:22px;text-indent:-22px"><span style="display:inline-block;width:22px;text-indent:0;font-weight:700;color:${accent}">${mark}</span>${inlineText(item)}</li>`)
      .join('')}</ul></div>`;

  return (
    `<div class="emseo-pros-cons" style="${BOX};background:#f8f9fa">` +
    (block.title ? `<p style="${LABEL}">${escapeHtml(block.title)}</p>` : '') +
    `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">` +
    `${column('Pros', pros, '&#10003;', color)}${column('Cons', cons, '&#10007;', '#9ca3af')}</div></div>`
  );
}

function steps(block: ArticleBlockData, color: string): string {
  const list = (block.steps ?? []).filter((s) => s.title);
  if (list.length === 0) return '';
  const fg = readableOn(color);
  const items = list
    .map(
      (step, i) =>
        `<div style="display:flex;gap:14px;align-items:flex-start;margin:14px 0 0">` +
        `<div style="flex:0 0 32px;width:32px;height:32px;border-radius:50%;background:${color};color:${fg};text-align:center;line-height:32px;font-weight:700">${i + 1}</div>` +
        `<div><p style="margin:4px 0 4px;font-weight:600">${inlineText(step.title)}</p>` +
        `<p style="margin:0;color:${MUTED}">${inlineText(step.detail || '')}</p></div></div>`
    )
    .join('');
  return (
    `<div class="emseo-steps" style="${BOX};background:#f8f9fa">` +
    `<p style="${LABEL}">${escapeHtml(block.title || 'Step by step')}</p>${items}</div>`
  );
}

function checklist(block: ArticleBlockData, color: string): string {
  const items = (block.items ?? []).filter(Boolean);
  if (items.length === 0) return '';
  return (
    `<div class="emseo-checklist" style="${BOX};background:#ffffff;border:1px dashed ${color}">` +
    `<p style="${LABEL}">${escapeHtml(block.title || 'Checklist')}</p>` +
    `<ul style="list-style:none;margin:0;padding:0">${items
      .map((item) => `<li style="margin:8px 0;padding-left:28px;text-indent:-28px"><span style="display:inline-block;width:28px;text-indent:0;color:${color};font-weight:700">&#9744;</span>${inlineText(item)}</li>`)
      .join('')}</ul></div>`
  );
}

function stats(block: ArticleBlockData, color: string, sources: ResearchSource[]): string {
  const list = (block.stats ?? []).filter((s) => s.value && s.label);
  if (list.length === 0) return '';
  const cards = list
    .map((stat) => {
      const source = typeof stat.sourceIndex === 'number' ? sources[stat.sourceIndex - 1] : undefined;
      const href = source ? safeUrl(source.url) : null;
      const cite = href
        ? `<p style="margin:6px 0 0;font-size:0.8em;color:${MUTED}">Source: <a href="${escapeHtml(href)}" target="_blank" rel="nofollow noopener" style="color:${MUTED}">${escapeHtml(source!.title)}</a></p>`
        : '';
      return (
        `<div style="padding:16px;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;text-align:center">` +
        `<p style="margin:0;font-size:1.8em;font-weight:800;color:${color};line-height:1.2">${escapeHtml(stat.value)}</p>` +
        `<p style="margin:6px 0 0;color:#374151">${inlineText(stat.label)}</p>${cite}</div>`
      );
    })
    .join('');
  return (
    `<div class="emseo-stats" style="${BOX};background:#f8f9fa">` +
    (block.title ? `<p style="${LABEL}">${escapeHtml(block.title)}</p>` : '') +
    `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">${cards}</div></div>`
  );
}

const CALLOUT_LABELS: Record<string, string> = {
  tip: 'Pro tip',
  mistake: 'Common mistake',
  insight: 'Expert insight',
};

function callout(block: ArticleBlockData, color: string): string {
  if (!block.text) return '';
  const accent = block.variant === 'mistake' ? '#b45309' : color;
  const label = block.title || CALLOUT_LABELS[block.variant ?? 'tip'] || 'Pro tip';
  return (
    `<div class="emseo-callout" style="margin:24px 0;padding:14px 18px;background:#f8f9fa;border-left:5px solid ${accent};border-radius:0 8px 8px 0">` +
    `<p style="margin:0 0 4px;font-weight:700;color:${accent}">${escapeHtml(label)}</p>` +
    `<p style="margin:0">${inlineText(block.text)}</p></div>`
  );
}

function productCards(block: ArticleBlockData, color: string, products: CatalogProduct[]): string {
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const chosen = (block.productHandles ?? [])
    .map((handle) => byHandle.get(handle))
    .filter((p): p is CatalogProduct => Boolean(p))
    .slice(0, 4);
  if (chosen.length === 0) return '';
  const fg = readableOn(color);

  const cards = chosen
    .map((product) => {
      const href = safeUrl(product.url);
      if (!href) return '';
      const imageUrl = safeUrl(product.image?.url ?? null);
      const sized = imageUrl ? `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}width=480` : null;
      const image = sized
        ? `<a href="${escapeHtml(href)}"><img src="${escapeHtml(sized)}" alt="${escapeHtml(product.image?.alt || product.title)}" loading="lazy" style="display:block;width:100%;height:180px;object-fit:contain;background:#ffffff;margin:0 0 10px"></a>`
        : '';
      const price = product.price && Number(product.price) > 0
        ? `<p style="margin:0 0 10px;font-weight:700">$${escapeHtml(Number(product.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</p>`
        : '';
      return (
        `<div style="padding:14px;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;display:flex;flex-direction:column">${image}` +
        `<p style="margin:0 0 6px;font-weight:600;line-height:1.35"><a href="${escapeHtml(href)}" style="color:#111111;text-decoration:none">${escapeHtml(product.title)}</a></p>` +
        `${price}<p style="margin:auto 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;padding:8px 14px;background:${color};color:${fg};border-radius:6px;text-decoration:none;font-weight:600">View product</a></p></div>`
      );
    })
    .join('');

  return (
    `<div class="emseo-products" style="${BOX};background:#f8f9fa">` +
    `<p style="${LABEL}">${escapeHtml(block.title || 'Recommended products')}</p>` +
    `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">${cards}</div></div>`
  );
}

function chart(block: ArticleBlockData, color: string): string {
  const items = (block.chartItems ?? []).filter((i) => i.label && Number.isFinite(Number(i.value)));
  if (items.length < 2) return '';
  const max = Math.max(...items.map((i) => Number(i.value)), 0);
  if (max <= 0) return '';
  const unit = block.unit ? ` ${escapeHtml(block.unit)}` : '';
  const rows = items
    .map((item) => {
      const pct = Math.max(2, Math.round((Number(item.value) / max) * 100));
      return (
        `<div style="margin:10px 0">` +
        `<p style="margin:0 0 4px;font-size:0.95em"><strong>${escapeHtml(item.label)}</strong> <span style="color:${MUTED}">${escapeHtml(String(item.value))}${unit}</span></p>` +
        `<div style="background:#e5e7eb;border-radius:4px;height:14px"><div style="width:${pct}%;background:${color};height:14px;border-radius:4px"></div></div></div>`
      );
    })
    .join('');
  return (
    `<div class="emseo-chart" style="${BOX};background:#f8f9fa">` +
    `<p style="${LABEL}">${escapeHtml(block.title || 'At a glance')}</p>${rows}</div>`
  );
}

export function renderBlock(block: ArticleBlockData | undefined, ctx: RenderContext, allowed: Set<string>): string {
  if (!block) return '';
  const color = safeColor(ctx.brandColor);
  switch (block.type) {
    case 'quiz': return quiz(block, color);
    case 'decision_guide': return decisionGuide(block, color, allowed);
    case 'comparison_table': return comparisonTable(block, color);
    case 'pros_cons': return prosCons(block, color);
    case 'steps': return steps(block, color);
    case 'checklist': return checklist(block, color);
    case 'stats': return stats(block, color, ctx.sources);
    case 'callout': return callout(block, color);
    case 'product_cards': return productCards(block, color, ctx.products);
    case 'chart': return chart(block, color);
    default: return '';
  }
}

/* ------------------------------------------------------------- the article -- */

export function allowedUrlSet(ctx: RenderContext): Set<string> {
  const set = new Set<string>();
  for (const product of ctx.products) set.add(urlKey(product.url));
  for (const link of ctx.links) set.add(urlKey(link.url));
  return set;
}

/** Sources the writer actually used, in the order it listed them. */
export function usedSources(article: EnhancedArticle, sources: ResearchSource[]): ResearchSource[] {
  const seen = new Set<number>();
  const used: ResearchSource[] = [];
  for (const index of article.sourcesUsed ?? []) {
    const source = sources[index - 1];
    if (!source || seen.has(index)) continue;
    seen.add(index);
    used.push(source);
  }
  return used;
}

/**
 * The section the quiz follows: the middle one, or the nearest to it that does not
 * already end in a block, so two visuals never sit back to back where avoidable.
 */
export function quizPosition(sections: { block?: unknown }[]): number {
  if (sections.length === 0) return -1;
  const middle = Math.max(0, Math.ceil(sections.length / 2) - 1);
  for (let offset = 0; offset < sections.length; offset += 1) {
    for (const i of [middle + offset, middle - offset]) {
      if (i >= 0 && i < sections.length && !sections[i].block) return i;
    }
  }
  return middle;
}

export const DEFAULT_BRAND_COLOR = '#2563eb';

/** Brand colours end up inside style attributes, so only a plain hex colour is used. */
export function safeColor(color: string | undefined | null): string {
  const value = String(color ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase() : DEFAULT_BRAND_COLOR;
}

export function renderEnhancedArticle(article: EnhancedArticle, context: RenderContext): string {
  const ctx = { ...context, brandColor: safeColor(context.brandColor) };
  const color = ctx.brandColor;
  const allowed = allowedUrlSet(ctx);
  const ids = new Set<string>();
  const parts: string[] = [];

  parts.push(`<h1>${escapeHtml(article.title)}</h1>`);

  if (article.quickAnswer) {
    parts.push(
      `<div class="emseo-quick-answer" style="margin:20px 0;padding:16px 20px;background:#f8f9fa;border-left:5px solid ${color};border-radius:0 8px 8px 0">` +
        `<p style="margin:0"><strong>Quick answer:</strong> ${inlineText(article.quickAnswer)}</p></div>`
    );
  }

  const takeaways = (article.keyTakeaways ?? []).filter(Boolean);
  if (takeaways.length) {
    parts.push(
      `<div class="emseo-key-takeaways" style="margin:20px 0;padding:18px 22px;background:#ffffff;border:1px solid #e5e7eb;border-left:5px solid ${color};border-radius:0 8px 8px 0">` +
        `<p style="margin:0 0 8px;font-weight:700;font-size:1.1em">Key Takeaways</p>` +
        `<ul style="margin:0;padding-left:20px">${takeaways.map((t) => `<li style="margin:6px 0">${inlineText(t)}</li>`).join('')}</ul></div>`
    );
  }

  const sections = (article.sections ?? []).filter((s) => s.heading && s.html);
  const faq = (article.faq ?? []).filter((f) => f.question && f.answer);
  const sectionIds = sections.map((s) => headingId(s.heading, ids));
  const faqId = faq.length ? headingId('frequently-asked-questions', ids) : '';
  const conclusionId = article.conclusionHeading ? headingId(article.conclusionHeading, ids) : '';

  if (sections.length >= 4) {
    const entries = sections.map((s, i) => `<li style="margin:4px 0"><a href="#${sectionIds[i]}" style="color:${color}">${escapeHtml(s.heading)}</a></li>`);
    if (faq.length) entries.push(`<li style="margin:4px 0"><a href="#${faqId}" style="color:${color}">Frequently Asked Questions</a></li>`);
    parts.push(
      `<div class="emseo-toc" style="margin:20px 0;padding:16px 20px;background:#f8f9fa;border-radius:8px">` +
        `<p style="margin:0 0 6px;font-weight:700">In this article</p><ol style="margin:0;padding-left:20px">${entries.join('')}</ol></div>`
    );
  }

  if (article.introHtml) parts.push(cleanBodyHtml(article.introHtml, allowed));

  const quizHtml = renderBlock(article.quiz ?? undefined, ctx, allowed);
  const quizAfter = quizHtml ? quizPosition(sections) : -1;

  sections.forEach((section, i) => {
    parts.push(`<h2 id="${sectionIds[i]}">${escapeHtml(section.heading)}</h2>`);
    parts.push(cleanBodyHtml(section.html, allowed));
    const block = renderBlock(section.block, ctx, allowed);
    if (block) parts.push(block);
    if (i === quizAfter) parts.push(quizHtml);
  });

  if (faq.length) {
    parts.push(`<h2 id="${faqId}">Frequently Asked Questions</h2>`);
    parts.push(
      `<div class="emseo-faq" style="margin:16px 0 28px">${faq
        .map(
          (item) =>
            `<details style="margin:0 0 10px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;background:#ffffff">` +
            `<summary style="cursor:pointer;font-weight:600">${escapeHtml(item.question)}</summary>` +
            `<p style="margin:10px 0 0;color:#374151">${inlineText(item.answer)}</p></details>`
        )
        .join('')}</div>`
    );
  }

  if (article.conclusionHeading && article.conclusionHtml) {
    parts.push(`<h2 id="${conclusionId}">${escapeHtml(article.conclusionHeading)}</h2>`);
    parts.push(cleanBodyHtml(article.conclusionHtml, allowed));
  }

  const cited = usedSources(article, ctx.sources);
  if (cited.length) {
    parts.push(
      `<div class="emseo-sources" style="margin:32px 0 0;padding:16px 20px;border-top:1px solid #e5e7eb;font-size:0.9em;color:${MUTED}">` +
        `<p style="margin:0 0 6px;font-weight:700">Sources</p><ol style="margin:0;padding-left:20px">${cited
          .map((source) => {
            const href = safeUrl(source.url);
            return href
              ? `<li style="margin:4px 0"><a href="${escapeHtml(href)}" target="_blank" rel="nofollow noopener" style="color:${MUTED}">${escapeHtml(source.title)}</a></li>`
              : '';
          })
          .join('')}</ol></div>`
    );
  }

  return parts.filter(Boolean).join('\n');
}
