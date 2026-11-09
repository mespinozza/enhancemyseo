/**
 * Article HTML as a store's blog page shows it. Themes print the article title as the
 * page's heading, so a leading `<h1>` in the body would repeat it as a second H1.
 */
export function storefrontBody(html: string): string {
  return html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '');
}

/** The handle Shopify derives from a title when none is given. */
export function handleFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function readingMinutes(html: string): number {
  const words = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}
