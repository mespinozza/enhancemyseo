'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useUsageRefresh } from '@/lib/usage-refresh-context';
import { useRouter } from 'next/navigation';
import { brandProfileOperations, BrandProfile } from '@/lib/firebase/firestore';
import BrandProfileForm from '@/components/brand/BrandProfileForm';
import UsageTracker from '@/components/usage/UsageTracker';
import { getUserUsage, canPerformAction } from '@/lib/usage-limits';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import toast from 'react-hot-toast';

interface Keyword {
  keyword: string;
  relevance: string;
  searchVolume?: string;
  difficulty?: string;
}

export default function KeywordsPage() {
  const { user, subscription_status, loading } = useAuth();
  const { refreshUsage } = useUsageRefresh();
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [baseKeyword, setBaseKeyword] = useState('');
  const [generatedKeywords, setGeneratedKeywords] = useState<Keyword[]>([]);
  const [currentKeywordIndex, setCurrentKeywordIndex] = useState(0);

  // Access control - only admin users can access this page
  useEffect(() => {
    if (!loading && user && subscription_status !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, subscription_status, loading, router]);

  const loadBrandProfiles = useCallback(async () => {
    if (!user) return;
    setIsLoadingProfiles(true);
    try {
      const profiles = await brandProfileOperations.getAll(user.uid);
      setBrandProfiles(profiles);
      
      // Auto-select first profile if only one exists
      if (profiles.length === 1) {
        setSelectedBrandId(profiles[0].id || '');
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

  const handleGenerateKeywords = async () => {
    if (!selectedBrandId || !baseKeyword || !user) return;

    // Check usage limits before generating
    try {
      const currentUsage = await getUserUsage(user.uid);
      const { canPerform, reason } = await canPerformAction(user.uid, subscription_status, 'keywords', currentUsage);
      
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
    try {
      // Get the selected brand profile
      const selectedProfile = brandProfiles.find(profile => profile.id === selectedBrandId);
      if (!selectedProfile) {
        throw new Error('Selected brand profile not found');
      }

      // Call the keyword generation API
      const response = await fetch('/api/generate-keywords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          baseKeyword,
          brandName: selectedProfile.brandName,
          businessType: selectedProfile.businessType,
          brandGuidelines: selectedProfile.brandGuidelines || '',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate keywords');
      }

      const data = await response.json();
      
      setGeneratedKeywords(data.keywords);
      setCurrentKeywordIndex(0);
      
      toast.success('Keywords generated successfully!');
      
      // CRITICAL: Refresh usage display after successful generation
      console.log('Refreshing keywords usage display after successful generation...');
      await refreshUsage('keywords');
      console.log('Keywords usage display refreshed');
      
    } catch (error) {
      console.error('Failed to generate keywords:', error);
      toast.error('Failed to generate keywords. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrevious = () => {
    setCurrentKeywordIndex(prev => Math.max(0, prev - 1));
  };

  const handleNext = () => {
    setCurrentKeywordIndex(prev => Math.min(generatedKeywords.length - 1, prev + 1));
  };

  const handleSendToArticle = () => {
    if (generatedKeywords[currentKeywordIndex]) {
      // Store the selected keyword in localStorage or state management
      localStorage.setItem('selectedKeyword', generatedKeywords[currentKeywordIndex].keyword);
      router.push('/dashboard'); // Navigate to article generation page
    }
  };

  const handleBrandSave = async () => {
    await loadBrandProfiles();
    setShowBrandForm(false);
  };

  // Show loading while checking subscription status
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Only admin users can access this page
  if (subscription_status !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-gray-600 mb-4">Access Restricted</div>
          <div className="text-sm text-gray-500">This feature is only available to administrators.</div>
        </div>
      </div>
    );
  }

  const currentKeyword = generatedKeywords[currentKeywordIndex];

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

      {/* Left Panel - Keyword Generation Form */}
      <div className="w-full md:w-1/2 p-4 md:p-6 border-r border-gray-200 overflow-y-auto h-full flex-shrink-0">
        <div className="max-w-xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Keyword Research & Analysis</h1>
          <p className="text-gray-600 mb-8">
            Generate high-performing keywords for your content. Our AI analyzes your topic and suggests 
            SEO-optimized keywords with search volumes and competition metrics.
          </p>
          {subscription_status === 'admin' && (
            <div className="mb-6">
              <span className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded-full">
                Admin Feature
              </span>
            </div>
          )}

          {/* Usage Tracker */}
          <UsageTracker tool="keywords" className="mb-6" />

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

          {/* Keyword Details */}
          <div className="space-y-6">
            {/* Base Keyword - Required */}
            <div>
              <div className="flex items-center space-x-1">
                <label htmlFor="baseKeyword" className={`block text-sm font-medium ${!baseKeyword ? 'text-red-600' : 'text-gray-700'}`}>
                  Base Keyword
                  <span className="ml-1 text-red-600">*</span>
                </label>
                <div className="relative group">
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                    Enter a keyword to build upon. We&apos;ll generate related keywords and variations.
                  </div>
                </div>
              </div>
              <input
                type="text"
                id="baseKeyword"
                value={baseKeyword}
                onChange={(e) => setBaseKeyword(e.target.value)}
                className={`mt-1 block w-full rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
                  !baseKeyword ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter a keyword to build upon..."
              />
              {!baseKeyword && (
                <p className="mt-1 text-sm text-red-600">
                  Base keyword is required
                </p>
              )}
            </div>

            <button
              onClick={handleGenerateKeywords}
              disabled={isGenerating || !baseKeyword || !selectedBrandId}
              className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                ${
                  isGenerating || !baseKeyword || !selectedBrandId
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }`}
            >
              {isGenerating 
                ? 'Generating...' 
                : !selectedBrandId 
                ? 'Select a Brand Profile First'
                : !baseKeyword
                ? 'Enter Base Keyword'
                : 'Generate Keywords'}
            </button>
            
            {(!selectedBrandId || !baseKeyword) && (
              <p className="text-sm text-red-600 text-center">
                {!selectedBrandId 
                  ? 'A brand profile is required'
                  : 'Base keyword is required'}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Keywords Preview */}
      <div className="w-full md:w-1/2 p-4 md:p-6 bg-white overflow-hidden flex flex-col h-full">
        <div className="max-w-2xl mx-auto w-full flex flex-col h-full">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
              <div className="text-center">
                <p className="text-lg font-medium text-gray-700 mb-2">Generating keywords...</p>
                <p className="text-sm text-gray-500 max-w-md">
                  Please give the tool 2-5 minutes to generate your keywords. We&apos;re analyzing search data and creating relevant keyword suggestions for your brand.
                </p>
              </div>
            </div>
          ) : generatedKeywords.length > 0 ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Generated Keywords</h2>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handlePrevious}
                    disabled={currentKeywordIndex === 0}
                    className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm text-gray-500">
                    {currentKeywordIndex + 1} of {generatedKeywords.length}
                  </span>
                  <button
                    onClick={handleNext}
                    disabled={currentKeywordIndex === generatedKeywords.length - 1}
                    className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {currentKeyword && (
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-4">{currentKeyword.keyword}</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">Relevance</h4>
                      <p className="text-gray-700">{currentKeyword.relevance}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-1">Search Volume</h4>
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          currentKeyword.searchVolume === 'High' ? 'bg-green-100 text-green-800' :
                          currentKeyword.searchVolume === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {currentKeyword.searchVolume}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-1">Difficulty</h4>
                        <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          currentKeyword.difficulty === 'Easy' ? 'bg-green-100 text-green-800' :
                          currentKeyword.difficulty === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {currentKeyword.difficulty}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSendToArticle}
                    className="mt-6 w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Use for Article
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-12">
              Generate keywords to see the preview here
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 