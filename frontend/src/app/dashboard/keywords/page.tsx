'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useRouter } from 'next/navigation';
import { brandProfileOperations, BrandProfile } from '@/lib/firebase/firestore';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';

interface Keyword {
  keyword: string;
  relevance: string;
  searchVolume?: string;
  difficulty?: string;
}

export default function KeywordsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [baseKeyword, setBaseKeyword] = useState('');
  const [generatedKeywords, setGeneratedKeywords] = useState<Keyword[]>([]);
  const [currentKeywordIndex, setCurrentKeywordIndex] = useState(0);

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

  const handleGenerateKeywords = async () => {
    if (!selectedBrandId || !baseKeyword) return;

    setIsGenerating(true);
    try {
      // This is where you'll integrate with your keyword generation API
      // For now, we'll use dummy data
      const dummyKeywords: Keyword[] = [
        {
          keyword: baseKeyword + " guide",
          relevance: "High relevance due to informational intent",
          searchVolume: "1.2K",
          difficulty: "Medium"
        },
        {
          keyword: "best " + baseKeyword,
          relevance: "High commercial intent, good for product pages",
          searchVolume: "2.5K",
          difficulty: "High"
        },
        // Add more dummy keywords as needed
      ];

      setGeneratedKeywords(dummyKeywords);
      setCurrentKeywordIndex(0);
    } catch (error) {
      console.error('Failed to generate keywords:', error);
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

  const currentKeyword = generatedKeywords[currentKeywordIndex];

  return (
    <div className="flex-1 h-full">
      <div className="flex h-full">
        {/* Left Panel - Keyword Generation Form */}
        <div className="w-1/2 p-6 border-r border-gray-200 overflow-y-auto min-h-full">
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-bold mb-6">Generate Keywords</h2>

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

            {/* Base Keyword Input */}
            <div className="space-y-6">
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
                      Enter a keyword to build upon. We'll generate related keywords and variations.
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
        <div className="w-1/2 p-6 bg-white overflow-y-auto min-h-full">
          <div className="max-w-2xl mx-auto h-full flex items-center justify-center">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-gray-600">Generating keywords...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center w-full max-w-md">
                <div className="flex flex-col items-center justify-center w-full">
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
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Keywords Generated Yet</h3>
                  <p className="text-gray-500 text-center max-w-sm">
                    Select a brand profile and enter a base keyword to get started.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 