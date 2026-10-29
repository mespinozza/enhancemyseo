/**
 * Builds an Enhanced article end to end: write, fact-check the prose, render, and derive
 * the SEO fields. Research and the catalog are gathered by the caller, which already
 * knows how to reach the brand's store.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { applyProseDocument, toProseDocument } from './factcheck';
import { renderEnhancedArticle, usedSources } from './render';
import type { ArticleSeo, CatalogProduct, EnhancedArticle } from './types';
import { writeEnhancedArticle, type WriterInput } from './writer';

export type FactCheck = (
  html: string
) => Promise<{ content: string; factCheckPassed: boolean; iterations: number }>;

export interface EnhancedResult {
  title: string;
  content: string;
  seo: ArticleSeo;
  article: EnhancedArticle;
  factCheck: { passed: boolean; iterations: number };
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

function featuredImage(article: EnhancedArticle, products: CatalogProduct[]): ArticleSeo['featuredImage'] {
  const byHandle = new Map(products.map((p) => [p.handle, p]));
  const handles = article.sections.flatMap((s) => (s.block?.type === 'product_cards' ? s.block.productHandles ?? [] : []));
  for (const handle of [...handles, ...products.map((p) => p.handle)]) {
    const product = byHandle.get(handle);
    if (product?.image?.url) return { src: product.image.url, alt: product.image.alt || product.title };
  }
  return null;
}

export function buildSeo(article: EnhancedArticle, products: CatalogProduct[]): ArticleSeo {
  return {
    metaTitle: clip(article.metaTitle || article.title, 70),
    metaDescription: clip(article.metaDescription || article.quickAnswer, 160),
    excerpt: clip(article.quickAnswer || article.metaDescription, 300),
    tags: article.tags,
    featuredImage: featuredImage(article, products),
  };
}

export async function generateEnhancedArticle(
  anthropic: Anthropic,
  input: WriterInput & { brandColor: string },
  factCheck: FactCheck,
  log: (message: string) => void = console.log
): Promise<EnhancedResult> {
  const written = await writeEnhancedArticle(anthropic, input, log);

  const checked = await factCheck(toProseDocument(written));
  const article = applyProseDocument(written, checked.content);

  const content = renderEnhancedArticle(article, {
    brandColor: input.brandColor,
    products: input.products,
    links: input.links,
    sources: input.sources,
  });
  log(`🧱 Rendered Enhanced article; ${usedSources(article, input.sources).length} sources cited`);

  return {
    title: article.title,
    content,
    seo: buildSeo(article, input.products),
    article,
    factCheck: { passed: checked.factCheckPassed, iterations: checked.iterations },
  };
}

export type { ArticleFormat, ArticleSeo } from './types';
