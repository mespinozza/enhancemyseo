'use client';

import { useEffect, useMemo, useRef } from 'react';

const FIRST_HIT_ATTR = 'data-search-hit';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strips preview-hostile markup: images that 404 and fixed table layouts that would
 * overflow the card.
 */
function normalizePreviewHtml(html: string): string {
  return html
    .replace(/<img[^>]*>/g, (match) => {
      if (match.includes('plato-hospitality-robot') || match.includes('robot.jpg')) return '';
      return match
        .replace(/style="[^"]*"/g, '')
        .replace(/>$/, ' style="max-width: 100%; height: auto;" onerror="this.style.display=\'none\'">');
    })
    .replace(/<table[^>]*>/g, (match) =>
      match
        .replace(/style="[^"]*"/g, '')
        .replace(/>$/, ' style="max-width: 100%; table-layout: fixed;">'),
    );
}

/**
 * Wraps query matches in <mark>, operating only on text between tags. Rewriting the
 * whole string would corrupt attribute values and let a search for "style" or "div"
 * mangle every element in the article.
 */
export function highlightMatches(html: string, query: string): string {
  if (!query) return html;

  const pattern = new RegExp(escapeRegExp(query), 'gi');
  let inSkippedElement = false;
  let isFirstHit = true;

  return html
    .split(/(<[^>]*>)/)
    .map((segment) => {
      if (segment.startsWith('<')) {
        const boundary = /^<\s*(\/?)\s*(script|style)\b/i.exec(segment);
        if (boundary) inSkippedElement = !boundary[1];
        return segment;
      }

      if (!segment || inSkippedElement) return segment;

      return segment.replace(pattern, (match) => {
        // Tailwind cannot see class names built at runtime, so the highlight is inline.
        const style = isFirstHit
          ? 'background-color:#fcd34d;color:#1f2937;border-radius:2px;box-shadow:0 0 0 2px #fcd34d;'
          : 'background-color:#fef08a;color:#1f2937;border-radius:2px;';
        const marker = isFirstHit ? ` ${FIRST_HIT_ATTR}="first"` : '';
        isFirstHit = false;
        return `<mark${marker} style="${style}">${match}</mark>`;
      });
    })
    .join('');
}

interface ArticlePreviewProps {
  html: string;
  query: string;
}

export default function ArticlePreview({ html, query }: ArticlePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const previewHtml = useMemo(
    () => highlightMatches(normalizePreviewHtml(html), query),
    [html, query],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!query) {
      container.scrollTop = 0;
      return;
    }

    const hit = container.querySelector<HTMLElement>(`[${FIRST_HIT_ATTR}="first"]`);
    if (!hit) {
      container.scrollTop = 0;
      return;
    }

    // scrollIntoView would also scroll the page and yank the card out of view, so the
    // preview box scrolls itself. Rects avoid assumptions about the offset parent.
    const containerTop = container.getBoundingClientRect().top;
    const hitTop = hit.getBoundingClientRect().top;
    container.scrollTop += hitTop - containerTop - container.clientHeight / 3;
  }, [previewHtml, query]);

  return (
    <div
      ref={containerRef}
      className="mb-4 h-48 overflow-y-auto overflow-x-hidden bg-gray-50 rounded p-3 text-sm border relative"
    >
      <div
        className="max-w-full break-words text-wrap"
        style={{
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          wordBreak: 'break-word',
          hyphens: 'auto',
          maxWidth: '100%',
          overflow: 'hidden',
          lineHeight: '1.5',
        }}
        dangerouslySetInnerHTML={{ __html: previewHtml }}
      />
    </div>
  );
}

/** Highlights matches in plain text such as a card title or keyword line. */
export function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;

  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index} className="rounded bg-yellow-200 text-gray-800">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
