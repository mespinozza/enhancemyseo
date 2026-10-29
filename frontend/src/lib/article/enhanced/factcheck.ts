/**
 * Lets the existing fact-check loop, which edits an HTML string, check an Enhanced
 * article's prose without touching its blocks.
 *
 * Each prose field becomes a keyed <section>. The loop rewrites paragraphs inside them;
 * afterwards each section's contents go back into its field. A section the loop damaged
 * beyond recognition keeps its original text, so a failed fix never loses content.
 */
import type { EnhancedArticle } from './types';
import { escapeHtml } from './render';

type UnitKey = string;

function plainToHtml(text: string): string {
  return `<p>${escapeHtml(text)}</p>`;
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function units(article: EnhancedArticle): [UnitKey, string][] {
  const list: [UnitKey, string][] = [];
  if (article.quickAnswer) list.push(['quick', plainToHtml(article.quickAnswer)]);
  if (article.introHtml) list.push(['intro', article.introHtml]);
  article.sections.forEach((section, i) => list.push([`s${i}`, section.html]));
  article.faq.forEach((item, i) => list.push([`f${i}`, plainToHtml(item.answer)]));
  if (article.conclusionHtml) list.push(['end', article.conclusionHtml]);
  return list;
}

/** The article's prose as one HTML document, with the title for context. */
export function toProseDocument(article: EnhancedArticle): string {
  const headings = new Map(article.sections.map((s, i) => [`s${i}`, s.heading]));
  const questions = new Map(article.faq.map((f, i) => [`f${i}`, f.question]));
  const body = units(article)
    .map(([key, html]) => {
      const heading = headings.get(key) ?? questions.get(key);
      return `<section data-fc="${key}">${heading ? `<h2>${escapeHtml(heading)}</h2>` : ''}${html}</section>`;
    })
    .join('\n');
  return `<h1>${escapeHtml(article.title)}</h1>\n${body}`;
}

/** Copies checked prose back into a copy of the article. */
export function applyProseDocument(article: EnhancedArticle, html: string): EnhancedArticle {
  const checked = new Map<UnitKey, string>();
  const pattern = /<section data-fc="([a-z0-9]+)">([\s\S]*?)<\/section>/g;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    const inner = match[2].replace(/^\s*<h2>[\s\S]*?<\/h2>/, '').trim();
    if (/<p\b|<ul\b|<ol\b/i.test(inner)) checked.set(match[1], inner);
  }

  const take = (key: UnitKey, fallback: string) => checked.get(key) ?? fallback;
  return {
    ...article,
    quickAnswer: checked.has('quick') ? htmlToPlain(checked.get('quick')!) || article.quickAnswer : article.quickAnswer,
    introHtml: take('intro', article.introHtml),
    sections: article.sections.map((section, i) => ({ ...section, html: take(`s${i}`, section.html) })),
    faq: article.faq.map((item, i) => ({
      ...item,
      answer: checked.has(`f${i}`) ? htmlToPlain(checked.get(`f${i}`)!) || item.answer : item.answer,
    })),
    conclusionHtml: take('end', article.conclusionHtml),
  };
}
