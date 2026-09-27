'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { blogOperations, BlogPost } from '@/lib/firebase/firestore';
import { formatDate } from '@/lib/blog/publish-date';
import { Search, Calendar, User, Eye, ArrowRight, FileText } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { DocumentSnapshot } from 'firebase/firestore';
import Pagination from '@/components/ui/Pagination';

function BlogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Pagination state
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const pageHistoryRef = useRef<Map<number, DocumentSnapshot | null>>(new Map());
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState(''); // Separate input state for immediate UI updates
  const [selectedTag, setSelectedTag] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  
  const ITEMS_PER_PAGE = 9;

  // Initialize page from URL params
  useEffect(() => {
    const pageParam = searchParams.get('page');
    const searchParam = searchParams.get('search');
    const tagParam = searchParams.get('tag');
    
    if (pageParam) {
      const page = parseInt(pageParam, 10);
      if (page > 0) {
        setCurrentPage(page);
      }
    }
    
    if (searchParam) {
      setSearchTerm(searchParam);
      setSearchInput(searchParam);
    }
    
    if (tagParam) {
      setSelectedTag(tagParam);
    }
  }, [searchParams]);

  // Update URL when filters change
  const updateURL = useCallback((page: number, search: string, tag: string) => {
    const params = new URLSearchParams();
    
    if (page > 1) params.set('page', page.toString());
    if (search) params.set('search', search);
    if (tag) params.set('tag', tag);
    
    const url = params.toString() ? `/blog?${params.toString()}` : '/blog';
    router.push(url, { scroll: false });
  }, [router]);

  // Load blogs when page, search, or tag changes
  useEffect(() => {
    let isCancelled = false;
    
    const loadBlogs = async () => {
      if (isCancelled) return;
      setIsLoading(true);
      
      try {
        let targetLastDoc: DocumentSnapshot | null = null;
        
        if (currentPage > 1) {
          // Get the cursor for the previous page
          targetLastDoc = pageHistoryRef.current.get(currentPage - 1) || null;
        }
        
        let result;
        if (searchTerm || selectedTag) {
          // Use filtered pagination with page number (not cursor-based)
          result = await blogOperations.getFilteredPublishedPaginated(
            searchTerm, 
            selectedTag, 
            ITEMS_PER_PAGE, 
            currentPage
          );
          
          // Get filtered count for total pages
          const count = await blogOperations.getFilteredPublishedCount(searchTerm, selectedTag);
          if (!isCancelled) {
            setTotalCount(count);
            setTotalPages(Math.ceil(count / ITEMS_PER_PAGE));
          }
        } else {
          // Use regular pagination
          result = await blogOperations.getAllPublishedPaginated(
            ITEMS_PER_PAGE, 
            targetLastDoc || undefined
          );
          
          // Get total count for total pages
          const count = await blogOperations.getPublishedCount();
          if (!isCancelled) {
            setTotalCount(count);
            setTotalPages(Math.ceil(count / ITEMS_PER_PAGE));
          }
        }
        
        if (!isCancelled) {
          setBlogs(result.blogs);
          setLastDoc(result.lastDoc);
          setHasMore(result.hasMore);
          
          // Update page history
          if (result.lastDoc && currentPage > 0) {
            pageHistoryRef.current.set(currentPage, result.lastDoc);
          }
          
          // Load all tags for filter dropdown (only on first load)
          if (currentPage === 1 && !searchTerm && !selectedTag) {
            const allBlogs = await blogOperations.getAllPublished();
            const uniqueTags = Array.from(
              new Set(allBlogs.flatMap(blog => blog.tags || []))
            ).sort();
            setAllTags(uniqueTags);
          }
        }
        
      } catch (error) {
        if (!isCancelled) {
          console.error('Error loading blogs:', error);
          setBlogs([]);
          setTotalCount(0);
          setTotalPages(1);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadBlogs();
    
    return () => {
      isCancelled = true;
    };
  }, [currentPage, searchTerm, selectedTag]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchTerm) {
        setSearchTerm(searchInput);
        setCurrentPage(1);
        pageHistoryRef.current.clear();
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [searchInput, searchTerm]);

  // Update URL separately to avoid infinite loops
  useEffect(() => {
    updateURL(currentPage, searchTerm, selectedTag);
  }, [currentPage, searchTerm, selectedTag, updateURL]);

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle search input change (immediate UI update)
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
  }, []);

  // Handle tag change
  const handleTagChange = (tag: string) => {
    setSelectedTag(tag);
    setCurrentPage(1); // Reset to first page
    pageHistoryRef.current.clear(); // Clear page history
  };

  // Extract text content from HTML (for excerpts)
  const getExcerpt = (htmlContent: string, maxLength: number = 150) => {
    const div = document.createElement('div');
    div.innerHTML = htmlContent;
    const textContent = div.textContent || div.innerText || '';
    return textContent.length > maxLength 
      ? textContent.substring(0, maxLength) + '...'
      : textContent;
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gray-900 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(110% 70% at 50% -10%, rgba(96, 165, 250, 0.28), rgba(96, 165, 250, 0) 70%), ' +
              'radial-gradient(70% 60% at 90% 110%, rgba(37, 99, 235, 0.18), rgba(37, 99, 235, 0) 70%)',
          }}
        />
        <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm backdrop-blur-sm mb-6">
              <FileText className="h-4 w-4 text-blue-300" />
              SEO Insights &amp; Strategy
            </span>
            <h1 className="text-4xl font-bold sm:text-5xl mb-5">
              Content that teaches.<br />
              <span className="text-blue-400">Rankings that follow.</span>
            </h1>
            <p className="text-lg text-gray-300 mb-10 max-w-xl mx-auto">
              Actionable SEO guides, real case breakdowns, and strategy from a tool that lives in the trenches.
            </p>
            {/* Search */}
            <div className="mx-auto max-w-md relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              <input
                type="text"
                placeholder="Search articles..."
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-11 pr-4 py-3 text-gray-900 bg-white rounded-xl border-0 focus:ring-2 focus:ring-blue-400 focus:outline-none text-sm shadow-lg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Content ── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="mb-10 flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleTagChange('')}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                selectedTag === ''
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              All Topics
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => handleTagChange(tag)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  selectedTag === tag
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden animate-pulse">
                <div className="h-44 bg-gray-100" />
                <div className="p-6 space-y-3">
                  <div className="h-3 w-1/4 bg-gray-100 rounded" />
                  <div className="h-5 w-3/4 bg-gray-100 rounded" />
                  <div className="h-5 w-1/2 bg-gray-100 rounded" />
                  <div className="h-3 w-full bg-gray-100 rounded" />
                  <div className="h-3 w-5/6 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : blogs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-16 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchTerm || selectedTag ? 'No articles found' : 'No articles yet'}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {searchTerm || selectedTag
                ? 'Try adjusting your search or clearing filters.'
                : 'Check back soon for fresh SEO insights and tips!'}
            </p>
            {(searchTerm || selectedTag) && (
              <button
                onClick={() => { setSearchInput(''); setSearchTerm(''); handleTagChange(''); }}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-6">
              {searchTerm || selectedTag
                ? `${blogs.length} of ${totalCount} articles`
                : `${totalCount} article${totalCount !== 1 ? 's' : ''}`}
            </p>

            {/* Blog grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {blogs.map((blog) => (
                <Link
                  key={blog.id}
                  href={`/blog/${blog.slug}`}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg motion-reduce:hover:translate-y-0"
                >
                  {/* Featured image */}
                  {blog.featuredImage ? (
                    <div className="relative h-44 overflow-hidden bg-gray-100">
                      <Image
                        src={blog.featuredImage}
                        alt={blog.title}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none"
                      />
                    </div>
                  ) : (
                    <div className="h-44 bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                      <FileText className="w-10 h-10 text-blue-200" />
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-6">
                    {/* Tags */}
                    {blog.tags && blog.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {blog.tags.slice(0, 2).map((tag, i) => (
                          <span key={i} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                            #{tag}
                          </span>
                        ))}
                        {blog.tags.length > 2 && (
                          <span className="text-xs text-gray-400">+{blog.tags.length - 2}</span>
                        )}
                      </div>
                    )}

                    {/* Title */}
                    <h2 className="text-base font-bold text-gray-900 leading-snug line-clamp-2 mb-2 group-hover:text-blue-600 transition-colors">
                      {blog.title}
                    </h2>

                    {/* Excerpt */}
                    <p className="text-sm text-gray-500 line-clamp-3 mb-4 flex-1">
                      {blog.metaDescription || getExcerpt(blog.content)}
                    </p>

                    {/* Meta row */}
                    <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-4">
                      <div className="flex items-center gap-3">
                        {blog.showAuthor !== false && (
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            {blog.authorName}
                          </span>
                        )}
                        {blog.showDate !== false && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {formatDate(blog.publishDate, { month: 'short', day: 'numeric', year: 'numeric' }, 'Draft')}
                          </span>
                        )}
                      </div>
                      {blog.showViews !== false && (
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5" />
                          {blog.viewCount || 0}
                        </span>
                      )}
                    </div>

                    {/* CTA */}
                    <div className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600">
                      Read article
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              isLoading={isLoading}
            />
          </>
        )}
      </div>

      {/* ── Bottom CTA ── */}
      <section className="bg-gray-900 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0"
          style={{ background: 'radial-gradient(80% 60% at 50% 0%, rgba(96,165,250,0.15), transparent 70%)' }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Put these insights to work</h2>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            Our article generator turns strategy into published, ranking content — automatically.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/30"
          >
            Start Generating Articles
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}

export default function BlogListingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading blog articles...</p>
        </div>
      </div>
    }>
      <BlogContent />
    </Suspense>
  );
} 