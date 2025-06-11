'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { FileText, Key, Download, ExternalLink, ArrowLeft, ArrowRight, Send, Package, LayoutGrid, Copy, Check, X } from 'lucide-react';
import { blogOperations, historyOperations, generatedProductOperations, Blog, HistoryItem, GeneratedProduct } from '@/lib/firebase/firestore';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type TabType = 'blogs' | 'keywords' | 'collections' | 'products';
type SubscriptionTier = 'free' | 'kickstart' | 'seo-takeover' | 'admin';

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
  const [toast, setToast] = useState<ToastNotification>({ show: false, message: '', type: 'success' });
  const highlightedItemRef = useRef<HTMLDivElement>(null);

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
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
        const [blogsData, keywordsData] = await Promise.all([
          blogOperations.getAll(user.uid),
          historyOperations.getAll(user.uid)
        ]);
        
        setBlogs(blogsData);
        setKeywords(keywordsData.filter(item => item.type === 'keywords'));

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

  const renderBlogsTab = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {blogs.map((blog) => {
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
                      (match) => match.replace(/style="[^"]*"/g, '').replace(/>$/, ' style="max-width: 100%; height: auto;">')
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
        <h1 className="text-2xl font-bold mb-2">Content History</h1>
        <p className="text-gray-600">Your generated content organized by type</p>
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

      {/* Toast Notification */}
      {toast.show && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom duration-300">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' 
              ? 'bg-green-600 text-white' 
              : 'bg-red-600 text-white'
          }`}>
            <div className="flex-shrink-0">
              {toast.type === 'success' ? (
                <Check className="w-5 h-5" />
              ) : (
                <X className="w-5 h-5" />
              )}
            </div>
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => setToast({ show: false, message: '', type: 'success' })}
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