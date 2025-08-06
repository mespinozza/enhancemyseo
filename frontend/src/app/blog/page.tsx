'use client';

import { useState, useEffect } from 'react';
import { blogOperations, BlogPost } from '@/lib/firebase/firestore';
import { Search, Calendar, User, Eye, ArrowRight, FileText } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function BlogListingPage() {
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [filteredBlogs, setFilteredBlogs] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  // Load published blog posts
  useEffect(() => {
    const loadBlogs = async () => {
      setIsLoading(true);
      try {
        const publishedBlogs = await blogOperations.getAllPublished();
        setBlogs(publishedBlogs);
        setFilteredBlogs(publishedBlogs);
      } catch (error) {
        console.error('Error loading blogs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadBlogs();
  }, []);

  // Filter blogs based on search term and selected tag
  useEffect(() => {
    let filtered = blogs;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(blog =>
        blog.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        blog.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        blog.metaDescription?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by tag
    if (selectedTag) {
      filtered = filtered.filter(blog =>
        blog.tags?.includes(selectedTag)
      );
    }

    setFilteredBlogs(filtered);
  }, [blogs, searchTerm, selectedTag]);

  // Get all unique tags
  const allTags = Array.from(
    new Set(blogs.flatMap(blog => blog.tags || []))
  ).sort();

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
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6">
              SEO Insights & Tips
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-blue-100 max-w-3xl mx-auto">
              Discover the latest strategies, tips, and insights to enhance your website&apos;s search engine optimization
            </p>
            
            {/* Search Bar */}
            <div className="max-w-md mx-auto relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search articles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 text-gray-900 bg-white rounded-lg border-0 focus:ring-2 focus:ring-blue-300 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Filters */}
        {allTags.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Filter by Topic</h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedTag('')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedTag === ''
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                All Topics
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedTag === tag
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading articles...</p>
          </div>
        ) : filteredBlogs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm || selectedTag ? 'No articles found' : 'No articles yet'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchTerm || selectedTag 
                ? "Try adjusting your search terms or filters."
                : "Check back soon for fresh SEO insights and tips!"
              }
            </p>
            {(searchTerm || selectedTag) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedTag('');
                }}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Results Count */}
            <div className="mb-6">
              <p className="text-gray-600">
                {filteredBlogs.length === blogs.length 
                  ? `${blogs.length} article${blogs.length !== 1 ? 's' : ''}`
                  : `${filteredBlogs.length} of ${blogs.length} articles`
                }
              </p>
            </div>

            {/* Blog Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredBlogs.map((blog) => (
                <article
                  key={blog.id}
                  className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300"
                >
                  {/* Featured Image */}
                  {blog.featuredImage && (
                    <div className="aspect-video bg-gray-200 overflow-hidden relative">
                      <Image
                        src={blog.featuredImage}
                        alt={blog.title}
                        fill
                        className="object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  )}

                  <div className="p-6">
                    {/* Tags */}
                    {blog.tags && blog.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {blog.tags.slice(0, 2).map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            #{tag}
                          </span>
                        ))}
                        {blog.tags.length > 2 && (
                          <span className="text-xs text-gray-500">
                            +{blog.tags.length - 2} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Title */}
                    <h2 className="text-xl font-bold text-gray-900 mb-3 line-clamp-2">
                      <Link
                        href={`/blog/${blog.slug}`}
                        className="hover:text-blue-600 transition-colors"
                      >
                        {blog.title}
                      </Link>
                    </h2>

                    {/* Excerpt */}
                    <p className="text-gray-600 mb-4 line-clamp-3">
                      {blog.metaDescription || getExcerpt(blog.content)}
                    </p>

                    {/* Meta Info */}
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center">
                          <User className="w-4 h-4 mr-1" />
                          <span>{blog.authorName}</span>
                        </div>
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          <span>
                            {blog.publishDate 
                              ? new Date(blog.publishDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })
                              : 'Draft'
                            }
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Eye className="w-4 h-4 mr-1" />
                        <span>{blog.viewCount || 0}</span>
                      </div>
                    </div>

                    {/* Read More Button */}
                    <Link
                      href={`/blog/${blog.slug}`}
                      className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Read More
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {/* CTA Section */}
      <div className="bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <h2 className="text-3xl font-bold mb-4">
              Ready to Enhance Your SEO?
            </h2>
            <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
              Put these insights into action with our powerful SEO article generator
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center px-8 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
            >
              Start Generating Articles
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 