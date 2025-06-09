'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { brandProfileOperations, BrandProfile } from '@/lib/firebase/firestore';
import { blogOperations, Blog } from '@/lib/firebase/firestore';
import BrandProfileForm from '@/components/brand/BrandProfileForm';
import { toast } from 'react-hot-toast';
import { Download, Copy, Eye, Code, Info, ShoppingBag, Wrench } from 'lucide-react';

interface BlogPost {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  status: 'draft' | 'published';
}

export default function ArticlesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [keyword, setKeyword] = useState('');
  const [instructions, setInstructions] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [contentType, setContentType] = useState('');
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>('preview');
  const [articleMode, setArticleMode] = useState<'store' | 'service' | null>(null);

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

  const handleGenerateBlog = async () => {
    if (!selectedBrandId || !keyword || !contentType || !user) {
      return;
    }

    setIsGenerating(true);
    try {
      // Get the selected brand profile
      const selectedProfile = brandProfiles.find(profile => profile.id === selectedBrandId);
      if (!selectedProfile) {
        throw new Error('Selected brand profile not found');
      }

      // Create the blog post in draft status
      const blogData: Omit<Blog, 'id' | 'createdAt' | 'updatedAt'> = {
        title: `${keyword} - ${contentType}`,
        content: '',
        userId: user.uid,
        brandId: selectedBrandId,
        status: 'draft',
        keyword,
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

      // Call your article generation API endpoint
      const response = await fetch('/api/generate-article', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          blogId: blog.id,
          keyword,
          brandName: selectedProfile.brandName,
          businessType: selectedProfile.businessType,
          contentType,
          toneOfVoice,
          instructions,
          brandGuidelines: selectedProfile.brandGuidelines || '',
          articleMode,
          shopifyStoreUrl: selectedProfile.shopifyStoreUrl,
          shopifyAccessToken: selectedProfile.shopifyAccessToken,
          brandColor: selectedProfile.brandColor || '#000000',
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error('Article generation API responded with error:', response.status, responseText);
        let errorDetail = 'Failed to generate article. Status: ' + response.status;
        try {
          const errorData = JSON.parse(responseText);
          errorDetail = errorData.error || errorDetail;
        } catch (e) {
          // If responseText is not JSON or doesn't have an .error property, use the raw text if it's short
          if (responseText.length < 100) { // Avoid overly long toast messages
            errorDetail = responseText || errorDetail;
          }
        }
        throw new Error(errorDetail);
      }

      const generatedContent = await response.json();

      // Update the blog post with the generated content
      if (blog.id) {
        await blogOperations.update(blog.id, {
          content: generatedContent.content || '',
          title: generatedContent.title || blogData.title,
        });

        // Select the newly created post
        setSelectedPost({
          id: blog.id,
          title: generatedContent.title || blogData.title,
          content: generatedContent.content || '',
          createdAt: new Date(),
          status: 'draft'
        });
      }

    } catch (error) {
      console.error('Failed to generate blog:', error);
      toast.error(`Article generation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Check if there's a keyword from the keywords page
  useEffect(() => {
    const savedKeyword = localStorage.getItem('selectedKeyword');
    if (savedKeyword) {
      setKeyword(savedKeyword);
      localStorage.removeItem('selectedKeyword'); // Clear it after using
    }
  }, []);

  const handleBrandSave = async (profile: BrandProfile) => {
    await loadBrandProfiles();
    setShowBrandForm(false);
  };

  const handleDownloadHTML = () => {
    if (!selectedPost) return;

    const blob = new Blob([selectedPost.content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedPost.title} - generated by enhancemyseo.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('Article content downloaded successfully!');
  };

  const handleCopyHTML = async () => {
    if (!selectedPost) return;
    
    try {
      await navigator.clipboard.writeText(selectedPost.content);
      toast.success('Article HTML copied to clipboard!');
    } catch (error) {
      toast.error('Failed to copy HTML to clipboard');
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
                    onClick={() => setSelectedBrandId(profile.id || '')}
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
                  Please select a brand profile before generating content
                </div>
              )}
            </div>
          </div>

          {/* Article Details */}
          <div className="space-y-6">
            {/* Article Keyword - Required */}
            <div>
              <div className="flex items-center space-x-1">
                <label htmlFor="keyword" className={`block text-sm font-medium ${!keyword ? 'text-red-600' : 'text-gray-700'}`}>
                  Article Keyword
                  <span className="ml-1 text-red-600">*</span>
                </label>
                <div className="relative group">
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                    Enter the main keyword you would like us to focus on when creating your content. We recommend 1-5 keywords in a string or with commas.
                  </div>
                </div>
              </div>
              <input
                type="text"
                id="keyword"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                  !keyword ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter your main keyword focus"
              />
              {!keyword && (
                <p className="mt-1 text-sm text-red-600">
                  Article keyword is required
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
                <label htmlFor="contentType" className={`block text-sm font-medium ${!contentType ? 'text-red-600' : 'text-gray-700'}`}>
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
                className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                  !contentType ? 'border-red-300' : 'border-gray-300'
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
              {!contentType && (
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
              onClick={handleGenerateBlog}
              disabled={isGenerating || !keyword || !selectedBrandId || !contentType}
              className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                ${
                  isGenerating || !keyword || !selectedBrandId || !contentType
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }`}
            >
              {isGenerating 
                ? 'Generating...' 
                : !selectedBrandId 
                ? 'Select a Brand Profile First'
                : !keyword
                ? 'Enter Article Keyword'
                : !contentType
                ? 'Select Content Type'
                : 'Generate Article'}
            </button>
            
            {(!selectedBrandId || !keyword || !contentType) && (
              <p className="text-sm text-red-600 text-center">
                {!selectedBrandId 
                  ? 'A brand profile is required'
                  : !keyword
                  ? 'Article keyword is required'
                  : 'Content type is required'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Article Preview */}
      <div className="w-full md:w-1/2 p-4 md:p-6 bg-white overflow-hidden flex flex-col h-full">
        <div className="max-w-2xl mx-auto w-full flex flex-col h-full">
          {isGenerating ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : selectedPost ? (
            <>
              {/* Article Title */}
              <h1 className="text-2xl font-bold mb-4 break-words">{selectedPost.title}</h1>

              {/* Button Row */}
              <div className="flex items-center mb-4">
                <button
                  onClick={() => setViewMode(viewMode === 'preview' ? 'raw' : 'preview')}
                  className={`px-4 py-2 font-semibold rounded-l-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors duration-300 flex items-center space-x-2 ${
                    viewMode === 'preview'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-black hover:bg-blue-50'
                  }`}
                  style={{ minWidth: 120 }}
                >
                  {viewMode === 'preview' ? <Eye size={18} className="mr-2" /> : <Code size={18} className="mr-2" />}
                  <span>Preview</span>
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleDownloadHTML}
                  className="px-3 py-2 text-black font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-100 ml-2"
                >
                  Download
                </button>
                <button
                  onClick={handleCopyHTML}
                  className="px-3 py-2 text-black font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-100 ml-2"
                >
                  Copy HTML
                </button>
              </div>

              {/* Content Area */}
              <div className="bg-gray-100 rounded-lg p-4 flex-1 min-h-[300px] max-h-full overflow-auto">
                {viewMode === 'preview' ? (
                  <div
                    className="prose prose-lg max-w-none"
                    dangerouslySetInnerHTML={{ __html: selectedPost.content }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap break-words text-sm text-black">
                    {selectedPost.content}
                  </pre>
                )}
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500 py-12">
              Generate an article to see the preview here
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 