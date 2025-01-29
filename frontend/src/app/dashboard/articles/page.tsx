'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { brandProfileOperations, BrandProfile } from '@/lib/firebase/firestore';
import { blogOperations, Blog } from '@/lib/firebase/firestore';

interface BlogPost {
  id: string;
  title: string;
  createdAt: Date;
  status: 'draft' | 'published';
}

export default function ArticlesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [keyword, setKeyword] = useState('');
  const [instructions, setInstructions] = useState('');
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [contentType, setContentType] = useState('');

  useEffect(() => {
    if (user) {
      loadBrandProfiles();
    }
  }, [user]);

  const loadBrandProfiles = async () => {
    if (!user) return;
    try {
      const profiles = await brandProfileOperations.getBrandProfiles(user.uid);
      setBrandProfiles(profiles);
    } catch (error) {
      console.error('Error loading brand profiles:', error);
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

      // Get the current user's ID token
      const idToken = await user.getIdToken();

      // Create the blog post in draft status
      const blogData: Omit<Blog, 'id' | 'createdAt' | 'updatedAt'> = {
        title: `${keyword} - ${contentType}`, // We'll update this with the actual title after generation
        content: '', // Will be populated after generation
        keyword,
        userId: user.uid,
        brandId: selectedBrandId,
        status: 'draft',
        contentType,
        toneOfVoice: toneOfVoice || undefined,
        instructions: instructions || undefined,
        generationSettings: {
          usePerplexity: false,
          articleFraming: contentType,
        }
      };

      // Create the initial blog post
      const blog = await blogOperations.createBlog(blogData);

      // Call your article generation API endpoint
      const response = await fetch('/api/generate-article', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
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
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate article');
      }

      const generatedContent = await response.json();

      // Update the blog post with the generated content
      await blogOperations.updateBlog(blog.id, {
        content: generatedContent.content,
        title: generatedContent.title || blogData.title,
      });

      // Select the newly created post
      setSelectedPost({
        id: blog.id,
        title: generatedContent.title || blogData.title,
        createdAt: new Date(),
        status: 'draft'
      });

    } catch (error) {
      console.error('Failed to generate blog:', error);
      alert('Failed to generate article. Please try again.');
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

  return (
    <div className="flex-1 flex">
      {/* Left Panel - Article Generation Form */}
      <div className="w-1/2 p-6 border-r border-gray-200 overflow-y-auto">
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
              {brandProfiles.map((profile) => (
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
              ))}

              {brandProfiles.length === 0 && (
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
              
              {!selectedBrandId && (
                <div className="text-sm text-red-600 mt-2">
                  Please select or create a brand profile before generating content
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
      <div className="w-1/2 p-6 bg-white overflow-y-auto">
        <div className="max-w-2xl mx-auto h-full flex items-center justify-center">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-600">Generating your article...</p>
            </div>
          ) : selectedPost ? (
            <div className="w-full">
              <h2 className="text-2xl font-bold mb-4">{selectedPost.title}</h2>
              <div className="prose max-w-none">
                {/* Article content will be displayed here */}
                <p className="text-gray-600">Article content will be shown here...</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <svg
                className="w-24 h-24 text-gray-300 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Article Generated Yet</h3>
              <p className="text-gray-500">
                Select a brand profile and fill in the article details to generate an SEO-optimized article.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 