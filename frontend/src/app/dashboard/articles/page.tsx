'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useUsageRefresh } from '@/lib/usage-refresh-context';
import { brandProfileOperations, BrandProfile, blogOperations, Blog } from '@/lib/firebase/firestore';
import BrandProfileForm from '@/components/brand/BrandProfileForm';
import UsageTracker from '@/components/usage/UsageTracker';
import { getUserUsage, canPerformAction } from '@/lib/usage-limits';
import { toast } from 'react-hot-toast';
import { Download, Copy, Plus, Sparkles, X, Check } from 'lucide-react';
import { ContentSelection, ShopifyProduct, ShopifyCollection, ShopifyPage, ContentSearchResults, WebsitePage } from '@/types/content-selection';
import { getIntegrationCapabilities } from '@/lib/firebase/firestore';

interface BlogPost {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  status: 'draft' | 'published';
}

interface BulkGenerationStatus {
  [index: number]: 'pending' | 'generating' | 'completed' | 'error';
}

export default function ArticlesPage() {
  const { user, subscription_status } = useAuth();
  const { refreshUsage, refreshSidebar } = useUsageRefresh();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [showBrandForm, setShowBrandForm] = useState(false);
  
  // Bulk generation states
  const [keywords, setKeywords] = useState<string[]>(['']);
  const [generatedArticles, setGeneratedArticles] = useState<BlogPost[]>([]);
  const [bulkGenerationStatus, setBulkGenerationStatus] = useState<BulkGenerationStatus>({});
  const [expandedArticle, setExpandedArticle] = useState<number | null>(null);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  
  const [instructions, setInstructions] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [contentType, setContentType] = useState('');
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  
  // New content selection state
  const [contentSelection, setContentSelection] = useState<ContentSelection>({
    mode: 'automatic',
    automaticOptions: {
      includeProducts: true,
      includeCollections: true,
      includePages: true
    },
    manualSelections: {
      products: [],
      collections: [],
      pages: []
    },
    usesSitemap: false
  });
  
  // Manual search states
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [collectionSearchTerm, setCollectionSearchTerm] = useState('');
  const [pageSearchTerm, setPageSearchTerm] = useState('');
  
  // Website content search states (unified approach)
  const [websiteSearchTerm, setWebsiteSearchTerm] = useState('');
  const [websiteSearchResults, setWebsiteSearchResults] = useState<WebsitePage[]>([]);
  const [isSearchingWebsite, setIsSearchingWebsite] = useState(false);
  
  const [searchResults, setSearchResults] = useState<ContentSearchResults>({
    products: [],
    collections: [],
    pages: [],
    hasNextPage: false
  });
  const [isSearching, setIsSearching] = useState({
    products: false,
    collections: false,
    pages: false
  });
  const [pagination, setPagination] = useState({
    products: { hasNextPage: false, endCursor: null, total: 0 },
    collections: { hasNextPage: false, endCursor: null, total: 0 },
    pages: { hasNextPage: false, endCursor: null, total: 0 }
  });
  const [isLoadingMore, setIsLoadingMore] = useState({
    products: false,
    collections: false,
    pages: false
  });

  // Generation issue modal state
  const [showGenerationIssueModal, setShowGenerationIssueModal] = useState({
    show: false,
    keyword: '',
    articleContent: ''
  });
  
  // Touched state for validation
  const [touchedFields, setTouchedFields] = useState({
    keyword: false,
    contentType: false,
    brandProfile: false
  });
  
  // Shopify push states
  const [showShopifyModal, setShowShopifyModal] = useState(false);
  const [selectedArticleIds, setSelectedArticleIds] = useState<string[]>([]);
  const [isPushingToShopify, setIsPushingToShopify] = useState(false);
  const [articleAuthor, setArticleAuthor] = useState('');
  const [selectedBlogId, setSelectedBlogId] = useState('');
  const [shopifyBlogs, setShopifyBlogs] = useState<Array<{ id: string; title: string }>>([]);
  const [isLoadingBlogs, setIsLoadingBlogs] = useState(false);

  // Helper function to mark a field as touched
  const markFieldAsTouched = (fieldName: 'keyword' | 'contentType' | 'brandProfile') => {
    setTouchedFields(prev => ({ ...prev, [fieldName]: true }));
  };

  // Manual search functions
  const searchProducts = useCallback(async (term: string, loadMore = false) => {
    if (!term.trim() || !selectedBrandId || !user) {
      setSearchResults((prev: ContentSearchResults) => ({ ...prev, products: [] }));
      return;
    }

    const selectedProfile = brandProfiles.find(p => p.id === selectedBrandId);
    if (!selectedProfile?.shopifyStoreUrl || !selectedProfile?.shopifyAccessToken) {
      toast.error('Shopify credentials not found for selected brand profile');
      return;
    }

    if (loadMore) {
      setIsLoadingMore(prev => ({ ...prev, products: true }));
    } else {
      setIsSearching(prev => ({ ...prev, products: true }));
    }

    try {
      const response = await fetch('/api/content-search/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`
        },
        body: JSON.stringify({
          searchTerm: term.trim(),
          shopifyStoreUrl: selectedProfile.shopifyStoreUrl,
          shopifyAccessToken: selectedProfile.shopifyAccessToken,
          cursor: loadMore ? pagination.products.endCursor : null
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (loadMore) {
          setSearchResults(prev => ({
            ...prev,
            products: [...prev.products, ...(data.products || [])]
          }));
        } else {
          setSearchResults(prev => ({ ...prev, products: data.products || [] }));
        }
        
        setPagination(prev => ({
          ...prev,
          products: {
            hasNextPage: data.pageInfo?.hasNextPage || false,
            endCursor: data.pageInfo?.endCursor || null,
            total: data.totalCount || 0
          }
        }));
      } else {
        const errorData = await response.json();
        toast.error(`Product search failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error searching products:', error);
      toast.error('Product search failed');
    } finally {
      if (loadMore) {
        setIsLoadingMore(prev => ({ ...prev, products: false }));
      } else {
        setIsSearching(prev => ({ ...prev, products: false }));
      }
    }
  }, [selectedBrandId, user, brandProfiles, pagination.products.endCursor]);

  const searchCollections = useCallback(async (term: string, loadMore = false) => {
    if (!term.trim() || !selectedBrandId || !user) {
      setSearchResults((prev: ContentSearchResults) => ({ ...prev, collections: [] }));
      return;
    }

    const selectedProfile = brandProfiles.find(p => p.id === selectedBrandId);
    if (!selectedProfile?.shopifyStoreUrl || !selectedProfile?.shopifyAccessToken) {
      toast.error('Shopify credentials not found for selected brand profile');
      return;
    }

    if (loadMore) {
      setIsLoadingMore(prev => ({ ...prev, collections: true }));
    } else {
      setIsSearching(prev => ({ ...prev, collections: true }));
    }

    try {
      const response = await fetch('/api/content-search/collections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`
        },
        body: JSON.stringify({
          searchTerm: term.trim(),
          shopifyStoreUrl: selectedProfile.shopifyStoreUrl,
          shopifyAccessToken: selectedProfile.shopifyAccessToken,
          cursor: loadMore ? pagination.collections.endCursor : null
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (loadMore) {
          setSearchResults(prev => ({
            ...prev,
            collections: [...prev.collections, ...(data.collections || [])]
          }));
        } else {
          setSearchResults(prev => ({ ...prev, collections: data.collections || [] }));
        }
        
        setPagination(prev => ({
          ...prev,
          collections: {
            hasNextPage: data.pageInfo?.hasNextPage || false,
            endCursor: data.pageInfo?.endCursor || null,
            total: data.totalCount || 0
          }
        }));
      } else {
        const errorData = await response.json();
        toast.error(`Collection search failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error searching collections:', error);
      toast.error('Collection search failed');
    } finally {
      if (loadMore) {
        setIsLoadingMore(prev => ({ ...prev, collections: false }));
      } else {
        setIsSearching(prev => ({ ...prev, collections: false }));
      }
    }
  }, [selectedBrandId, user, brandProfiles, pagination.collections.endCursor]);

  const searchPages = useCallback(async (term: string, loadMore = false) => {
    if (!term.trim() || !selectedBrandId || !user) {
      setSearchResults((prev: ContentSearchResults) => ({ ...prev, pages: [] }));
      return;
    }

    const selectedProfile = brandProfiles.find(p => p.id === selectedBrandId);
    if (!selectedProfile?.shopifyStoreUrl || !selectedProfile?.shopifyAccessToken) {
      toast.error('Shopify credentials not found for selected brand profile');
      return;
    }

    if (loadMore) {
      setIsLoadingMore(prev => ({ ...prev, pages: true }));
    } else {
      setIsSearching(prev => ({ ...prev, pages: true }));
    }

    try {
      const response = await fetch('/api/content-search/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`
        },
        body: JSON.stringify({
          searchTerm: term.trim(),
          shopifyStoreUrl: selectedProfile.shopifyStoreUrl,
          shopifyAccessToken: selectedProfile.shopifyAccessToken,
          cursor: loadMore ? pagination.pages.endCursor : null
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        if (loadMore) {
          setSearchResults(prev => ({
            ...prev,
            pages: [...prev.pages, ...(data.pages || [])]
          }));
        } else {
          setSearchResults(prev => ({ ...prev, pages: data.pages || [] }));
        }
        
        setPagination(prev => ({
          ...prev,
          pages: {
            hasNextPage: data.pageInfo?.hasNextPage || false,
            endCursor: data.pageInfo?.endCursor || null,
            total: data.totalCount || 0
          }
        }));
      } else {
        const errorData = await response.json();
        toast.error(`Page search failed: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error searching pages:', error);
      toast.error('Page search failed');
    } finally {
      if (loadMore) {
        setIsLoadingMore(prev => ({ ...prev, pages: false }));
      } else {
        setIsSearching(prev => ({ ...prev, pages: false }));
      }
    }
  }, [selectedBrandId, user, brandProfiles, pagination.pages.endCursor]);

  const loadBrandProfiles = useCallback(async () => {
    if (!user) return;
    
    setIsLoadingProfiles(true);
    try {
      const profiles = await brandProfileOperations.getAll(user.uid);
      setBrandProfiles(profiles);
      
      // Auto-select first profile if only one exists
      if (profiles.length === 1) {
        setSelectedBrandId(profiles[0].id || '');
        markFieldAsTouched('brandProfile');
      }
    } catch (error) {
      console.error('Error loading brand profiles:', error);
      toast.error('Failed to load brand profiles');
    } finally {
      setIsLoadingProfiles(false);
    }
  }, [user]);

  useEffect(() => {
    loadBrandProfiles();
  }, [loadBrandProfiles]);

  // Debounced search effects for real-time search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (productSearchTerm.trim()) {
        searchProducts(productSearchTerm);
      } else {
        setSearchResults(prev => ({ ...prev, products: [] }));
        setPagination(prev => ({ ...prev, products: { hasNextPage: false, endCursor: null, total: 0 } }));
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [productSearchTerm, selectedBrandId, searchProducts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (collectionSearchTerm.trim()) {
        searchCollections(collectionSearchTerm);
      } else {
        setSearchResults(prev => ({ ...prev, collections: [] }));
        setPagination(prev => ({ ...prev, collections: { hasNextPage: false, endCursor: null, total: 0 } }));
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [collectionSearchTerm, selectedBrandId, searchCollections]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (pageSearchTerm.trim()) {
        searchPages(pageSearchTerm);
      } else {
        setSearchResults(prev => ({ ...prev, pages: [] }));
        setPagination(prev => ({ ...prev, pages: { hasNextPage: false, endCursor: null, total: 0 } }));
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [pageSearchTerm, selectedBrandId, searchPages]);

  // Website content search functions (unified approach)
  const searchWebsiteContent = useCallback(async (searchTerm: string) => {
    if (!selectedBrandId) return;
    
    const selectedProfile = brandProfiles.find(p => p.id === selectedBrandId);
    if (!selectedProfile?.websiteUrl) return;
    
    setWebsiteSearchResults([]);
    setIsSearchingWebsite(true);
    
    try {
      const response = await fetch('/api/search-website-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user?.getIdToken()}`
        },
        body: JSON.stringify({
          websiteUrl: selectedProfile.websiteUrl,
          searchTerm: searchTerm
          // Removed contentType - now searches all page types
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`📋 Unified search found ${data.totalFound} pages:`, data.pageTypes);
        setWebsiteSearchResults(data.pages || []);
      } else {
        setWebsiteSearchResults([]);
      }
    } catch (error) {
      console.error('Website content search error:', error);
      setWebsiteSearchResults([]);
    } finally {
      setIsSearchingWebsite(false);
    }
  }, [selectedBrandId, user, brandProfiles]);

  // Debounced website search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      if (websiteSearchTerm) {
        searchWebsiteContent(websiteSearchTerm);
      } else {
        setWebsiteSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [websiteSearchTerm, selectedBrandId, searchWebsiteContent]);

  // Selection functions for manual mode
  const toggleProductSelection = (product: ShopifyProduct) => {
    setContentSelection(prev => {
      const isSelected = prev.manualSelections.products.some(p => p.id === product.id);
      if (isSelected) {
        return {
          ...prev,
          manualSelections: {
            ...prev.manualSelections,
            products: prev.manualSelections.products.filter(p => p.id !== product.id)
          }
        };
      } else {
        return {
          ...prev,
          manualSelections: {
            ...prev.manualSelections,
            products: [...prev.manualSelections.products, product]
          }
        };
      }
    });
  };

  const toggleCollectionSelection = (collection: ShopifyCollection) => {
    setContentSelection(prev => {
      const isSelected = prev.manualSelections.collections.some(c => c.id === collection.id);
      if (isSelected) {
        return {
          ...prev,
          manualSelections: {
            ...prev.manualSelections,
            collections: prev.manualSelections.collections.filter(c => c.id !== collection.id)
          }
        };
      } else {
        return {
          ...prev,
          manualSelections: {
            ...prev.manualSelections,
            collections: [...prev.manualSelections.collections, collection]
          }
        };
      }
    });
  };

  const togglePageSelection = (page: ShopifyPage) => {
    setContentSelection(prev => {
      const isSelected = prev.manualSelections.pages.some(p => p.id === page.id);
      if (isSelected) {
        return {
          ...prev,
          manualSelections: {
            ...prev.manualSelections,
            pages: prev.manualSelections.pages.filter(p => p.id !== page.id)
          }
        };
      } else {
        return {
          ...prev,
          manualSelections: {
            ...prev.manualSelections,
            pages: [...prev.manualSelections.pages, page]
          }
        };
      }
    });
  };

  // Website content selection function (unified approach)
  const toggleWebsiteContentSelection = (page: WebsitePage) => {
    setContentSelection(prev => {
      const current = prev.manualSelections.websiteContent || [];
      const isSelected = current.some(p => p.url === page.url);
      if (isSelected) {
        return {
          ...prev,
          manualSelections: {
            ...prev.manualSelections,
            websiteContent: current.filter(p => p.url !== page.url)
          }
        };
      } else {
        return {
          ...prev,
          manualSelections: {
            ...prev.manualSelections,
            websiteContent: [...current, page]
          }
        };
      }
    });
  };

  const handleBulkGenerate = async () => {
    const validKeywords = keywords.filter(k => k.trim().length > 0);
    if (!selectedBrandId || validKeywords.length === 0 || !contentType || !user) {
      return;
    }

    // Check usage limits before generating (support bulk)
    try {
      const currentUsage = await getUserUsage(user.uid);
      const { canPerform, reason } = await canPerformAction(user.uid, subscription_status, 'articles', currentUsage, validKeywords.length);
      
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
    setGeneratedArticles([]);
    
    // Initialize status for all keywords
    const initialStatus = validKeywords.reduce((acc, _, index) => ({
      ...acc,
      [index]: 'pending' as const
    }), {});
    setBulkGenerationStatus(initialStatus);

    try {
      // Get the selected brand profile
      const selectedProfile = brandProfiles.find(profile => profile.id === selectedBrandId);
      if (!selectedProfile) {
        throw new Error('Selected brand profile not found');
      }

      // Generate articles sequentially to respect rate limits
      for (let i = 0; i < validKeywords.length; i++) {
        const currentKeyword = validKeywords[i];
        
        setBulkGenerationStatus(prev => ({ ...prev, [i]: 'generating' }));

        try {
          // Create the blog post in draft status
          const blogData: Omit<Blog, 'id' | 'createdAt' | 'updatedAt'> = {
            title: `${currentKeyword} - ${contentType}`,
            content: '',
            userId: user.uid,
            brandId: selectedBrandId,
            status: 'draft',
            keyword: currentKeyword,
            contentType,
            toneOfVoice,
            instructions,
            generationSettings: {
              usePerplexity: false,
              articleFraming: contentType,
            }
          };

          // Create the initial blog post
          const blog = await blogOperations.create(user.uid, blogData);

          // Generate the content
          const response = await fetch('/api/generate-article', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await user.getIdToken()}`,
            },
            body: JSON.stringify({
              blogId: blog,
              keyword: currentKeyword,
              brandName: selectedProfile.brandName,
              businessType: selectedProfile.businessType,
              contentType,
              toneOfVoice,
              instructions,
              brandGuidelines: selectedProfile.brandGuidelines || '',
              contentSelection,
              shopifyStoreUrl: selectedProfile.shopifyStoreUrl || '',
              shopifyAccessToken: selectedProfile.shopifyAccessToken || '',
              websiteUrl: selectedProfile.websiteUrl || '',
              brandColor: selectedProfile.brandColor || '#000000',
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate article');
          }

          const generatedContent = await response.json();

          // Check for generation issues and show popup if detected
          if (generatedContent.hasGenerationIssues) {
            toast.error(`⚠️ Article generation issue detected for "${currentKeyword}". Please check the content.`);
            
            // Show the generation issue popup
            setShowGenerationIssueModal({
              show: true,
              keyword: currentKeyword,
              articleContent: generatedContent.content || ''
            });
          }

          // Update the blog post with the generated content
          if (blog) {
            await blogOperations.update(user.uid, blog, {
              content: generatedContent.content || '',
              title: generatedContent.title || blogData.title,
            });

            // Add to generated articles
            const newArticle: BlogPost = {
              id: blog,
              title: generatedContent.title || blogData.title,
              content: generatedContent.content || '',
              createdAt: new Date(),
              status: 'draft'
            };

            setGeneratedArticles(prev => [...prev, newArticle]);
            setBulkGenerationStatus(prev => ({ ...prev, [i]: 'completed' }));
            
            // Refresh usage display after each successful generation
            await refreshUsage('articles');
          }

        } catch (error) {
          console.error(`Failed to generate article ${i + 1}:`, error);
          setBulkGenerationStatus(prev => ({ ...prev, [i]: 'error' }));
          
          // Check if it's a usage limit error
          if (error instanceof Error && error.message.includes('usage limit')) {
            toast.error('Usage limit reached. Stopping bulk generation.');
            break;
          } else {
            toast.error(`Article ${i + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // Rate limiting delay between generations (except for the last one)
        if (i < validKeywords.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      const completedCount = Object.values(bulkGenerationStatus).filter(status => status === 'completed').length;
      if (completedCount > 0) {
        toast.success(`Successfully generated ${completedCount} article${completedCount !== 1 ? 's' : ''}!`);
        
        // Add delay to ensure Firestore has time to update before refreshing sidebar
        setTimeout(async () => {
          const isAdmin = subscription_status === 'admin';
          if (isAdmin) {
            console.log('Refreshing sidebar after article generation...');
            console.log('Generated articles count:', completedCount);
          }
          await refreshSidebar();
          if (isAdmin) console.log('Sidebar refresh completed');
        }, 2500); // 2.5 second delay to ensure server timestamps are resolved
      }

    } catch (error) {
      console.error('Failed to generate articles:', error);
      toast.error(`Bulk generation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Check if there's a keyword from the keywords page
  useEffect(() => {
    const savedKeyword = localStorage.getItem('selectedKeyword');
    if (savedKeyword) {
      setKeywords([savedKeyword]);
      localStorage.removeItem('selectedKeyword'); // Clear it after using
    }
  }, []);

  const handleBrandSave = async () => {
    await loadBrandProfiles();
    setShowBrandForm(false);
  };

  // Helper functions for bulk keyword management
  const addKeywordField = () => {
    if (keywords.length < 10) {
      setKeywords([...keywords, '']);
    }
  };

  const removeKeywordField = (index: number) => {
    if (keywords.length > 1) {
      const newKeywords = keywords.filter((_, i) => i !== index);
      setKeywords(newKeywords);
    }
  };

  const updateKeyword = (index: number, value: string) => {
    const newKeywords = [...keywords];
    newKeywords[index] = value;
    setKeywords(newKeywords);
  };

  // Generate keyword suggestions
  const generateKeywordSuggestions = async () => {
    const filledKeywords = keywords.filter(k => k.trim().length > 0);
    if (filledKeywords.length === 0 || !user) return;

    const selectedProfile = brandProfiles.find(profile => profile.id === selectedBrandId);
    if (!selectedProfile) return;

    setIsLoadingSuggestions(true);
    try {
      const response = await fetch('/api/suggest-keywords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          baseKeywords: filledKeywords, // Send all filled keywords
          brandName: selectedProfile.brandName,
          businessType: selectedProfile.businessType,
          brandGuidelines: selectedProfile.brandGuidelines || '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate suggestions');
      }

      const data = await response.json();
      
      // Fill empty keyword fields with suggestions (only existing fields)
      const newKeywords = [...keywords];
      let suggestionIndex = 0;
      
      // Fill all empty fields (starting from index 0)
      for (let i = 0; i < newKeywords.length && suggestionIndex < data.suggestions.length; i++) {
        if (!newKeywords[i]?.trim()) {
          newKeywords[i] = data.suggestions[suggestionIndex];
          suggestionIndex++;
        }
      }
      
      setKeywords(newKeywords);
      const emptyFieldsCount = keywords.filter(k => !k.trim()).length;
      const actualSuggestionCount = Math.min(suggestionIndex, emptyFieldsCount);
      toast.success(`Added ${actualSuggestionCount} keyword suggestions!`);
      
    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast.error('Failed to generate keyword suggestions');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleDownloadHTML = (article?: BlogPost) => {
    const targetArticle = article || (generatedArticles.length > 0 ? generatedArticles[0] : null);
    if (!targetArticle) return;

    const blob = new Blob([targetArticle.content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetArticle.title} - generated by enhancemyseo.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('Article content downloaded successfully!');
  };

  const handleCopyHTML = async (article?: BlogPost) => {
    const targetArticle = article || (generatedArticles.length > 0 ? generatedArticles[0] : null);
    if (!targetArticle) return;
    
    try {
      await navigator.clipboard.writeText(targetArticle.content);
      toast.success('Article HTML copied to clipboard!');
    } catch {
      toast.error('Failed to copy HTML to clipboard');
    }
  };

  // Shopify push functionality
  const handleSelectAllArticles = () => {
    if (selectedArticleIds.length === generatedArticles.length) {
      setSelectedArticleIds([]);
    } else {
      setSelectedArticleIds(generatedArticles.map(article => article.id));
    }
  };

  const handleSelectArticle = (articleId: string) => {
    setSelectedArticleIds(prev => 
      prev.includes(articleId) 
        ? prev.filter(id => id !== articleId)
        : [...prev, articleId]
    );
  };

  const fetchShopifyBlogs = async (brandId: string) => {
    const selectedBrand = brandProfiles.find(p => p.id === brandId);
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

  const handlePushToShopify = async () => {
    if (!selectedArticleIds.length) {
      toast.error('Please select at least one article to push');
      return;
    }

    if (!selectedBlogId) {
      toast.error('Please select a blog to publish to');
      return;
    }

    const selectedBrand = brandProfiles.find(profile => profile.id === selectedBrandId);
    if (!selectedBrand?.shopifyStoreUrl || !selectedBrand?.shopifyAccessToken) {
      toast.error('Shopify store URL and access token are required. Please update your brand profile.');
      return;
    }

    setIsPushingToShopify(true);
    
    try {
      const selectedArticles = generatedArticles.filter(article => 
        selectedArticleIds.includes(article.id)
      );

      for (const article of selectedArticles) {
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

  return (
    <div className="flex-1 flex min-h-screen h-screen bg-white">
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
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <BrandProfileForm
              onSave={handleBrandSave}
              onCancel={() => setShowBrandForm(false)}
            />
          </div>
        </div>
      )}

      {/* Left Panel - Article Generation Form */}
      <div className="w-full md:w-1/2 p-4 md:p-6 border-r border-gray-200 overflow-y-auto h-full flex-shrink-0">
        <div className="max-w-xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">Generate New Article</h2>
          
          {/* Usage Tracker */}
          <UsageTracker tool="articles" className="mb-6" />

          {/* Brand Profile Selection */}
          <div className={`mb-8 ${!selectedBrandId ? 'relative' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <label className={`block text-sm font-medium ${!selectedBrandId && touchedFields.brandProfile ? 'text-red-600' : 'text-gray-700'}`}>
                Select Brand Profile
                <span className="ml-1 text-red-600">*</span>
              </label>
              <button
                onClick={() => setShowBrandForm(true)}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                + Add New Brand
              </button>
            </div>

            <div 
              className={`grid gap-4 ${!selectedBrandId && touchedFields.brandProfile ? 'border-2 border-red-200 rounded-lg p-4' : ''}`}
              onBlur={() => markFieldAsTouched('brandProfile')}
            >
              {isLoadingProfiles ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  <p className="mt-2 text-sm text-gray-500">Loading brand profiles...</p>
                </div>
              ) : brandProfiles.length > 0 ? (
                brandProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => {
                      setSelectedBrandId(profile.id || '');
                      markFieldAsTouched('brandProfile');
                    }}
                    className={`p-4 border rounded-lg text-left transition-colors ${
                      selectedBrandId === profile.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: profile.brandColor }}
                      />
                      <span className="font-medium">{profile.brandName}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">{profile.businessType}</p>
                  </button>
                ))
              ) : (
                <div className={`text-center py-8 bg-gray-50 rounded-lg border-2 ${!selectedBrandId && touchedFields.brandProfile ? 'border-red-200' : 'border-dashed border-gray-300'}`}>
                  <p className={`mb-2 ${!selectedBrandId && touchedFields.brandProfile ? 'text-red-600' : 'text-gray-500'}`}>
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
              
              {!selectedBrandId && !isLoadingProfiles && brandProfiles.length > 0 && touchedFields.brandProfile && (
                <div className="text-sm text-red-600 mt-2">
                  Please select a brand profile before generating content
                </div>
              )}
            </div>
          </div>

          {/* Article Details */}
          <div className="space-y-6">
            {/* Product & Content Selection Block - Integration Aware */}
            {selectedBrandId ? (() => {
              const selectedBrand = brandProfiles.find(p => p.id === selectedBrandId);
              if (!selectedBrand) return null;
              
              const capabilities = getIntegrationCapabilities(selectedBrand);
              if (!capabilities.hasAnyIntegration) return null;
              
              return (
                <div className="mb-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
                    <h3 className="text-sm font-medium text-blue-800 mb-2">Content Selection</h3>
                    
                    {/* Integration Type Display */}
                    {capabilities.integrationType === 'shopify' && (
                      <p className="text-xs text-blue-700">Shopify integration enabled</p>
                    )}
                    {capabilities.integrationType === 'website' && (
                      <p className="text-xs text-blue-700">Website integration enabled</p>
                    )}
                    {capabilities.integrationType === 'both' && (
                      <p className="text-xs text-blue-700">Shopify + Website integration enabled</p>
                    )}
                    
                    {/* Selection Mode */}
                    <div className="flex space-x-4 mt-4">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="contentMode"
                          checked={contentSelection.mode === 'automatic'}
                          onChange={() => setContentSelection(prev => ({ ...prev, mode: 'automatic' }))}
                          className="mr-2"
                        />
                        <span className="text-sm">Automatic Selection</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="contentMode"
                          checked={contentSelection.mode === 'manual'}
                          onChange={() => setContentSelection(prev => ({ ...prev, mode: 'manual' }))}
                          className="mr-2"
                        />
                        <span className="text-sm">Manual Selection</span>
                      </label>
                    </div>

                    {/* Automatic Mode Options */}
                    {contentSelection.mode === 'automatic' && (
                      <div className="pl-6 space-y-2">
                        <p className="text-xs text-gray-600 mb-3">
                          Automatically find and include relevant content based on your article topic:
                        </p>
                        
                        {/* Shopify Content Section */}
                        {(capabilities.integrationType === 'shopify' || capabilities.integrationType === 'both') && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold text-gray-700 mb-2">Shopify Content:</h4>
                            <div className="flex flex-wrap gap-4">
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={contentSelection.automaticOptions.includeProducts || false}
                                  onChange={(e) => setContentSelection(prev => ({
                                    ...prev,
                                    automaticOptions: {
                                      ...prev.automaticOptions,
                                      includeProducts: e.target.checked
                                    }
                                  }))}
                                  className="mr-2"
                                />
                                <span className="text-sm">Products</span>
                              </label>
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={contentSelection.automaticOptions.includeCollections || false}
                                  onChange={(e) => setContentSelection(prev => ({
                                    ...prev,
                                    automaticOptions: {
                                      ...prev.automaticOptions,
                                      includeCollections: e.target.checked
                                    }
                                  }))}
                                  className="mr-2"
                                />
                                <span className="text-sm">Collections</span>
                              </label>
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={contentSelection.automaticOptions.includePages || false}
                                  onChange={(e) => setContentSelection(prev => ({
                                    ...prev,
                                    automaticOptions: {
                                      ...prev.automaticOptions,
                                      includePages: e.target.checked
                                    }
                                  }))}
                                  className="mr-2"
                                />
                                <span className="text-sm">Pages</span>
                              </label>
                            </div>
                          </div>
                        )}
                        
                        {/* Website Content Section (Unified Structure) */}
                        {(capabilities.integrationType === 'website' || capabilities.integrationType === 'both') && (
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold text-gray-700 mb-2">Website Content:</h4>
                            <div className="flex flex-wrap gap-4">
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={contentSelection.automaticOptions.includeWebsiteContent || false}
                                  onChange={(e) => setContentSelection(prev => ({
                                    ...prev,
                                    automaticOptions: {
                                      ...prev.automaticOptions,
                                      includeWebsiteContent: e.target.checked
                                    }
                                  }))}
                                  className="mr-2"
                                />
                                <span className="text-sm">Website Pages</span>
                              </label>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              All relevant website pages (products, services, support, etc.)
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manual Mode Options */}
                    {contentSelection.mode === 'manual' && (
                      <div className="pl-6 space-y-4">
                        <p className="text-xs text-gray-600 mb-3">
                          Search and manually select specific content to include:
                        </p>
                        
                        {/* Shopify Content Manual Selection */}
                        {(capabilities.integrationType === 'shopify' || capabilities.integrationType === 'both') && (
                          <div className="mb-6">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Shopify Content:</h4>
                            
                            {/* Shopify Products */}
                            <div className="mb-4">
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-gray-600">Products</label>
                                <span className="text-xs text-gray-500">
                                  {contentSelection.manualSelections.products.length} selected
                                </span>
                              </div>
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Search products..."
                                  value={productSearchTerm}
                                  onChange={(e) => setProductSearchTerm(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                {isSearching.products && (
                                  <div className="absolute right-3 top-2.5">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                  </div>
                                )}
                              </div>
                              
                              {/* Selected Products */}
                              {contentSelection.manualSelections.products.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {contentSelection.manualSelections.products.map((product) => (
                                    <div key={product.id} className="flex items-center bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs">
                                      <span className="truncate max-w-32">{product.title}</span>
                                      <button
                                        onClick={() => toggleProductSelection(product)}
                                        className="ml-1 hover:text-blue-600"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Search Results */}
                              {productSearchTerm && searchResults.products.length > 0 && (
                                <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md">
                                  {searchResults.products.map((product) => (
                                    <div
                                      key={product.id}
                                      className="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                      onClick={() => toggleProductSelection(product)}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <p className="text-sm font-medium text-gray-900">{product.title}</p>
                                          <p className="text-xs text-gray-500 truncate">{product.handle}</p>
                                        </div>
                                        {contentSelection.manualSelections.products.some(p => p.id === product.id) && (
                                          <Check size={16} className="text-green-600" />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            {/* Shopify Collections */}
                            <div className="mb-4">
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-gray-600">Collections</label>
                                <span className="text-xs text-gray-500">
                                  {contentSelection.manualSelections.collections.length} selected
                                </span>
                              </div>
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Search collections..."
                                  value={collectionSearchTerm}
                                  onChange={(e) => setCollectionSearchTerm(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                {isSearching.collections && (
                                  <div className="absolute right-3 top-2.5">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                  </div>
                                )}
                              </div>
                              
                              {/* Selected Collections */}
                              {contentSelection.manualSelections.collections.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {contentSelection.manualSelections.collections.map((collection) => (
                                    <div key={collection.id} className="flex items-center bg-purple-100 text-purple-800 px-2 py-1 rounded-md text-xs">
                                      <span className="truncate max-w-32">{collection.title}</span>
                                      <button
                                        onClick={() => toggleCollectionSelection(collection)}
                                        className="ml-1 hover:text-purple-600"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Search Results */}
                              {collectionSearchTerm && searchResults.collections.length > 0 && (
                                <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md">
                                  {searchResults.collections.map((collection) => (
                                    <div
                                      key={collection.id}
                                      className="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                      onClick={() => toggleCollectionSelection(collection)}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <p className="text-sm font-medium text-gray-900">{collection.title}</p>
                                          <p className="text-xs text-gray-500 truncate">{collection.handle}</p>
                                        </div>
                                        {contentSelection.manualSelections.collections.some(c => c.id === collection.id) && (
                                          <Check size={16} className="text-green-600" />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            {/* Shopify Pages */}
                            <div className="mb-4">
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-gray-600">Pages</label>
                                <span className="text-xs text-gray-500">
                                  {contentSelection.manualSelections.pages.length} selected
                                </span>
                              </div>
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Search pages..."
                                  value={pageSearchTerm}
                                  onChange={(e) => setPageSearchTerm(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                {isSearching.pages && (
                                  <div className="absolute right-3 top-2.5">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                  </div>
                                )}
                              </div>
                              
                              {/* Selected Pages */}
                              {contentSelection.manualSelections.pages.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {contentSelection.manualSelections.pages.map((page) => (
                                    <div key={page.id} className="flex items-center bg-green-100 text-green-800 px-2 py-1 rounded-md text-xs">
                                      <span className="truncate max-w-32">{page.title}</span>
                                      <button
                                        onClick={() => togglePageSelection(page)}
                                        className="ml-1 hover:text-green-600"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Search Results */}
                              {pageSearchTerm && searchResults.pages.length > 0 && (
                                <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md">
                                  {searchResults.pages.map((page) => (
                                    <div
                                      key={page.id}
                                      className="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                      onClick={() => togglePageSelection(page)}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <p className="text-sm font-medium text-gray-900">{page.title}</p>
                                          <p className="text-xs text-gray-500 truncate">{page.handle}</p>
                                        </div>
                                        {contentSelection.manualSelections.pages.some(p => p.id === page.id) && (
                                          <Check size={16} className="text-green-600" />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Website Content Manual Selection (Unified Structure) */}
                        {(capabilities.integrationType === 'website' || capabilities.integrationType === 'both') && (
                          <div className="mb-6">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Website Content:</h4>
                            
                            {/* Unified Website Content Search */}
                            <div className="mb-4">
                              <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-gray-600">Website Pages</label>
                                <span className="text-xs text-gray-500">
                                  {(contentSelection.manualSelections.websiteContent || []).length} selected
                                </span>
                              </div>
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Search website pages..."
                                  value={websiteSearchTerm}
                                  onChange={(e) => setWebsiteSearchTerm(e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                {isSearchingWebsite && (
                                  <div className="absolute right-3 top-2.5">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                  </div>
                                )}
                              </div>
                              
                              {/* Selected Website Content */}
                              {(contentSelection.manualSelections.websiteContent || []).length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {(contentSelection.manualSelections.websiteContent || []).map((page) => (
                                    <div key={page.url} className="flex items-center bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-xs">
                                      <span className="truncate max-w-32">{page.title}</span>
                                      {page.pageType && (
                                        <span className="ml-1 bg-blue-200 px-1 rounded text-xxs uppercase">
                                          {page.pageType}
                                        </span>
                                      )}
                                      <button
                                        onClick={() => toggleWebsiteContentSelection(page)}
                                        className="ml-1 hover:text-blue-600"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {/* Website Content Search Results */}
                              {websiteSearchTerm && websiteSearchResults.length > 0 && (
                                <div className="mt-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md">
                                  {websiteSearchResults.map((page) => (
                                    <div
                                      key={page.url}
                                      className="p-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                                      onClick={() => toggleWebsiteContentSelection(page)}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-gray-900">{page.title}</p>
                                            {page.pageType && (
                                              <span className="bg-gray-200 text-gray-600 px-1 py-0.5 rounded text-xxs uppercase">
                                                {page.pageType}
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-xs text-gray-500 truncate">{page.description || page.url}</p>
                                        </div>
                                        {(contentSelection.manualSelections.websiteContent || []).some(p => p.url === page.url) && (
                                          <Check size={16} className="text-green-600" />
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            <p className="text-xs text-gray-500 mt-2">
                              All relevant website pages (products, services, support, etc.)
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : null}

            {/* Article Keywords - Bulk Generation */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-1">
                  <label className={`block text-sm font-medium ${!keywords[0]?.trim() && touchedFields.keyword ? 'text-red-600' : 'text-gray-700'}`}>
                    Article Keywords
                    <span className="ml-1 text-red-600">*</span>
                  </label>
                  <div className="relative group">
                    <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                      Enter keywords for articles you want to generate. You can add up to 10 keywords for bulk generation.
                    </div>
                  </div>
                </div>
                
                {/* Sparkle icon for AI suggestions */}
                {keywords[0]?.trim() && keywords.filter(k => k.trim().length > 0).length >= 1 && keywords.some(k => !k.trim()) && (
                  <button
                    onClick={generateKeywordSuggestions}
                    disabled={isLoadingSuggestions}
                    className="flex items-center space-x-1 px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full hover:bg-purple-200 transition-colors"
                    title="Generate keyword suggestions"
                  >
                    <Sparkles size={12} className={isLoadingSuggestions ? 'animate-spin' : ''} />
                    <span>{isLoadingSuggestions ? 'Generating...' : 'AI Suggest'}</span>
                  </button>
                )}
              </div>

              {/* Keyword input fields */}
              <div className="space-y-2">
                {keywords.map((keyword, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={keyword}
                        onChange={(e) => updateKeyword(index, e.target.value)}
                        onFocus={() => index === 0 && markFieldAsTouched('keyword')}
                        onBlur={() => index === 0 && markFieldAsTouched('keyword')}
                        className={`block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                          index === 0 && !keyword.trim() && touchedFields.keyword ? 'border-red-300' : 'border-gray-300'
                        }`}
                        placeholder={index === 0 ? "Enter your main keyword (required)" : `Keyword ${index + 1} (optional)`}
                      />
                    </div>
                    
                    {/* Remove button (only show for additional fields) */}
                    {index > 0 && (
                      <button
                        onClick={() => removeKeywordField(index)}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove keyword"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add keyword button */}
              {keywords.length < 10 && (
                <button
                  onClick={addKeywordField}
                  className="mt-2 flex items-center space-x-1 text-sm text-gray-500 hover:text-blue-600 transition-colors"
                >
                  <Plus size={16} className="opacity-60" />
                  <span>Add another keyword</span>
                </button>
              )}

              {/* Error message for required first keyword */}
              {!keywords[0]?.trim() && touchedFields.keyword && (
                <p className="mt-1 text-sm text-red-600">
                  At least one keyword is required
                </p>
              )}

              {/* Info about bulk generation */}
              {keywords.filter(k => k.trim().length > 0).length > 1 && (
                <p className="mt-1 text-sm text-blue-600">
                  Bulk generation: {keywords.filter(k => k.trim().length > 0).length} articles will be generated
                </p>
              )}
            </div>

            {/* Instructions - Optional */}
            <div>
              <div className="flex items-center space-x-1">
                <label htmlFor="instructions" className="block text-sm font-medium text-gray-700">
                  Instructions
                  <span className="ml-1 text-gray-400">(Optional)</span>
                </label>
                <div className="relative group">
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                    Enter what we should be aware about when writing your content. For example, you may want us to avoid making political claims, or you may want to include something specific for us to focus on.
                  </div>
                </div>
              </div>
              <textarea
                id="instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Enter any specific instructions..."
              />
            </div>

            {/* Tone of Voice - Optional */}
            <div>
              <div className="flex items-center space-x-1">
                <label htmlFor="toneOfVoice" className="block text-sm font-medium text-gray-700">
                  Tone of Voice
                  <span className="ml-1 text-gray-400">(Optional)</span>
                </label>
                <div className="relative group">
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                    Input the tone of voice we should write your content in.
                  </div>
                </div>
              </div>
              <input
                type="text"
                id="toneOfVoice"
                value={toneOfVoice}
                onChange={(e) => setToneOfVoice(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="e.g., Professional, Casual, Friendly..."
              />
            </div>

            {/* Content Type - Required */}
            <div>
              <div className="flex items-center space-x-1">
                <label htmlFor="contentType" className={`block text-sm font-medium ${!contentType && touchedFields.contentType ? 'text-red-600' : 'text-gray-700'}`}>
                  Content Type
                  <span className="ml-1 text-red-600">*</span>
                </label>
                <div className="relative group">
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                    Select the type of content you would like us to write your article in.
                  </div>
                </div>
              </div>
              <select
                id="contentType"
                value={contentType}
                onChange={(e) => setContentType(e.target.value)}
                onFocus={() => markFieldAsTouched('contentType')}
                onBlur={() => markFieldAsTouched('contentType')}
                className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                  !contentType && touchedFields.contentType ? 'border-red-300' : 'border-gray-300'
                }`}
              >
                <option value="">Select a content type...</option>
                <option value="default">Default Article</option>
                <option value="informational">Informational</option>
                <option value="product-reviews">Product Reviews</option>
                <option value="listicle">Listicle</option>
                <option value="history">History Of</option>
                <option value="pros-cons">Pros and Cons</option>
                <option value="comparisons">Comparisons</option>
                <option value="how-to">How To&apos;s</option>
                <option value="versus">Versus (Brand A Vs. Brand B)</option>
              </select>
              {!contentType && touchedFields.contentType && (
                <p className="mt-1 text-sm text-red-600">
                  Content type is required
                </p>
              )}
            </div>

            <button
              onClick={handleBulkGenerate}
              disabled={isGenerating || !keywords[0]?.trim() || !selectedBrandId || !contentType}
              className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                ${
                  isGenerating || !keywords[0]?.trim() || !selectedBrandId || !contentType
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }`}
            >
              {isGenerating 
                ? 'Generating...' 
                : !selectedBrandId 
                ? 'Select a Brand Profile First'
                : !keywords[0]?.trim()
                ? 'Enter Article Keywords'
                : !contentType
                ? 'Select Content Type'
                : (() => {
                    const validKeywords = keywords.filter(k => k.trim().length > 0).length;
                    return `Generate ${validKeywords} Article${validKeywords !== 1 ? 's' : ''}`;
                  })()}
            </button>
            
            {((!selectedBrandId && touchedFields.brandProfile) || (!keywords[0]?.trim() && touchedFields.keyword) || (!contentType && touchedFields.contentType)) && (
              <p className="text-sm text-red-600 text-center">
                {!selectedBrandId && touchedFields.brandProfile
                  ? 'A brand profile is required'
                  : !keywords[0]?.trim() && touchedFields.keyword
                  ? 'At least one keyword is required'
                  : !contentType && touchedFields.contentType
                  ? 'Content type is required'
                  : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Bulk Generation Results */}
      <div className="w-full md:w-1/2 p-4 md:p-6 bg-white flex flex-col h-full">
        <div className="w-full flex flex-col h-full">
          {isGenerating ? (
            <div className="flex flex-col space-y-6">
              {/* Generation Progress */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-900 mb-3">Bulk Generation Progress</h3>
                <div className="space-y-2">
                  {keywords.filter(k => k.trim().length > 0).map((keyword, index) => {
                    const status = bulkGenerationStatus[index] || 'pending';
                    return (
                      <div key={index} className="flex items-center space-x-3">
                        <div className={`w-4 h-4 rounded-full ${
                          status === 'completed' ? 'bg-green-500' :
                          status === 'generating' ? 'bg-blue-500 animate-pulse' :
                          status === 'error' ? 'bg-red-500' :
                          'bg-gray-300'
                        }`} />
                        <span className="text-sm font-medium truncate">{keyword}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          status === 'completed' ? 'bg-green-100 text-green-700' :
                          status === 'generating' ? 'bg-blue-100 text-blue-700' :
                          status === 'error' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {status === 'completed' ? '✓ Complete' :
                           status === 'generating' ? '🔄 Generating...' :
                           status === 'error' ? '✗ Error' :
                           '⏳ Pending'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Overall Progress Message */}
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-lg font-medium text-gray-700 mb-2">
                  Generating {keywords.filter(k => k.trim().length > 0).length} articles...
                </p>
                <p className="text-sm text-gray-500 max-w-md mx-auto">
                  Please wait while we craft high-quality, SEO-optimized content for each keyword. This may take a few minutes.
                </p>
              </div>
            </div>
          ) : generatedArticles.length > 0 ? (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">
                  Generated Articles ({generatedArticles.length})
                </h3>
                <button
                  onClick={async () => {
                    setShowShopifyModal(true);
                    if (selectedBrandId) {
                      await fetchShopifyBlogs(selectedBrandId);
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                >
                  📤 Push to Shopify
                </button>
              </div>
              
              {/* Articles Grid - Scrollable */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-y-auto pr-2">
                {generatedArticles.map((article, index) => (
                  <div
                    key={article.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-all duration-200 ${
                      expandedArticle === index
                        ? 'border-blue-500 bg-blue-50 lg:col-span-2'
                        : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                    }`}
                    onClick={() => setExpandedArticle(expandedArticle === index ? null : index)}
                  >
                    {expandedArticle === index ? (
                      /* Expanded Article View */
                      <div className="h-full flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-semibold truncate">{article.title}</h4>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewMode(viewMode === 'preview' ? 'raw' : 'preview');
                              }}
                              className={`px-3 py-1 text-xs font-medium rounded ${
                                viewMode === 'preview'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-200 text-gray-700'
                              }`}
                            >
                              {viewMode === 'preview' ? 'Preview' : 'HTML'}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownloadHTML(article);
                              }}
                              className="p-1 text-gray-600 hover:text-blue-600"
                              title="Download"
                            >
                              <Download size={16} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyHTML(article);
                              }}
                              className="p-1 text-gray-600 hover:text-blue-600"
                              title="Copy HTML"
                            >
                              <Copy size={16} />
                            </button>
                          </div>
                        </div>
                        
                        <div className="bg-white rounded p-3 flex-1 overflow-auto max-h-96">
                          {viewMode === 'preview' ? (
                            <div
                              className="prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ 
                                __html: article.content.replace(
                                  /<img[^>]*>/g, 
                                  (match) => {
                                    // Remove problematic images or add error handling
                                    if (match.includes('plato-hospitality-robot') || match.includes('robot.jpg')) {
                                      return ''; // Remove problematic images
                                    }
                                    return match.replace(/>$/, ' onerror="this.style.display=\'none\'" style="max-width: 100%; height: auto;">')
                                  }
                                )
                              }}
                            />
                          ) : (
                            <pre className="whitespace-pre-wrap break-words text-xs text-gray-800">
                              {article.content}
                            </pre>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Compact Article Card */
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                          {article.title}
                        </h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Created {article.createdAt instanceof Date ? article.createdAt.toLocaleDateString() : article.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                            ✓ Generated
                          </span>
                          <span className="text-xs text-blue-600 font-medium">
                            Click to expand
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-12">
              <div className="mb-4">
                <svg className="w-16 h-16 mx-auto text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
                             <h3 className="text-lg font-medium text-gray-900 mb-2">Ready for Article Generation</h3>
               <p className="text-gray-600">
                 Generate one or more articles at a time. Generated article(s) will appear here.
               </p>
            </div>
          )}
        </div>
      </div>

      {/* Shopify Push Modal */}
      {showShopifyModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Push Articles to Shopify</h2>
              <button
                onClick={() => {
                  setShowShopifyModal(false);
                  setSelectedArticleIds([]);
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
              {/* Shopify Connection Status */}
              {(() => {
                const selectedBrand = brandProfiles.find(profile => profile.id === selectedBrandId);
                const hasShopifyCredentials = selectedBrand?.shopifyStoreUrl && selectedBrand?.shopifyAccessToken;
                
                if (!selectedBrand) {
                  return (
                    <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800">No Brand Profile Selected</h3>
                          <p className="text-sm text-red-700 mt-1">
                            Please select a brand profile first to push articles to Shopify.
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                if (!hasShopifyCredentials) {
                  return (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-4">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-yellow-800">Shopify Credentials Missing</h3>
                          <p className="text-sm text-yellow-700 mt-1">
                            Your brand profile &quot;{selectedBrand.brandName}&quot; needs Shopify store URL and access token to push articles. 
                            Please update your brand profile in the settings.
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-green-800">Ready to Push</h3>
                        <p className="text-sm text-green-700 mt-1">
                          Connected to &quot;{selectedBrand.brandName}&quot; Shopify store. Articles will be pushed as draft blog posts.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                  {selectedArticleIds.length === generatedArticles.length ? 'Deselect All' : 'Select All'}
                </button>
                <span className="text-sm text-gray-500">
                  {selectedArticleIds.length} of {generatedArticles.length} selected
                </span>
              </div>
            </div>

            {/* Articles List */}
            <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
              {generatedArticles.map((article) => (
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
                      <div className="flex items-start justify-between">
                        <h4 className={`text-sm font-medium mb-1 ${
                          selectedArticleIds.includes(article.id)
                            ? 'text-green-900'
                            : 'text-gray-900'
                        }`}>
                          {article.title}
                        </h4>
                        {selectedArticleIds.includes(article.id) && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
                            Ready to Push
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Created {article.createdAt instanceof Date ? article.createdAt.toLocaleDateString() : article.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                      </p>
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
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowShopifyModal(false);
                  setSelectedArticleIds([]);
                  // Reset author and blog states
                  setArticleAuthor('');
                  setSelectedBlogId('');
                  setShopifyBlogs([]);
                  setIsLoadingBlogs(false);
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

      {/* Generation Issue Modal */}
      {showGenerationIssueModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center">
                    <span className="text-yellow-600 font-bold text-sm">⚠️</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Article Generation Issue Detected</h3>
                </div>
                <button
                  onClick={() => setShowGenerationIssueModal({ show: false, keyword: '', articleContent: '' })}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>
            </div>
            
            <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
              <div className="mb-4">
                <h4 className="font-medium text-gray-900 mb-2">Article: &quot;{showGenerationIssueModal.keyword}&quot;</h4>
                <p className="text-sm text-gray-600 mb-4">
                  We detected a potential issue with your article generation. This could include incomplete content, 
                  errors, or other problems. Please review the article and contact support if needed.
                </p>
                
                <h5 className="font-medium text-gray-900 mb-2">How to Get Help:</h5>
                <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1 mb-4">
                  <li>Take a screenshot of this message and the generated article</li>
                  <li>Email it to: <span className="font-mono bg-yellow-100 px-1 rounded">enhancemyseoplz@gmail.com</span></li>
                  <li>Include your account email in the message</li>
                  <li>We&apos;ll investigate and refund your token within 24 hours</li>
                </ol>
              </div>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <h5 className="font-medium text-yellow-800 mb-2">🎯 To receive a token refund:</h5>
                <ol className="text-sm text-yellow-700 space-y-1 ml-4 list-decimal">
                  <li>Take a screenshot of the generated article</li>
                  <li>Email it to: <span className="font-mono bg-yellow-100 px-1 rounded">enhancemyseoplz@gmail.com</span></li>
                  <li>Include your account email in the message</li>
                  <li>We&apos;ll investigate and refund your token within 24 hours</li>
                </ol>
              </div>
              
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h5 className="font-medium text-gray-800 mb-2">Generated Article Preview:</h5>
                <div 
                  className="text-xs text-gray-600 max-h-40 overflow-y-auto bg-white p-3 rounded border"
                  dangerouslySetInnerHTML={{ __html: showGenerationIssueModal.articleContent.slice(0, 1000) + (showGenerationIssueModal.articleContent.length > 1000 ? '...' : '') }}
                />
              </div>
            </div>
            
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
              <div className="text-xs text-gray-500">
                No tokens were charged for this generation
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowGenerationIssueModal({ show: false, keyword: '', articleContent: '' })}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    // Copy email for easy access
                    navigator.clipboard.writeText('enhancemyseoplz@gmail.com');
                    toast.success('Email address copied to clipboard!');
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                >
                  Copy Email Address
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 