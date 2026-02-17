"""
Test script for crawl4ai - Grab sitemap or available links from a website
"""
import asyncio
import sys
import io

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode

async def get_sitemap_links(url: str):
    """
    Fetch all links from a website (including sitemap if available)
    """
    print(f"\n🔍 Crawling: {url}")
    print("-" * 60)
    
    config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,  # Always get fresh content
        word_count_threshold=0,        # Don't filter by word count
    )
    
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url=url, config=config)
        
        if result.success:
            print(f"✅ Successfully crawled: {url}")
            print(f"📄 Page title: {result.metadata.get('title', 'N/A')}")
            
            # Get internal and external links
            internal_links = result.links.get("internal", [])
            external_links = result.links.get("external", [])
            
            print(f"\n📊 Links found:")
            print(f"   - Internal links: {len(internal_links)}")
            print(f"   - External links: {len(external_links)}")
            
            # Display first 10 internal links
            if internal_links:
                print(f"\n🔗 Sample internal links:")
                for i, link in enumerate(internal_links[:10], 1):
                    href = link.get('href', '') if isinstance(link, dict) else getattr(link, 'href', '')
                    text = link.get('text', '') if isinstance(link, dict) else getattr(link, 'text', '')
                    print(f"   {i}. {href}")
                    if text:
                        print(f"      Text: {text[:60]}...")
            
            return {
                'success': True,
                'url': url,
                'title': result.metadata.get('title', 'N/A'),
                'internal_links': internal_links,
                'external_links': external_links,
                'markdown': result.markdown[:500] if result.markdown else None
            }
        else:
            print(f"❌ Failed to crawl: {url}")
            print(f"Error: {result.error_message}")
            return {
                'success': False,
                'url': url,
                'error': result.error_message
            }

async def get_sitemap_urls(sitemap_url: str):
    """
    Specifically fetch URLs from a sitemap.xml file
    """
    print(f"\n🗺️  Fetching sitemap: {sitemap_url}")
    print("-" * 60)
    
    config = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
    )
    
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url=sitemap_url, config=config)
        
        if result.success:
            # Extract URLs from the sitemap
            import re
            url_pattern = r'<loc>(.*?)</loc>'
            urls = re.findall(url_pattern, result.html)
            
            print(f"✅ Found {len(urls)} URLs in sitemap")
            
            # Display first 10 URLs
            if urls:
                print(f"\n📋 Sample URLs from sitemap:")
                for i, url in enumerate(urls[:10], 1):
                    print(f"   {i}. {url}")
            
            return {
                'success': True,
                'sitemap_url': sitemap_url,
                'urls': urls,
                'total_count': len(urls)
            }
        else:
            print(f"❌ Failed to fetch sitemap: {sitemap_url}")
            print(f"Error: {result.error_message}")
            return {
                'success': False,
                'sitemap_url': sitemap_url,
                'error': result.error_message
            }

async def main():
    """
    Main test function
    """
    print("=" * 60)
    print("🕷️  Crawl4AI Test - Sitemap & Link Extraction")
    print("=" * 60)
    
    # Test 1: Get links from a regular webpage
    print("\n\n📌 TEST 1: Crawl a regular webpage for links")
    await get_sitemap_links("https://example.com")
    
    # Test 2: Get URLs from a sitemap
    print("\n\n📌 TEST 2: Extract URLs from sitemap")
    # You can replace this with any sitemap URL
    await get_sitemap_urls("https://www.python.org/sitemap.xml")
    
    print("\n" + "=" * 60)
    print("✅ All tests completed!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())

