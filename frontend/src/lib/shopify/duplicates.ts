/**
 * Finding an article Shopify would collide with. Shopify resolves a handle collision by
 * quietly publishing the new article at `<handle>-2`, so a duplicate has to be caught
 * before the article is created.
 */

/** Bounds the scan at 5,000 articles, far beyond any blog this pushes to. */
const MAX_ARTICLE_PAGES = 20;

/**
 * The handles Shopify might derive from a title. It is not documented whether an
 * apostrophe becomes a hyphen or disappears, so both are checked.
 */
export function handlesFor(title: string): string[] {
  const handleize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const lower = title.toLowerCase();
  return Array.from(new Set([handleize(lower), handleize(lower.replace(/['\u2019]/g, ''))]));
}

/** An existing article in this blog whose title or handle collides with `title`. */
export async function findDuplicateArticle(
  shopDomain: string,
  accessToken: string,
  blogId: string | number,
  title: string
): Promise<{ title: string; handle: string } | null> {
  const wanted = new Set(handlesFor(title));
  let url: string | null =
    `https://${shopDomain}/admin/api/2023-10/blogs/${blogId}/articles.json?limit=250&fields=id,title,handle`;

  for (let page = 0; url && page < MAX_ARTICLE_PAGES; page += 1) {
    const response: Response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
    if (!response.ok) {
      throw new Error(`Could not check the blog for an existing article (status ${response.status})`);
    }

    const { articles = [] } = (await response.json()) as {
      articles?: { title?: string; handle?: string }[];
    };
    for (const existing of articles) {
      const handle = existing.handle || '';
      const clash =
        wanted.has(handle) || handlesFor(existing.title || '').some((h) => wanted.has(h));
      if (clash) return { title: existing.title || '', handle };
    }

    const next = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  return null;
}
