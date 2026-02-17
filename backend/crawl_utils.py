"""
Utility functions for web crawling using Crawl4AI
Used for grabbing sitemaps and available links for SEO analysis
"""
import asyncio
import re
from typing import Dict, List, Optional
from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
import json


async def get_all_links(url: str, include_external: bool = False) -> Dict:
    """
    Get all links from a webpage
    
    Args:
        url: The URL to crawl
        include_external: Whether to include external links
    
    Returns:
        Dictionary with internal and external links
    """
    config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        word_count_threshold=0,
    )
    
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url=url, config=config)
        
        if result.success:
            internal_links = []
            external_links = []
            
            # Process internal links
            if hasattr(result.links, 'internal') or isinstance(result.links, dict):
                internal = result.links.get("internal", []) if isinstance(result.links, dict) else getattr(result.links, 'internal', [])
                for link in internal:
                    href = link.get('href', '') if isinstance(link, dict) else getattr(link, 'href', '')
                    text = link.get('text', '') if isinstance(link, dict) else getattr(link, 'text', '')
                    if href:
                        internal_links.append({'url': href, 'text': text})
            
            # Process external links
            if include_external:
                external = result.links.get("external", []) if isinstance(result.links, dict) else getattr(result.links, 'external', [])
                for link in external:
                    href = link.get('href', '') if isinstance(link, dict) else getattr(link, 'href', '')
                    text = link.get('text', '') if isinstance(link, dict) else getattr(link, 'text', '')
                    if href:
                        external_links.append({'url': href, 'text': text})
            
            return {
                'success': True,
                'url': url,
                'title': result.metadata.get('title', 'N/A') if result.metadata else 'N/A',
                'internal_links': internal_links,
                'external_links': external_links,
                'total_internal': len(internal_links),
                'total_external': len(external_links)
            }
        else:
            return {
                'success': False,
                'url': url,
                'error': result.error_message
            }


async def get_sitemap_urls(sitemap_url: str) -> Dict:
    """
    Extract URLs from a sitemap.xml file
    
    Args:
        sitemap_url: URL to the sitemap.xml
    
    Returns:
        Dictionary with URLs and metadata
    """
    config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
    )
    
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url=sitemap_url, config=config)
        
        if result.success:
            # Extract URLs from the sitemap
            url_pattern = r'<loc>(.*?)</loc>'
            urls = re.findall(url_pattern, result.html)
            
            # Check if this is a sitemap index (contains other sitemaps)
            is_index = '<sitemapindex' in result.html.lower()
            
            return {
                'success': True,
                'sitemap_url': sitemap_url,
                'urls': urls,
                'total_count': len(urls),
                'is_sitemap_index': is_index
            }
        else:
            return {
                'success': False,
                'sitemap_url': sitemap_url,
                'error': result.error_message
            }


async def get_all_sitemap_urls(sitemap_url: str) -> Dict:
    """
    Recursively get all URLs from a sitemap, including sitemap indexes
    
    Args:
        sitemap_url: URL to the sitemap.xml or sitemap index
    
    Returns:
        Dictionary with all URLs from all sitemaps
    """
    all_urls = []
    sitemaps_processed = []
    
    # Get initial sitemap
    result = await get_sitemap_urls(sitemap_url)
    
    if not result['success']:
        return result
    
    sitemaps_processed.append(sitemap_url)
    
    if result['is_sitemap_index']:
        # This is a sitemap index, fetch all child sitemaps
        child_sitemaps = result['urls']
        
        for child_sitemap in child_sitemaps:
            child_result = await get_sitemap_urls(child_sitemap)
            if child_result['success']:
                all_urls.extend(child_result['urls'])
                sitemaps_processed.append(child_sitemap)
    else:
        # This is a regular sitemap
        all_urls = result['urls']
    
    return {
        'success': True,
        'sitemap_url': sitemap_url,
        'urls': all_urls,
        'total_count': len(all_urls),
        'sitemaps_processed': sitemaps_processed
    }


async def crawl_page_content(url: str, extract_markdown: bool = True) -> Dict:
    """
    Crawl a page and extract its content
    
    Args:
        url: The URL to crawl
        extract_markdown: Whether to extract markdown content
    
    Returns:
        Dictionary with page content and metadata
    """
    config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
    )
    
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url=url, config=config)
        
        if result.success:
            return {
                'success': True,
                'url': url,
                'title': result.metadata.get('title', 'N/A') if result.metadata else 'N/A',
                'description': result.metadata.get('description', 'N/A') if result.metadata else 'N/A',
                'markdown': result.markdown if extract_markdown else None,
                'html': result.html if not extract_markdown else None,
                'cleaned_html': result.cleaned_html
            }
        else:
            return {
                'success': False,
                'url': url,
                'error': result.error_message
            }


async def discover_sitemap(base_url: str) -> Optional[str]:
    """
    Try to discover sitemap URL for a domain
    Common locations: /sitemap.xml, /sitemap_index.xml, /sitemap/sitemap.xml
    
    Args:
        base_url: Base URL of the website (e.g., https://example.com)
    
    Returns:
        Sitemap URL if found, None otherwise
    """
    common_paths = [
        '/sitemap.xml',
        '/sitemap_index.xml',
        '/sitemap/sitemap.xml',
        '/sitemap/index.xml',
        '/sitemaps/sitemap.xml'
    ]
    
    base_url = base_url.rstrip('/')
    
    for path in common_paths:
        sitemap_url = f"{base_url}{path}"
        result = await get_sitemap_urls(sitemap_url)
        if result['success']:
            return sitemap_url
    
    return None


# CLI Interface for testing
async def main():
    """Test the crawl utilities"""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python crawl_utils.py <url> [--sitemap|--links|--content]")
        print("\nExamples:")
        print("  python crawl_utils.py https://example.com --links")
        print("  python crawl_utils.py https://example.com/sitemap.xml --sitemap")
        print("  python crawl_utils.py https://example.com --content")
        return
    
    url = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else '--links'
    
    if mode == '--sitemap':
        print(f"Fetching sitemap from: {url}")
        result = await get_all_sitemap_urls(url)
        print(json.dumps(result, indent=2))
    
    elif mode == '--links':
        print(f"Fetching links from: {url}")
        result = await get_all_links(url, include_external=True)
        print(json.dumps(result, indent=2))
    
    elif mode == '--content':
        print(f"Fetching content from: {url}")
        result = await crawl_page_content(url)
        if result['success']:
            print(f"Title: {result['title']}")
            print(f"Description: {result['description']}")
            print(f"Markdown length: {len(result['markdown']) if result['markdown'] else 0}")
    
    elif mode == '--discover':
        print(f"Discovering sitemap for: {url}")
        sitemap_url = await discover_sitemap(url)
        if sitemap_url:
            print(f"Found sitemap: {sitemap_url}")
        else:
            print("No sitemap found")
    
    else:
        print(f"Unknown mode: {mode}")


if __name__ == "__main__":
    # Fix Windows console encoding
    import sys
    import io
    if sys.platform == 'win32':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    
    asyncio.run(main())

