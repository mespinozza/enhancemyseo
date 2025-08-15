'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useUsageRefresh } from '@/lib/usage-refresh-context';
import { useRouter } from 'next/navigation';
import { brandProfileOperations, BrandProfile } from '@/lib/firebase/firestore';
import BrandProfileForm from '@/components/brand/BrandProfileForm';
import UsageTracker from '@/components/usage/UsageTracker';
import { getUserUsage, canPerformAction, incrementUsage } from '@/lib/usage-limits';
import { toast } from 'react-hot-toast';
import { Image, Check, X, Eye, EyeOff } from 'lucide-react';

interface ShopifyArticle {
  id: string;
  title: string;
  content: string;
  status: string;
  handle: string;
  created_at: string;
  image?: {
    id: string;
    src: string;
    alt: string;
  };
}

export default function GenerateThumbnailPage() {
  const { user, subscription_status } = useAuth();
  const { refreshUsage } = useUsageRefresh();
  const router = useRouter();

  // All state hooks must be at the top level
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [showBrandForm, setShowBrandForm] = useState(false);
  
  // Shopify articles states with pagination
  const [allShopifyArticles, setAllShopifyArticles] = useState<ShopifyArticle[]>([]);
  const [displayedArticles, setDisplayedArticles] = useState<ShopifyArticle[]>([]);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([]);
  
  // Generation states
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{[key: string]: 'pending' | 'generating' | 'completed' | 'error'}>({});

  // Ref for infinite scroll
  const articlesContainerRef = useRef<HTMLDivElement>(null);

  const ARTICLES_PER_PAGE = 9;

  // Admin-only access control
  useEffect(() => {
    if (user && subscription_status !== 'admin') {
      router.push('/dashboard/articles');
    }
  }, [user, subscription_status, router]);

  const loadBrandProfiles = useCallback(async () => {
    if (!user) return;
    setIsLoadingProfiles(true);
    try {
      const profiles = await brandProfileOperations.getAll(user.uid);
      setBrandProfiles(profiles);
      
      // If there's only one profile, select it automatically
      if (profiles.length === 1) {
        setSelectedBrandId(profiles[0].id || '');
      }
    } catch (error) {
      console.error('Error loading brand profiles:', error);
    } finally {
      setIsLoadingProfiles(false);
    }
  }, [user]);

  // Load brand profiles effect
  useEffect(() => {
    loadBrandProfiles();
  }, [loadBrandProfiles]);

  // Auto-load articles when brand is selected
  useEffect(() => {
    if (selectedBrandId && brandProfiles.length > 0) {
      loadShopifyArticles(selectedBrandId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBrandId, brandProfiles.length]);

  // Callback hooks
  const loadMoreArticles = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    
    const startIndex = currentPage * ARTICLES_PER_PAGE;
    const endIndex = startIndex + ARTICLES_PER_PAGE;
    const newArticles = allShopifyArticles.slice(startIndex, endIndex);
    
    setTimeout(() => {
      setDisplayedArticles(prev => {
        // Ensure no duplicates by filtering out articles that already exist
        const existingIds = new Set(prev.map(article => article.id));
        const filteredNewArticles = newArticles.filter(article => !existingIds.has(article.id));
        return [...prev, ...filteredNewArticles];
      });
      setCurrentPage(prev => prev + 1);
      setHasMore(endIndex < allShopifyArticles.length);
      setIsLoadingMore(false);
    }, 500);
  }, [allShopifyArticles, currentPage, hasMore, isLoadingMore]);

  const handleScroll = useCallback(() => {
    const container = articlesContainerRef.current;
    if (!container || isLoadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
    
    if (scrollPercentage > 0.8) {
      loadMoreArticles();
    }
  }, [loadMoreArticles, isLoadingMore, hasMore]);

  // Set up scroll listener effect
  useEffect(() => {
    const container = articlesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  const loadShopifyArticles = useCallback(async (brandId: string, reset = true) => {
    const selectedBrand = brandProfiles.find(p => p.id === brandId);
    if (!selectedBrand?.shopifyStoreUrl || !selectedBrand?.shopifyAccessToken) {
      toast.error('Shopify credentials not found. Please update your brand profile.');
      return;
    }

    if (reset) {
      setIsLoadingArticles(true);
      setCurrentPage(0);
      setDisplayedArticles([]);
      setAllShopifyArticles([]);
      setHasMore(false);
      setSelectedArticleIds([]);
    }

    try {
      const response = await fetch('/api/shopify/get-articles', {
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
        const articles = data.articles || [];
        
        const uniqueArticles = articles.filter((article: ShopifyArticle, index: number, self: ShopifyArticle[]) => 
          index === self.findIndex(a => a.id === article.id)
        );
        
        if (reset) {
          setAllShopifyArticles(uniqueArticles);
          const initialArticles = uniqueArticles.slice(0, ARTICLES_PER_PAGE);
          setDisplayedArticles(initialArticles);
          setHasMore(uniqueArticles.length > ARTICLES_PER_PAGE);
          setCurrentPage(1);
        }
      } else {
        const errorData = await response.json();
        toast.error(`Failed to load articles: ${errorData.error || 'Unknown error'}`);
        if (reset) {
          setAllShopifyArticles([]);
          setDisplayedArticles([]);
          setHasMore(false);
        }
      }
    } catch (error) {
      console.error('Error loading Shopify articles:', error);
      toast.error('Failed to load Shopify articles');
      if (reset) {
        setAllShopifyArticles([]);
        setDisplayedArticles([]);
        setHasMore(false);
      }
    } finally {
      if (reset) {
        setIsLoadingArticles(false);
      }
    }
  }, [brandProfiles, user]);

  const handleBrandSelection = async (brandId: string) => {
    setSelectedBrandId(brandId);
    setSelectedArticleIds([]);
    setDisplayedArticles([]);
    setAllShopifyArticles([]);
    setCurrentPage(0);
    setHasMore(false);
    setGenerationProgress({}); // Reset generation progress
    
    if (brandId) {
      await loadShopifyArticles(brandId);
    }
  };

  const handleBrandSave = async () => {
    setShowBrandForm(false);
    await loadBrandProfiles();
  };

  const handleSelectAllArticles = () => {
    if (selectedArticleIds.length === allShopifyArticles.length) {
      setSelectedArticleIds([]);
    } else {
      setSelectedArticleIds(allShopifyArticles.map(article => article.id));
    }
  };

  const handleSelectArticle = (articleId: string) => {
    setSelectedArticleIds(prev => 
      prev.includes(articleId) 
        ? prev.filter(id => id !== articleId)
        : [...prev, articleId]
    );
  };

  const handleGenerateThumbnails = async () => {
    if (!selectedBrandId || selectedArticleIds.length === 0 || !user) {
      return;
    }

    // Check usage limits
    try {
      const currentUsage = await getUserUsage(user.uid);
      const { canPerform, reason } = await canPerformAction(user.uid, subscription_status, 'thumbnails', currentUsage, selectedArticleIds.length);
      
      if (!canPerform) {
        const errorMessage = reason || 'You have reached your limit. Please upgrade your plan or wait for the next reset period.';
        toast.error(errorMessage);
        return;
      }
    } catch (error) {
      console.error('Error checking usage limits:', error);
      toast.error('Unable to verify usage limits. Please try again.');
      return;
    }

    setIsGenerating(true);
    
    // Initialize progress for all selected articles
    const initialProgress = selectedArticleIds.reduce((acc, id) => ({
      ...acc,
      [id]: 'pending' as const
    }), {});
    setGenerationProgress(initialProgress);

    try {
      const selectedBrand = brandProfiles.find(profile => profile.id === selectedBrandId);
      if (!selectedBrand) {
        throw new Error('Selected brand profile not found');
      }

      const selectedArticles = allShopifyArticles.filter(article => 
        selectedArticleIds.includes(article.id)
      );

      let completedCount = 0;

      // Generate thumbnails sequentially to avoid rate limits
      for (const article of selectedArticles) {
        setGenerationProgress(prev => ({ ...prev, [article.id]: 'generating' }));

        try {
          const response = await fetch('/api/generate-thumbnail', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await user.getIdToken()}`,
            },
            body: JSON.stringify({
              articleTitle: article.title,
              articleId: article.id,
              shopifyStoreUrl: selectedBrand.shopifyStoreUrl,
              shopifyAccessToken: selectedBrand.shopifyAccessToken,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate thumbnail');
          }

          setGenerationProgress(prev => ({ ...prev, [article.id]: 'completed' }));
          completedCount++;
          
          // Increment usage after successful generation
          await incrementUsage(user.uid, 'thumbnails');
          await refreshUsage('thumbnails');

        } catch (error) {
          console.error(`Failed to generate thumbnail for ${article.title}:`, error);
          setGenerationProgress(prev => ({ ...prev, [article.id]: 'error' }));
          toast.error(`Failed to generate thumbnail for: ${article.title}`);
        }

        // Rate limiting delay between generations
        if (article !== selectedArticles[selectedArticles.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (completedCount > 0) {
        toast.success(`Successfully generated ${completedCount} thumbnail${completedCount !== 1 ? 's' : ''}!`);
        // Reload articles to show updated images
        await loadShopifyArticles(selectedBrandId);
      }

    } catch (error) {
      console.error('Failed to generate thumbnails:', error);
      toast.error(`Thumbnail generation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGenerating(false);
      setSelectedArticleIds([]);
      setGenerationProgress({});
    }
  };

  // Don't render the page content if user is not admin
  if (subscription_status !== 'admin') {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Restricted</h1>
            <p className="text-gray-600 mb-6">This feature is only available to administrators.</p>
            <button
              onClick={() => router.push('/dashboard/articles')}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Go to Generate Articles
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Brand Profile Form Modal */}
      {showBrandForm && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Create Brand Profile</h2>
              <button
                onClick={() => setShowBrandForm(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <BrandProfileForm
              onSave={handleBrandSave}
              onCancel={() => setShowBrandForm(false)}
            />
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Generate Thumbnails</h1>
          <p className="text-gray-600">Generate AI-powered thumbnails for your Shopify blog articles</p>
        </div>

        {/* Usage Tracker */}
        <UsageTracker tool="thumbnails" className="mb-8" />

        {/* Brand Profile Selection */}
        <div className={`mb-8 ${!selectedBrandId ? 'relative' : ''}`}>
          <div className="flex items-center justify-between mb-4">
            <label className={`block text-sm font-medium ${!selectedBrandId ? 'text-red-600' : 'text-gray-700'}`}>
              Select Brand Profile
              {!selectedBrandId && <span className="ml-1 text-red-600">*</span>}
            </label>
            <button
              onClick={() => setShowBrandForm(true)}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              + Add New Brand
            </button>
          </div>

          <div className={`grid gap-4 ${!selectedBrandId ? 'border-2 border-red-200 rounded-lg p-4' : ''}`}>
            {isLoadingProfiles ? (
              <div className="text-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-2 text-sm text-gray-500">Loading brand profiles...</p>
              </div>
            ) : brandProfiles.length > 0 ? (
              brandProfiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => handleBrandSelection(profile.id || '')}
                  className={`p-4 border rounded-lg text-left transition-colors ${
                    selectedBrandId === profile.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: profile.brandColor }}
                      />
                      <span className="font-medium">{profile.brandName}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      {profile.shopifyStoreUrl && profile.shopifyAccessToken ? (
                        <span className="flex items-center text-green-600">
                          <Check className="w-4 h-4 mr-1" />
                          Shopify Connected
                        </span>
                      ) : (
                        <span className="flex items-center text-red-600">
                          <X className="w-4 h-4 mr-1" />
                          Shopify Not Connected
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{profile.businessType}</p>
                </button>
              ))
            ) : (
              <div className={`text-center py-8 bg-gray-50 rounded-lg border-2 ${!selectedBrandId ? 'border-red-200' : 'border-dashed border-gray-300'}`}>
                <p className={`mb-2 ${!selectedBrandId ? 'text-red-600' : 'text-gray-500'}`}>
                  No brand profiles yet
                </p>
                <button
                  onClick={() => setShowBrandForm(true)}
                  className="text-blue-600 hover:text-blue-500"
                >
                  + Create your first brand profile
                </button>
              </div>
            )}
            
            {!selectedBrandId && !isLoadingProfiles && brandProfiles.length > 0 && (
              <div className="text-sm text-red-600 mt-2">
                Please select a brand profile to load Shopify articles
              </div>
            )}
          </div>
        </div>

        {/* Articles Selection */}
        {selectedBrandId && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">Shopify Articles</h2>
                <p className="text-sm text-gray-600">Select articles to generate thumbnails for</p>
              </div>
              {allShopifyArticles.length > 0 && (
                <div className="flex items-center space-x-4">
                  <button
                    onClick={handleSelectAllArticles}
                    className="text-sm text-blue-600 hover:text-blue-500 font-medium"
                  >
                    {selectedArticleIds.length === allShopifyArticles.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-sm text-gray-500">
                    {selectedArticleIds.length} of {allShopifyArticles.length} selected
                  </span>
                </div>
              )}
            </div>

            {isLoadingArticles ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading Shopify articles...</p>
              </div>
            ) : allShopifyArticles.length > 0 ? (
              <>
                <div 
                  ref={articlesContainerRef}
                  className="max-h-96 overflow-y-scroll border border-gray-100 rounded-lg p-4 mb-6"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#9CA3AF #F3F4F6',
                  }}
                >
                  <style jsx>{`
                    div::-webkit-scrollbar {
                      width: 8px;
                    }
                    div::-webkit-scrollbar-track {
                      background: #F3F4F6;
                      border-radius: 4px;
                    }
                    div::-webkit-scrollbar-thumb {
                      background: #9CA3AF;
                      border-radius: 4px;
                    }
                    div::-webkit-scrollbar-thumb:hover {
                      background: #6B7280;
                    }
                  `}</style>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayedArticles.map((article) => (
                      <div
                        key={article.id}
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                          selectedArticleIds.includes(article.id)
                            ? 'border-green-500 bg-green-50 shadow-md'
                            : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                        }`}
                        onClick={() => handleSelectArticle(article.id)}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0 mt-1">
                            <div className={`relative w-5 h-5 rounded border-2 transition-all duration-200 ${
                              selectedArticleIds.includes(article.id)
                                ? 'bg-green-500 border-green-500'
                                : 'bg-white border-gray-300 hover:border-gray-400'
                            }`}>
                              {selectedArticleIds.includes(article.id) && (
                                <Check className="w-3 h-3 text-white absolute top-0.5 left-0.5" />
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-2">
                              <h3 className={`text-sm font-medium line-clamp-2 ${
                                selectedArticleIds.includes(article.id)
                                  ? 'text-green-900'
                                  : 'text-gray-900'
                              }`}>
                                {article.title}
                              </h3>
                              {selectedArticleIds.includes(article.id) && (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
                                  Selected
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">
                                {(() => {
                                  try {
                                    return new Date(article.created_at as any).toLocaleDateString();
                                  } catch {
                                    return 'Unknown';
                                  }
                                })()}
                              </span>
                              <div className="flex items-center text-xs">
                                {article.image ? (
                                  <span className="flex items-center text-green-600">
                                    <Eye className="w-3 h-3 mr-1" />
                                    Has Image
                                  </span>
                                ) : (
                                  <span className="flex items-center text-gray-500">
                                    <EyeOff className="w-3 h-3 mr-1" />
                                    No Image
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Generation Progress */}
                            {generationProgress[article.id] && (
                              <div className="mt-2">
                                <div className={`text-xs px-2 py-1 rounded-full text-center ${
                                  generationProgress[article.id] === 'completed' ? 'bg-green-100 text-green-700' :
                                  generationProgress[article.id] === 'generating' ? 'bg-blue-100 text-blue-700' :
                                  generationProgress[article.id] === 'error' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {generationProgress[article.id] === 'completed' ? '✓ Complete' :
                                   generationProgress[article.id] === 'generating' ? '🔄 Generating...' :
                                   generationProgress[article.id] === 'error' ? '✗ Error' :
                                   '⏳ Pending'}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Loading more indicator */}
                  {isLoadingMore && (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
                      <p className="text-sm text-gray-500">Loading more articles...</p>
                    </div>
                  )}

                  {/* Load More Button */}
                  {!isLoadingMore && hasMore && (
                    <div className="text-center py-4">
                      <button
                        onClick={loadMoreArticles}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Load More Articles
                      </button>
                    </div>
                  )}

                  {/* All loaded indicator */}
                  {!hasMore && displayedArticles.length > 0 && displayedArticles.length === allShopifyArticles.length && (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500">All articles loaded</p>
                    </div>
                  )}
                </div>

                {/* Generate Button */}
                <div className="flex justify-center">
                  <button
                    onClick={handleGenerateThumbnails}
                    disabled={selectedArticleIds.length === 0 || isGenerating}
                    className="px-6 py-3 text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {isGenerating 
                      ? `Generating ${selectedArticleIds.length} thumbnail${selectedArticleIds.length !== 1 ? 's' : ''}...`
                      : selectedArticleIds.length === 0
                      ? 'Select articles to generate thumbnails'
                      : `Generate ${selectedArticleIds.length} thumbnail${selectedArticleIds.length !== 1 ? 's' : ''}`
                    }
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Image className="w-16 h-16 text-gray-300 mx-auto mb-4" aria-label="No articles found" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Articles Found</h3>
                <p className="text-gray-600">
                  No articles found in your Shopify store. Make sure your store has published blog articles.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 