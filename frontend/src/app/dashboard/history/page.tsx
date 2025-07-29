'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { FileText, Key, Download, ExternalLink, ArrowLeft, ArrowRight, Send, Package, LayoutGrid, Copy, Check, X, Image as ImageIcon } from 'lucide-react';
import { blogOperations, historyOperations, generatedProductOperations, brandProfileOperations, Blog, HistoryItem, GeneratedProduct, BrandProfile } from '@/lib/firebase/firestore';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

type TabType = 'blogs' | 'keywords' | 'thumbnails' | 'collections' | 'products';
type SubscriptionTier = 'free' | 'kickstart' | 'seo-takeover' | 'seo_takeover' | 'agency' | 'admin';

interface TabData {
  id: TabType;
  name: string;
  icon: any;
  count: number;
  requiredSubscription?: SubscriptionTier[];
}

interface ToastNotification {
  show: boolean;
  message: string;
  type: 'success' | 'error';
}

export default function HistoryPage() {
  const { user, subscription_status } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('blogs');
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [keywords, setKeywords] = useState<HistoryItem[]>([]);
  const [products, setProducts] = useState<GeneratedProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [keywordIndexMap, setKeywordIndexMap] = useState<Record<string, number>>({});
  const [toastNotification, setToastNotification] = useState<ToastNotification>({ show: false, message: '', type: 'success' });
  const highlightedItemRef = useRef<HTMLDivElement>(null);
  const lastLogTimeRef = useRef<number>(0);
  
  // Shopify push states
  const [showShopifyModal, setShowShopifyModal] = useState(false);
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [isPushingToShopify, setIsPushingToShopify] = useState(false);
  const [articleAuthor, setArticleAuthor] = useState<string>('');
  const [selectedBlogId, setSelectedBlogId] = useState<string>('');
  const [shopifyBlogs, setShopifyBlogs] = useState<any[]>([]);
  const [isLoadingBlogs, setIsLoadingBlogs] = useState(false);
  
  // Pagination states for modal
  const [displayedArticles, setDisplayedArticles] = useState<Blog[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreArticles, setHasMoreArticles] = useState(true);
  const articlesPerPage = 10;
  
  // Pagination states for main page
  const [displayedBlogs, setDisplayedBlogs] = useState<Blog[]>([]);
  const [isLoadingMoreBlogs, setIsLoadingMoreBlogs] = useState(false);
  const [hasMoreBlogs, setHasMoreBlogs] = useState(true);
  const blogsPerPage = 9;

  // Show toast notification  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToastNotification({ show: true, message, type });
    setTimeout(() => {
      setToastNotification({ show: false, message: '', type: 'success' });
    }, 3000);
  };

  // Load all content
  useEffect(() => {
    async function loadAllContent() {
      if (!user?.uid) {
        console.log('No authenticated user found, skipping history load');
        return;
      }
      
      // Ensure we have a valid auth token
      try {
        await user.getIdToken();
      } catch (tokenError) {
        console.error('Failed to get auth token for history:', tokenError);
        return;
      }
      
      console.log('Loading history for user:', user.uid);
      setIsLoading(true);
      
      try {
        const [blogsData, keywordsData, brandProfilesData] = await Promise.all([
          blogOperations.getAll(user.uid),
          historyOperations.getAll(user.uid),
          brandProfileOperations.getAll(user.uid)
        ]);
        
        // Debug logging to check if content is loaded
        console.log('Loaded blogs:', blogsData.length);
        blogsData.forEach((blog, index) => {
          if (index < 3) { // Log first 3 blogs for debugging
            console.log(`Blog ${index + 1}:`, {
              id: blog.id,
              title: blog.title,
              hasContent: !!blog.content,
              contentLength: blog.content?.length || 0,
              contentPreview: blog.content?.substring(0, 100) + '...'
            });
          }
        });
        
        setBlogs(blogsData);
        setKeywords(keywordsData.filter(item => item.type === 'keywords'));
        setBrandProfiles(brandProfilesData);
        
        // Initialize displayed blogs for main page
        initializeMainPageBlogs(blogsData);

        // Load products separately with error handling (collection might not exist yet)
        try {
          const productsData = await generatedProductOperations.getAll(user.uid);
          console.log('Successfully loaded products for history:', productsData.length);
          setProducts(productsData);
        } catch (productsError) {
          console.warn('Generated products collection not available yet:', productsError);
          setProducts([]); // Set empty array if collection doesn't exist
        }
      } catch (error) {
        console.error('Failed to load content:', error);
      } finally {
        setIsLoading(false);
      }
    }

    // Only run when we have a fully authenticated user
    if (user?.uid) {
      // Add delay to ensure Firestore rules have been applied
      setTimeout(loadAllContent, 500);
    }
  }, [user?.uid]);

  // Scroll to highlighted item
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (highlightId && highlightedItemRef.current) {
      setTimeout(() => {
        highlightedItemRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 100);
    }
  }, [searchParams, isLoading]);

  // Define all available tabs with subscription requirements
  const allTabs: TabData[] = [
    { 
      id: 'blogs', 
      name: 'Generated Articles', 
      icon: FileText, 
      count: blogs.length,
      requiredSubscription: ['free', 'kickstart', 'seo-takeover', 'admin'] // Available to all users
    },
    { 
      id: 'keywords', 
      name: 'Keyword Research', 
      icon: Key, 
      count: keywords.length,
      requiredSubscription: ['free', 'kickstart', 'seo-takeover', 'admin'] // Available to all users
    },
    { 
      id: 'thumbnails', 
      name: 'Generated Thumbnails', 
      icon: ImageIcon, 
      count: 0, // TODO: Add thumbnail tracking
      requiredSubscription: ['admin'] // Admin only
    },
    { 
      id: 'collections', 
      name: 'Generated Collections', 
      icon: LayoutGrid, 
      count: 0,
      requiredSubscription: ['admin'] // Admin only
    },
    { 
      id: 'products', 
      name: 'Generated Products', 
      icon: Package, 
      count: products.length,
      requiredSubscription: ['admin'] // Admin only
    },
  ];

  // Filter tabs based on subscription status
  const tabs = allTabs.filter(tab => {
    if (!tab.requiredSubscription) return true;
    return tab.requiredSubscription.includes(subscription_status);
  });

  // Ensure activeTab is valid for current subscription
  useEffect(() => {
    const tab = searchParams.get('tab') as TabType;
    if (tab && tabs.find(t => t.id === tab)) {
      setActiveTab(tab);
    } else {
      // If the requested tab is not available, default to the first available tab
      if (tabs.length > 0 && !tabs.find(t => t.id === activeTab)) {
        setActiveTab(tabs[0].id);
      }
    }
  }, [searchParams, tabs, activeTab]);

  const handlePrevKeyword = (id: string) => {
    if (!id) return;
    setKeywordIndexMap(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] || 0) - 1)
    }));
  };

  const handleNextKeyword = (id: string, maxLength: number) => {
    if (!id) return;
    setKeywordIndexMap(prev => ({
      ...prev,
      [id]: Math.min(maxLength - 1, (prev[id] || 0) + 1)
    }));
  };

  const handleDownloadArticle = async (blog: Blog) => {
    // Create text content instead of HTML
    const textContent = `${blog.title}

${blog.content ? blog.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : 'No content available'}

---
Generated: ${blog.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
Keyword: ${blog.keyword || 'Not specified'}
Status: ${blog.status}`;

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${blog.title.toLowerCase().replace(/\s+/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Show success toast
    showToast('Article downloaded successfully!');
  };

  const handleCopyHTML = async (blog: Blog) => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>${blog.title}</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
  <h1>${blog.title}</h1>
  <div>${blog.content || 'No content available'}</div>
</body>
</html>`;

    try {
      await navigator.clipboard.writeText(htmlContent);
      showToast('HTML copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy: ', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = htmlContent;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast('HTML copied to clipboard!');
    }
  };

  const handleUseKeyword = (keyword: string | undefined) => {
    if (!keyword) return;
    localStorage.setItem('selectedKeyword', keyword);
    window.location.href = '/dashboard/articles';
  };

  // Main page pagination functionality
  // Initialize blogs for main page
  const initializeMainPageBlogs = useCallback((blogsData: Blog[]) => {
    const sortedBlogs = [...blogsData].sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime(); // Most recent first
    });
    
    const initial = sortedBlogs.slice(0, blogsPerPage);
    console.log('Initializing main page blogs:', {
      totalBlogs: blogsData.length,
      initialDisplayed: initial.length,
      hasMore: sortedBlogs.length > blogsPerPage
    });
    
    setDisplayedBlogs(initial);
    setHasMoreBlogs(sortedBlogs.length > blogsPerPage);
  }, [blogsPerPage]);

  // Load more blogs for main page
  const loadMoreBlogs = useCallback(() => {
    console.log('loadMoreBlogs called:', {
      isLoadingMoreBlogs,
      hasMoreBlogs,
      currentDisplayed: displayedBlogs.length,
      totalBlogs: blogs.length
    });
    
    if (isLoadingMoreBlogs || !hasMoreBlogs) {
      console.log('Exiting early:', { isLoadingMoreBlogs, hasMoreBlogs });
      return;
    }
    
    setIsLoadingMoreBlogs(true);
    
    setTimeout(() => {
      const sortedBlogs = [...blogs].sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime(); // Most recent first
      });
      
      const nextBlogs = sortedBlogs.slice(
        displayedBlogs.length,
        displayedBlogs.length + blogsPerPage
      );
      
      console.log('Loading next blogs:', {
        currentCount: displayedBlogs.length,
        nextBlogsCount: nextBlogs.length,
        willHaveMore: displayedBlogs.length + nextBlogs.length < sortedBlogs.length
      });
      
      setDisplayedBlogs(prev => [...prev, ...nextBlogs]);
      setHasMoreBlogs(displayedBlogs.length + nextBlogs.length < sortedBlogs.length);
      setIsLoadingMoreBlogs(false);
    }, 300); // Small delay for smooth UX
  }, [isLoadingMoreBlogs, hasMoreBlogs, blogs, displayedBlogs.length, blogsPerPage]);

  // Ensure displayedBlogs is updated when blogs change
  useEffect(() => {
    if (blogs.length > 0 && displayedBlogs.length === 0) {
      console.log('Re-initializing displayed blogs from useEffect');
      initializeMainPageBlogs(blogs);
    }
  }, [blogs, displayedBlogs.length, initializeMainPageBlogs]);

  // Handle scroll in main page with useCallback
  const handleMainPageScroll = useCallback(() => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    
    // More generous trigger - when user is 100px from bottom
    const isNearBottom = scrollTop + windowHeight >= documentHeight - 100;
    const distanceFromBottom = documentHeight - (scrollTop + windowHeight);
    
    // Throttled logging to reduce console spam
    if (!lastLogTimeRef.current || Date.now() - lastLogTimeRef.current > 500) {
      console.log('📊 Scroll Debug:', {
        scrollTop: Math.round(scrollTop),
        windowHeight: Math.round(windowHeight),
        documentHeight: Math.round(documentHeight),
        distanceFromBottom: Math.round(distanceFromBottom),
        isNearBottom,
        hasMoreBlogs,
        isLoadingMoreBlogs,
        activeTab,
        canLoad: hasMoreBlogs && !isLoadingMoreBlogs && activeTab === 'blogs'
      });
      lastLogTimeRef.current = Date.now();
    }
    
    if (isNearBottom && hasMoreBlogs && !isLoadingMoreBlogs && activeTab === 'blogs') {
      console.log('🚀 AUTO-TRIGGERING loadMoreBlogs from scroll!');
      loadMoreBlogs();
    }
  }, [hasMoreBlogs, isLoadingMoreBlogs, activeTab, displayedBlogs.length, blogs.length, loadMoreBlogs]);

  // Add scroll listener for main page (simplified for debugging)
  useEffect(() => {
    console.log('📌 Adding scroll listener for main page pagination');
    
    // Simple scroll handler without throttling for debugging
    const simpleScrollHandler = () => {
      handleMainPageScroll();
    };

    window.addEventListener('scroll', simpleScrollHandler);
    
    return () => {
      console.log('📌 Removing scroll listener for main page pagination');
      window.removeEventListener('scroll', simpleScrollHandler);
    };
  }, [handleMainPageScroll]);

  // Shopify push functionality
  // Initialize articles for modal
  const initializeModalArticles = () => {
    const sortedArticles = [...blogs].sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.createdAt?.toDate?.() || new Date(0);
      return dateB.getTime() - dateA.getTime(); // Most recent first
    });
    
    // Debug logging to check content in modal articles
    console.log('Initializing modal articles:');
    sortedArticles.slice(0, 3).forEach((article, index) => {
      console.log(`Modal Article ${index + 1}:`, {
        id: article.id,
        title: article.title,
        hasContent: !!article.content,
        contentLength: article.content?.length || 0
      });
    });
    
    const initial = sortedArticles.slice(0, articlesPerPage);
    setDisplayedArticles(initial);
    setHasMoreArticles(sortedArticles.length > articlesPerPage);
  };

  // Load more articles
  const loadMoreArticles = () => {
    if (isLoadingMore || !hasMoreArticles) return;
    
    setIsLoadingMore(true);
    
    setTimeout(() => {
      const sortedArticles = [...blogs].sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime(); // Most recent first
      });
      
      const nextArticles = sortedArticles.slice(
        displayedArticles.length,
        displayedArticles.length + articlesPerPage
      );
      
      setDisplayedArticles(prev => [...prev, ...nextArticles]);
      setHasMoreArticles(displayedArticles.length + nextArticles.length < sortedArticles.length);
      setIsLoadingMore(false);
    }, 300); // Small delay for smooth UX
  };

  // Handle scroll in modal
  const handleModalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 10;
    
    if (isNearBottom && hasMoreArticles && !isLoadingMore) {
      loadMoreArticles();
    }
  };

  const handleSelectAllArticles = () => {
    if (selectedArticleIds.length === blogs.length) {
      setSelectedArticleIds([]);
    } else {
      setSelectedArticleIds(blogs.map(blog => blog.id!));
    }
  };

  const handleSelectArticle = (articleId: string) => {
    setSelectedArticleIds(prev => 
      prev.includes(articleId) 
        ? prev.filter(id => id !== articleId)
        : [...prev, articleId]
    );
  };

  // Fetch Shopify blogs for selected brand
  const fetchShopifyBlogs = async (brandId: string) => {
    const selectedBrand = brandProfiles.find(profile => profile.id === brandId);
    if (!selectedBrand?.shopifyStoreUrl || !selectedBrand?.shopifyAccessToken) {
      return;
    }

    setIsLoadingBlogs(true);
    try {
      const response = await fetch('/api/shopify/get-blogs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user?.getIdToken()}`,
        },
        body: JSON.stringify({
          shopifyStoreUrl: selectedBrand.shopifyStoreUrl,
          shopifyAccessToken: selectedBrand.shopifyAccessToken,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setShopifyBlogs(data.blogs || []);
      } else {
        console.error('Failed to fetch Shopify blogs');
        setShopifyBlogs([]);
      }
    } catch (error) {
      console.error('Error fetching Shopify blogs:', error);
      setShopifyBlogs([]);
    } finally {
      setIsLoadingBlogs(false);
    }
  };

  const handleOpenShopifyModal = async () => {
    setShowShopifyModal(true);
    initializeModalArticles();
    
    // Load brand profiles
    if (user) {
      try {
        const profilesRef = collection(db, 'brandProfiles');
        const q = query(profilesRef, where('userId', '==', user.uid));
        const querySnapshot = await getDocs(q);
        
        const profiles: BrandProfile[] = [];
        querySnapshot.forEach((doc: any) => {
          profiles.push({ id: doc.id, ...doc.data() } as BrandProfile);
        });
        
        setBrandProfiles(profiles);
      } catch (error) {
        console.error('Error loading brand profiles:', error);
        showToast('Failed to load brand profiles', 'error');
      }
    }
  };

  // Handle brand selection and fetch blogs
  const handleBrandSelection = async (brandId: string) => {
    setSelectedBrandId(brandId);
    setSelectedBlogId(''); // Reset blog selection
    setShopifyBlogs([]); // Clear previous blogs
    
    if (brandId) {
      await fetchShopifyBlogs(brandId);
    }
  };

  const handlePushToShopify = async () => {
    if (!selectedArticleIds.length) {
      toast.error('Please select at least one article to push');
      return;
    }

    if (!selectedBrandId) {
      toast.error('Please select a brand profile first');
      return;
    }

    if (!selectedBlogId) {
      toast.error('Please select a Shopify blog to publish to');
      return;
    }

    const selectedBrand = brandProfiles.find(profile => profile.id === selectedBrandId);
    if (!selectedBrand?.shopifyStoreUrl || !selectedBrand?.shopifyAccessToken) {
      toast.error('Selected brand profile needs Shopify store URL and access token. Please update the brand profile.');
      return;
    }

    setIsPushingToShopify(true);
    
    try {
      const selectedArticles = blogs.filter(blog => 
        selectedArticleIds.includes(blog.id!)
      );

      for (const article of selectedArticles) {
        // Debug logging to check content
        console.log('Pushing article:', {
          id: article.id,
          title: article.title,
          contentLength: article.content?.length || 0,
          hasContent: !!article.content
        });

        // Ensure we have content before pushing
        if (!article.content || article.content.trim() === '') {
          console.error(`Article "${article.title}" has no content, skipping...`);
          toast.error(`Article "${article.title}" has no content and was skipped`);
          continue;
        }

        const response = await fetch('/api/shopify/push-article', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await user?.getIdToken()}`,
          },
          body: JSON.stringify({
            shopifyStoreUrl: selectedBrand.shopifyStoreUrl,
            shopifyAccessToken: selectedBrand.shopifyAccessToken,
            blogId: selectedBlogId,
            article: {
              title: article.title,
              content: article.content,
              status: 'draft',
              author: articleAuthor || undefined
            }
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to push article: ${article.title}`);
        }

        // Small delay between pushes to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      toast.success(`Successfully pushed ${selectedArticles.length} article${selectedArticles.length !== 1 ? 's' : ''} to Shopify!`);
      setShowShopifyModal(false);
      setSelectedArticleIds([]);
      setSelectedBrandId('');
      // Reset author and blog states
      setArticleAuthor('');
      setSelectedBlogId('');
      setShopifyBlogs([]);
      setIsLoadingBlogs(false);
      
    } catch (error) {
      console.error('Error pushing to Shopify:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to push articles to Shopify');
    } finally {
      setIsPushingToShopify(false);
    }
  };

  const renderBlogsTab = () => (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedBlogs.map((blog) => {
        const isHighlighted = searchParams.get('highlight') === blog.id;
        return (
          <div
            key={blog.id}
            ref={isHighlighted ? highlightedItemRef : undefined}
            className={`bg-white rounded-lg border p-6 transition-all duration-300 overflow-hidden ${
              isHighlighted 
                ? 'border-blue-500 shadow-lg ring-2 ring-blue-200' 
                : 'border-gray-200 hover:border-blue-300'
            }`}
            style={{ contain: 'layout style' }}
          >
            <div className="flex items-center mb-4">
              <FileText className="w-5 h-5 text-blue-600 mr-2" />
              <h3 className="text-lg font-semibold truncate">{blog.title}</h3>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-500">
                Keyword: {blog.keyword || 'Not specified'}
              </p>
              <p className="text-sm text-gray-500">
                Status: <span className="capitalize">{blog.status}</span>
              </p>
              <p className="text-sm text-gray-500">
                Generated: {blog.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
              </p>
            </div>
            {blog.content && (
              <div className="mb-4 h-48 overflow-y-auto overflow-x-hidden bg-gray-50 rounded p-3 text-sm border relative">
                <div 
                  className="max-w-full break-words text-wrap"
                  style={{
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                    hyphens: 'auto',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    lineHeight: '1.5'
                  }}
                  dangerouslySetInnerHTML={{ 
                    __html: blog.content.replace(
                      /<img[^>]*>/g, 
                      (match) => {
                        // Remove images that might cause 404s, or add proper error handling
                        if (match.includes('plato-hospitality-robot') || match.includes('robot.jpg')) {
                          return ''; // Remove problematic images
                        }
                        return match.replace(/style="[^"]*"/g, '').replace(/>$/, ' style="max-width: 100%; height: auto;" onerror="this.style.display=\'none\'">')
                      }
                    ).replace(
                      /<table[^>]*>/g,
                      (match) => match.replace(/style="[^"]*"/g, '').replace(/>$/, ' style="max-width: 100%; table-layout: fixed;">')
                    )
                  }} 
                />
              </div>
            )}
            <div className="flex space-x-2">
              <button
                onClick={() => handleDownloadArticle(blog)}
                className="flex-1 flex items-center justify-center px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
              >
                <Download className="w-4 h-4 mr-1" />
                Download
              </button>
              <button
                onClick={() => handleCopyHTML(blog)}
                className="flex-1 flex items-center justify-center px-3 py-2 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
              >
                <Copy className="w-4 h-4 mr-1" />
                Copy HTML
              </button>
            </div>
          </div>
        );
      })}
      </div>
      
      {/* Loading indicator for main page */}
      {isLoadingMoreBlogs && (
        <div className="flex justify-center py-8">
          <div className="flex items-center space-x-2 text-gray-500">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
            <span className="text-sm">Loading more articles...</span>
          </div>
        </div>
      )}
      
      {/* Manual Load More button for testing */}
      {hasMoreBlogs && !isLoadingMoreBlogs && (
        <div className="text-center py-8">
          <button
            onClick={loadMoreBlogs}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Load More ({displayedBlogs.length} of {blogs.length})
          </button>
        </div>
      )}
      

      
      {/* End of articles indicator for main page */}
      {!hasMoreBlogs && displayedBlogs.length > 0 && (
        <div className="text-center py-8">
          <span className="text-sm text-gray-500">All articles loaded</span>
        </div>
      )}
    </div>
  );

  const renderKeywordsTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {keywords.map((item) => {
        if (!item.id || !item.keywords?.length) return null;
        const currentIndex = keywordIndexMap[item.id] || 0;
        const currentKeyword = item.keywords[currentIndex];

        return (
          <div
            key={item.id}
            className="bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-center mb-4">
              <Key className="w-5 h-5 text-blue-600 mr-2" />
              <h3 className="text-lg font-semibold">Keyword Research</h3>
            </div>
            <div className="mb-4">
              <p className="text-sm text-gray-500">Main: {item.mainKeyword}</p>
              <p className="text-sm text-gray-500">
                Generated: {item.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
              </p>
            </div>
            <div className="bg-gray-50 rounded p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">{currentKeyword.keyword}</h4>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePrevKeyword(item.id!)}
                    disabled={currentIndex === 0}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-500">
                    {currentIndex + 1} of {item.keywords?.length || 0}
                  </span>
                  <button
                    onClick={() => handleNextKeyword(item.id!, item.keywords?.length || 0)}
                    disabled={currentIndex === (item.keywords?.length || 0) - 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                Relevance: {currentKeyword.relevance}
              </p>
              <button
                onClick={() => handleUseKeyword(currentKeyword.keyword)}
                className="w-full flex items-center justify-center px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
              >
                <Send className="w-4 h-4 mr-2" />
                Use for Article
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderProductsTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {products.map((product) => (
        <div
          key={product.id}
          className="bg-white rounded-lg border border-gray-200 p-6 hover:border-blue-300 transition-colors"
        >
          <div className="flex items-center mb-4">
            <Package className="w-5 h-5 text-blue-600 mr-2" />
            <h3 className="text-lg font-semibold truncate">{product.productName}</h3>
          </div>
          <div className="mb-4">
            <p className="text-sm text-gray-500">
              Status: <span className="capitalize">{product.status}</span>
            </p>
            {product.seoScore && (
              <p className="text-sm text-gray-500">
                SEO Score: {product.seoScore}/100
              </p>
            )}
            <p className="text-sm text-gray-500">
              Optimized: {product.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
            </p>
          </div>
          {product.optimizedDescription && (
            <div className="mb-4 h-24 overflow-y-auto bg-gray-50 rounded p-3 text-sm">
              {product.optimizedDescription.substring(0, 150)}
              {product.optimizedDescription.length > 150 && '...'}
            </div>
          )}
          <div className="flex space-x-2">
            <Link
              href={`/dashboard/products?edit=${product.id}`}
              className="flex-1 flex items-center justify-center px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
            >
              View Details
            </Link>
          </div>
        </div>
      ))}
    </div>
  );

  const renderCollectionsTab = () => (
    <div className="text-center py-12">
      <LayoutGrid className="w-16 h-16 text-gray-300 mx-auto mb-4" />
      <p className="text-gray-500 mb-4">Collection optimization coming soon</p>
      <Link
        href="/dashboard/collections"
        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
      >
        Optimize Collections
      </Link>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'blogs':
        return blogs.length > 0 ? renderBlogsTab() : (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No articles generated yet</p>
            <Link
              href="/dashboard/articles"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Generate Your First Article
            </Link>
          </div>
        );
      case 'keywords':
        return keywords.length > 0 ? renderKeywordsTab() : (
          <div className="text-center py-12">
            <Key className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No keyword research generated yet</p>
            <Link
              href="/dashboard/keywords"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Generate Keywords
            </Link>
          </div>
        );
      case 'thumbnails':
        return (
          <div className="text-center py-12">
            <ImageIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No thumbnails generated yet</p>
            <Link
              href="/dashboard/generate-thumbnail"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Generate Thumbnails
            </Link>
          </div>
        );
      case 'products':
        return products.length > 0 ? renderProductsTab() : (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No products optimized yet</p>
            <Link
              href="/dashboard/products"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Optimize Products
            </Link>
          </div>
        );
      case 'collections':
        return renderCollectionsTab();
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">Content History</h1>
            <p className="text-gray-600">Your generated content organized by type</p>
          </div>
          {/* Shopify Push Button - Only visible when blogs tab is selected and there are articles */}
          {activeTab === 'blogs' && blogs.length > 0 && (
            <button
              onClick={handleOpenShopifyModal}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
            >
              📤 Push to Shopify
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.name}</span>
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
                    {tab.count}
                  </span>
                </div>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-96">
        {renderTabContent()}
      </div>

      {/* Shopify Push Modal */}
      {showShopifyModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Push Articles to Shopify</h2>
              <button
                onClick={() => {
                  setShowShopifyModal(false);
                  setSelectedArticleIds([]);
                  setSelectedBrandId('');
                  // Reset pagination states
                  setDisplayedArticles([]);
                  setIsLoadingMore(false);
                  setHasMoreArticles(true);
                  // Reset author and blog states
                  setArticleAuthor('');
                  setSelectedBlogId('');
                  setShopifyBlogs([]);
                  setIsLoadingBlogs(false);
                }}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="mb-6">
              {/* Brand Profile Selection */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    {selectedBrandId ? (
                      <>
                        <Check className="w-5 h-5 text-green-600 mr-2" />
                        <p className="text-sm text-green-600 font-medium">
                          Brand Profile Selected
                        </p>
                      </>
                    ) : (
                      <label className="block text-sm font-medium text-red-600">
                        Select Brand Profile
                        <span className="ml-1 text-red-600">*</span>
                      </label>
                    )}
                  </div>
                  <Link
                    href="/dashboard/settings/brands"
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    + Add New Brand
                  </Link>
                </div>

                <div className={`${!selectedBrandId ? 'border-2 border-red-200 rounded-lg p-4' : ''}`}>
                  {brandProfiles.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {brandProfiles.map((profile) => (
                        <button
                          key={profile.id}
                          onClick={() => handleBrandSelection(profile.id || '')}
                          className={`flex-shrink-0 w-64 p-3 border rounded-lg text-left transition-colors ${
                            selectedBrandId === profile.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div
                              className="w-4 h-4 rounded-full flex-shrink-0"
                              style={{ backgroundColor: profile.brandColor }}
                            />
                            <div className="min-w-0 flex-1">
                              <span className="font-medium block truncate">{profile.brandName}</span>
                              <p className="text-sm text-gray-500 truncate">{profile.businessType}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className={`text-center py-8 bg-gray-50 rounded-lg border-2 ${!selectedBrandId ? 'border-red-200' : 'border-dashed border-gray-300'}`}>
                      <p className={`mb-2 ${!selectedBrandId ? 'text-red-600' : 'text-gray-500'}`}>
                        No brand profiles yet
                      </p>
                      <Link
                        href="/dashboard/settings/brands"
                        className="text-blue-600 hover:text-blue-500"
                      >
                        + Create your first brand profile
                      </Link>
                    </div>
                  )}
                  
                  {!selectedBrandId && brandProfiles.length > 0 && (
                    <div className="text-sm text-red-600 mt-2">
                      Please select a brand profile before pushing to Shopify
                    </div>
                  )}
                </div>
              </div>

              {/* Author and Blog Selection */}
              {selectedBrandId && (
                <div className="mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Author Input */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Author
                      </label>
                      <input
                        type="text"
                        value={articleAuthor}
                        onChange={(e) => setArticleAuthor(e.target.value)}
                        placeholder="Enter author name (optional)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    {/* Blog Selector */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Shopify Blog
                        <span className="ml-1 text-red-600">*</span>
                      </label>
                      <select
                        value={selectedBlogId}
                        onChange={(e) => setSelectedBlogId(e.target.value)}
                        disabled={isLoadingBlogs || shopifyBlogs.length === 0}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="">
                          {isLoadingBlogs 
                            ? 'Loading blogs...' 
                            : shopifyBlogs.length === 0 
                            ? 'No blogs available' 
                            : 'Select a blog'
                          }
                        </option>
                        {shopifyBlogs.map((blog) => (
                          <option key={blog.id} value={blog.id}>
                            {blog.title}
                          </option>
                        ))}
                      </select>
                      {shopifyBlogs.length === 0 && !isLoadingBlogs && selectedBrandId && (
                        <p className="text-sm text-red-600 mt-1">
                          No blogs found. Please create a blog in your Shopify store first.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Select All/None Button */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={handleSelectAllArticles}
                  className="text-sm text-blue-600 hover:text-blue-500 font-medium"
                >
                  {selectedArticleIds.length === blogs.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-sm text-gray-500">
                  {selectedArticleIds.length} of {blogs.length} selected
                </span>
              </div>
            </div>

            {/* Articles List */}
            <div 
              className="space-y-3 mb-6 max-h-96 overflow-y-auto"
              onScroll={handleModalScroll}
            >
              {displayedArticles.map((article) => (
                <div
                  key={article.id}
                  className={`border-2 rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                    selectedArticleIds.includes(article.id!)
                      ? 'border-green-500 bg-green-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                  onClick={() => handleSelectArticle(article.id!)}
                >
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 mt-1">
                      <div className={`relative w-5 h-5 rounded border-2 transition-all duration-200 ${
                        selectedArticleIds.includes(article.id!)
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-gray-400'
                      }`}>
                        {selectedArticleIds.includes(article.id!) && (
                          <Check className="w-3 h-3 text-white absolute top-0.5 left-0.5" />
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <h4 className={`text-sm font-medium mb-1 ${
                          selectedArticleIds.includes(article.id!)
                            ? 'text-green-900'
                            : 'text-gray-900'
                        }`}>
                          {article.title}
                        </h4>
                        {selectedArticleIds.includes(article.id!) && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
                            Ready to Push
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Created {article.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                      </p>
                      <p className="text-xs text-gray-500">
                        Keyword: {article.keyword || 'Not specified'}
                      </p>
                      {article.content && (
                        <div className="mt-2">
                          <div 
                            className="text-xs text-gray-600 line-clamp-2"
                            dangerouslySetInnerHTML={{ 
                              __html: article.content
                                .replace(/<img[^>]*>/gi, '') // Remove all img tags to prevent 404s
                                .substring(0, 150) + '...' 
                            }} 
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Loading indicator */}
              {isLoadingMore && (
                <div className="flex justify-center py-4">
                  <div className="flex items-center space-x-2 text-gray-500">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                    <span className="text-sm">Loading more articles...</span>
                  </div>
                </div>
              )}
              
              {/* End of articles indicator */}
              {!hasMoreArticles && displayedArticles.length > 0 && (
                <div className="text-center py-4">
                  <span className="text-sm text-gray-500">All articles loaded</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowShopifyModal(false);
                  setSelectedArticleIds([]);
                  setSelectedBrandId('');
                  // Reset pagination states
                  setDisplayedArticles([]);
                  setIsLoadingMore(false);
                  setHasMoreArticles(true);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handlePushToShopify}
                disabled={
                  selectedArticleIds.length === 0 || 
                  isPushingToShopify ||
                  !selectedBrandId ||
                  !selectedBlogId ||
                  !brandProfiles.find(p => p.id === selectedBrandId)?.shopifyStoreUrl ||
                  !brandProfiles.find(p => p.id === selectedBrandId)?.shopifyAccessToken
                }
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPushingToShopify 
                  ? `Pushing ${selectedArticleIds.length} article${selectedArticleIds.length !== 1 ? 's' : ''}...`
                  : selectedArticleIds.length === 0
                  ? 'Select articles to push'
                  : !selectedBrandId
                  ? 'Select a brand profile first'
                  : !selectedBlogId
                  ? 'Select a blog to publish to'
                  : !brandProfiles.find(p => p.id === selectedBrandId)?.shopifyStoreUrl || !brandProfiles.find(p => p.id === selectedBrandId)?.shopifyAccessToken
                  ? 'Shopify credentials required'
                  : `Push ${selectedArticleIds.length} article${selectedArticleIds.length !== 1 ? 's' : ''} to Shopify`
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastNotification.show && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom duration-300">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
            toastNotification.type === 'success' 
              ? 'bg-green-600 text-white' 
              : 'bg-red-600 text-white'
          }`}>
            <div className="flex-shrink-0">
              {toastNotification.type === 'success' ? (
                <Check className="w-5 h-5" />
              ) : (
                <X className="w-5 h-5" />
              )}
            </div>
            <span className="text-sm font-medium">{toastNotification.message}</span>
            <button
              onClick={() => setToastNotification({ show: false, message: '', type: 'success' })}
              className="flex-shrink-0 ml-2 hover:opacity-80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 