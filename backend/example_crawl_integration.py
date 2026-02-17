"""
Example: How to integrate Crawl4AI into your SEO article generation workflow
"""
import asyncio
import sys
import io

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from crawl_utils import (
    get_all_links,
    discover_sitemap,
    get_all_sitemap_urls,
    crawl_page_content
)


async def example_1_discover_website_structure(website_url: str):
    """
    Example 1: Discover all pages on a website using sitemap
    """
    print(f"\n{'='*60}")
    print(f"Example 1: Discovering website structure")
    print(f"{'='*60}\n")
    
    # Step 1: Try to find the sitemap
    print(f"🔍 Looking for sitemap on {website_url}...")
    sitemap_url = await discover_sitemap(website_url)
    
    if sitemap_url:
        print(f"✅ Found sitemap: {sitemap_url}")
        
        # Step 2: Get all URLs from the sitemap
        print(f"\n📋 Extracting URLs from sitemap...")
        result = await get_all_sitemap_urls(sitemap_url)
        
        if result['success']:
            print(f"✅ Found {result['total_count']} URLs")
            print(f"   Processed {len(result['sitemaps_processed'])} sitemap(s)")
            
            # Show first 5 URLs
            if result['urls']:
                print(f"\n📄 Sample URLs:")
                for i, url in enumerate(result['urls'][:5], 1):
                    print(f"   {i}. {url}")
            
            return result['urls']
        else:
            print(f"❌ Failed: {result.get('error', 'Unknown error')}")
    else:
        print(f"⚠️  No sitemap found, falling back to page crawling...")
        
        # Fallback: Crawl the homepage for links
        result = await get_all_links(website_url)
        if result['success']:
            urls = [link['url'] for link in result['internal_links']]
            print(f"✅ Found {len(urls)} links on homepage")
            return urls
        else:
            print(f"❌ Failed: {result.get('error', 'Unknown error')}")
            return []


async def example_2_analyze_competitor_content(competitor_url: str):
    """
    Example 2: Analyze competitor content for SEO insights
    """
    print(f"\n{'='*60}")
    print(f"Example 2: Analyzing competitor content")
    print(f"{'='*60}\n")
    
    print(f"📄 Crawling content from {competitor_url}...")
    result = await crawl_page_content(competitor_url, extract_markdown=True)
    
    if result['success']:
        print(f"✅ Successfully crawled page")
        print(f"\n📊 Page Details:")
        print(f"   Title: {result['title']}")
        desc = result.get('description', 'N/A')
        if desc and desc != 'N/A' and len(desc) > 100:
            print(f"   Description: {desc[:100]}...")
        else:
            print(f"   Description: {desc if desc else 'N/A'}")
        print(f"   Content length: {len(result['markdown'])} characters")
        
        # Example: Extract headers from markdown
        headers = [line for line in result['markdown'].split('\n') if line.startswith('#')]
        print(f"   Headers found: {len(headers)}")
        
        if headers:
            print(f"\n📑 Content Structure:")
            for header in headers[:5]:
                print(f"   {header}")
        
        return result
    else:
        print(f"❌ Failed: {result.get('error', 'Unknown error')}")
        return None


async def example_3_find_related_pages(website_url: str, keyword: str):
    """
    Example 3: Find pages related to a specific keyword
    """
    print(f"\n{'='*60}")
    print(f"Example 3: Finding pages related to '{keyword}'")
    print(f"{'='*60}\n")
    
    # Get all links from the website
    print(f"🔍 Crawling {website_url}...")
    result = await get_all_links(website_url, include_external=False)
    
    if result['success']:
        print(f"✅ Found {result['total_internal']} internal links")
        
        # Filter links that might be related to the keyword
        keyword_lower = keyword.lower()
        related_links = [
            link for link in result['internal_links']
            if keyword_lower in link['url'].lower() or keyword_lower in link['text'].lower()
        ]
        
        print(f"\n🎯 Found {len(related_links)} pages potentially related to '{keyword}':")
        for i, link in enumerate(related_links[:5], 1):
            print(f"   {i}. {link['url']}")
            print(f"      Text: {link['text']}")
        
        return related_links
    else:
        print(f"❌ Failed: {result.get('error', 'Unknown error')}")
        return []


async def example_4_build_internal_link_graph(website_url: str):
    """
    Example 4: Build an internal linking structure graph
    """
    print(f"\n{'='*60}")
    print(f"Example 4: Building internal link graph")
    print(f"{'='*60}\n")
    
    print(f"🔗 Analyzing internal link structure...")
    result = await get_all_links(website_url, include_external=False)
    
    if result['success']:
        internal_links = result['internal_links']
        
        # Count unique domains/paths
        unique_urls = set(link['url'] for link in internal_links)
        
        print(f"✅ Link Analysis:")
        print(f"   Total internal links: {len(internal_links)}")
        print(f"   Unique pages linked: {len(unique_urls)}")
        
        # Find most common link patterns
        link_texts = [link['text'] for link in internal_links if link['text']]
        print(f"   Links with anchor text: {len(link_texts)}")
        
        return {
            'total_links': len(internal_links),
            'unique_pages': len(unique_urls),
            'links': internal_links
        }
    else:
        print(f"❌ Failed: {result.get('error', 'Unknown error')}")
        return None


async def main():
    """
    Run all examples
    """
    print("\n" + "="*60)
    print("🕷️  Crawl4AI SEO Integration Examples")
    print("="*60)
    
    # Example websites - replace with your targets
    example_site = "https://example.com"
    
    # Run examples
    await example_1_discover_website_structure(example_site)
    await example_2_analyze_competitor_content(example_site)
    await example_3_find_related_pages(example_site, "domain")
    await example_4_build_internal_link_graph(example_site)
    
    print("\n" + "="*60)
    print("✅ All examples completed!")
    print("="*60)
    print("\n💡 Tip: Modify these examples to fit your specific SEO needs")
    print("   - Change the target websites")
    print("   - Adjust the keyword filtering")
    print("   - Add rate limiting for production use")
    print("   - Store results in your database")


if __name__ == "__main__":
    asyncio.run(main())

