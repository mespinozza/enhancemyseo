import DOMPurify from 'dompurify';

/**
 * Article HTML is rendered with dangerouslySetInnerHTML and can now be shaped by
 * user edits and AI responses, so it is sanitized on load, on every AI result,
 * and before persisting.
 *
 * Inline `style` must survive: generated articles build their charts, tables, and
 * callout boxes entirely from inline styles, and stripping the attribute would
 * flatten every visual in every article.
 */

const ADD_ATTR = [
  'style', 'target', 'rel', 'colspan', 'rowspan', 'align', 'valign',
  'scope', 'start', 'width', 'height', 'loading',
];

const FORBID_TAGS = [
  'script', 'iframe', 'object', 'embed', 'form', 'input',
  'button', 'textarea', 'select', 'link', 'meta', 'base',
];

const FORBID_ATTR = [
  'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus',
  'onblur', 'oninput', 'onchange', 'onsubmit', 'formaction',
];

export function sanitizeArticleHtml(html: string): string {
  if (!html) return '';

  // DOMPurify needs a DOM; server render paths use hardenHtml() in rewrite.ts.
  if (typeof window === 'undefined') return html;

  return DOMPurify.sanitize(html, {
    ADD_ATTR,
    FORBID_TAGS,
    FORBID_ATTR,
    ALLOW_DATA_ATTR: false,
    USE_PROFILES: { html: true },
  });
}

/**
 * Preview-only pass that also neutralizes broken images, matching the behavior
 * the existing article preview surfaces already rely on.
 */
export function sanitizeForPreview(html: string): string {
  return sanitizeArticleHtml(html).replace(/<img\b[^>]*>/gi, (match) => {
    if (/plato-hospitality-robot|robot\.jpg/i.test(match)) return '';
    return match.replace(/\s*\/?>$/, ' style="max-width:100%;height:auto;">');
  });
}
