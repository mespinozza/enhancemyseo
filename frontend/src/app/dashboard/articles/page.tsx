'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useUsageRefresh } from '@/lib/usage-refresh-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { brandProfileOperations, BrandProfile } from '@/lib/firebase/firestore';
import { blogOperations, Blog } from '@/lib/firebase/firestore';
import BrandProfileForm from '@/components/brand/BrandProfileForm';
import UsageTracker from '@/components/usage/UsageTracker';
import { getUserUsage, canPerformAction, incrementUsage } from '@/lib/usage-limits';
import { toast } from 'react-hot-toast';
import { Download, Copy, Eye, Code, Info, ShoppingBag, Wrench, Plus, Sparkles, X, Check } from 'lucide-react';

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
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  
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
  const [articleMode, setArticleMode] = useState<'store' | 'service' | null>(null);
  
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

  useEffect(() => {
    if (user) {
      loadBrandProfiles();
    }
  }, [user]);

  const loadBrandProfiles = async () => {
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
          const blog = await blogOperations.create(blogData);

          // Generate the content
          const response = await fetch('/api/generate-article', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await user.getIdToken()}`,
            },
            body: JSON.stringify({
              blogId: blog.id,
              keyword: currentKeyword,
              brandName: selectedProfile.brandName,
              businessType: selectedProfile.businessType,
              contentType,
              toneOfVoice,
              instructions,
              brandGuidelines: selectedProfile.brandGuidelines || '',
              articleMode,
              shopifyStoreUrl: selectedProfile.shopifyStoreUrl || '',
              shopifyAccessToken: selectedProfile.shopifyAccessToken || '',
              brandColor: selectedProfile.brandColor || '#000000',
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to generate article');
          }

          const generatedContent = await response.json();

          // Update the blog post with the generated content
          if (blog.id) {
            await blogOperations.update(blog.id, {
              content: generatedContent.content || '',
              title: generatedContent.title || blogData.title,
            });

            // Add to generated articles
            const newArticle: BlogPost = {
              id: blog.id,
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

  const handleBrandSave = async (profile: BrandProfile) => {
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
    } catch (error) {
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
                <option value="how-to">How To's</option>
                <option value="versus">Versus (Brand A Vs. Brand B)</option>
              </select>
              {!contentType && touchedFields.contentType && (
                <p className="mt-1 text-sm text-red-600">
                  Content type is required
                </p>
              )}
            </div>

            <div className="flex gap-4 mb-4">
              <div className="relative group">
                <button
                  type="button"
                  className={`flex items-center px-4 py-2 rounded-md border transition-colors duration-200 font-semibold text-base ${
                    articleMode === 'store'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-blue-50'
                  }`}
                  onClick={() => setArticleMode(articleMode === 'store' ? null : 'store')}
                >
                  <ShoppingBag size={18} className="mr-2" />
                  Store
                  <span className="ml-2">
                    <Info size={16} className="text-gray-400 group-hover:text-blue-600" />
                  </span>
                </button>
                <div className="absolute left-0 mt-2 w-64 bg-white border border-gray-200 rounded shadow-lg p-2 text-xs text-gray-700 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto z-10 transition-opacity duration-200">
                  Select this option if you would like for the article to include products & collections you may have available that align with this article's topic.
                </div>
              </div>
              <div className="relative group">
                <button
                  type="button"
                  className={`flex items-center px-4 py-2 rounded-md border transition-colors duration-200 font-semibold text-base ${
                    articleMode === 'service'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-blue-50'
                  }`}
                  onClick={() => setArticleMode(articleMode === 'service' ? null : 'service')}
                >
                  <Wrench size={18} className="mr-2" />
                  Service
                  <span className="ml-2">
                    <Info size={16} className="text-gray-400 group-hover:text-blue-600" />
                  </span>
                </button>
                <div className="absolute left-0 mt-2 w-64 bg-white border border-gray-200 rounded shadow-lg p-2 text-xs text-gray-700 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto z-10 transition-opacity duration-200">
                  Select this option if you would like for the article to focus on any service pages you may have available that align with this article's topic.
                </div>
              </div>
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
                : `Generate ${keywords.filter(k => k.trim().length > 0).length} Article${keywords.filter(k => k.trim().length > 0).length !== 1 ? 's' : ''}`}
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
                          Created {article.createdAt.toLocaleDateString()}
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
                            Your brand profile "{selectedBrand.brandName}" needs Shopify store URL and access token to push articles. 
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
                          Connected to "{selectedBrand.brandName}" Shopify store. Articles will be pushed as draft blog posts.
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
                        Created {article.createdAt.toLocaleDateString()}
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
    </div>
  );
} 