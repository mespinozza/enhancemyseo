# Crawl4AI Local Setup (No Docker Required)

## ✅ Setup Complete!

Crawl4AI is now installed and working locally on your system without Docker.

## What's Installed

- **crawl4ai** (v0.6.3) - Web crawler and scraper
- **playwright** - Headless browser automation (Chromium)

## Quick Usage

### 1. Using the Utility Script

The `backend/crawl_utils.py` script provides easy-to-use functions for common crawling tasks:

#### Get all links from a webpage:
```bash
cd backend
python crawl_utils.py https://example.com --links
```

#### Discover and fetch sitemap:
```bash
python crawl_utils.py https://example.com --discover
python crawl_utils.py https://example.com/sitemap.xml --sitemap
```

#### Get page content:
```bash
python crawl_utils.py https://example.com --content
```

### 2. Using in Your Python Code

```python
from backend.crawl_utils import get_all_links, get_sitemap_urls, get_all_sitemap_urls

# Get links from a page
import asyncio

async def main():
    # Get all internal and external links
    result = await get_all_links("https://example.com", include_external=True)
    print(f"Found {result['total_internal']} internal links")
    
    # Get sitemap URLs
    sitemap_result = await get_all_sitemap_urls("https://example.com/sitemap.xml")
    print(f"Found {sitemap_result['total_count']} URLs in sitemap")

asyncio.run(main())
```

### 3. Available Functions

| Function | Description |
|----------|-------------|
| `get_all_links(url, include_external)` | Get all internal/external links from a page |
| `get_sitemap_urls(sitemap_url)` | Extract URLs from a single sitemap |
| `get_all_sitemap_urls(sitemap_url)` | Recursively get URLs from sitemap indexes |
| `crawl_page_content(url, extract_markdown)` | Get page content as markdown or HTML |
| `discover_sitemap(base_url)` | Auto-discover sitemap location |

## How It Works

1. **No Docker needed** - Runs directly with Python using Playwright
2. **Chromium browser** - Playwright manages a headless Chrome instance
3. **Async by default** - Uses `asyncio` for efficient crawling
4. **Link extraction** - Automatically extracts all links from pages
5. **Sitemap parsing** - Can parse XML sitemaps and sitemap indexes

## Troubleshooting

### If you get "playwright not found" error:
```bash
cd backend
python -m playwright install chromium
```

### If you get import errors:
```bash
cd backend
pip install -r requirements.txt
```

### If crawling is slow:
The first run initializes Playwright's browser, subsequent runs are faster.

## Integration with Your SEO Project

You can integrate this into your article generation workflow:

```python
# In your article generation code
from backend.crawl_utils import get_all_links, discover_sitemap

async def enhance_article_with_links(website_url):
    # Discover sitemap
    sitemap_url = await discover_sitemap(website_url)
    
    if sitemap_url:
        # Get all URLs from sitemap
        result = await get_all_sitemap_urls(sitemap_url)
        urls = result['urls']
        
        # Use these URLs to find relevant content
        return urls
    else:
        # Fallback to crawling the main page
        result = await get_all_links(website_url)
        return [link['url'] for link in result['internal_links']]
```

## Comparison: Docker vs Local

| Feature | Docker | Local (Current) |
|---------|--------|-----------------|
| Setup complexity | High | Low ✅ |
| Performance | Slower | Faster ✅ |
| Dependencies | Docker required | Python only ✅ |
| Memory usage | Higher | Lower ✅ |
| Debugging | Harder | Easier ✅ |

## Next Steps

1. Test the utility script with your own websites
2. Integrate crawl functions into your backend API
3. Use sitemap discovery to enhance SEO content generation
4. Consider adding rate limiting for production use

## Resources

- [Crawl4AI Documentation](https://docs.crawl4ai.com/)
- [Playwright Documentation](https://playwright.dev/python/)

---

**Note**: This setup is production-ready and doesn't require Docker. The Playwright browser is managed automatically.

