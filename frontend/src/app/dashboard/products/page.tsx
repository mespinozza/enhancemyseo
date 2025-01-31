'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations } from '@/lib/firebase/firestore';
import type { BrandProfile } from '@/lib/firebase/firestore';
import { ClipboardList, Store } from 'lucide-react';

interface OptimizationHistory {
  id: string;
  productName: string;
  timestamp: Date;
  before: {
    title: string;
    description: string;
    tags: string[];
    metaDescription: string;
  };
  after: {
    title: string;
    description: string;
    tags: string[];
    metaDescription: string;
  };
}

export default function ProductsPage() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [brandProfile, setBrandProfile] = useState<BrandProfile | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [optimizationHistory, setOptimizationHistory] = useState<OptimizationHistory[]>([]);

  // Load brand profiles on component mount
  useEffect(() => {
    async function loadBrandProfiles() {
      if (!user) return;
      try {
        const profiles = await brandProfileOperations.getBrandProfiles(user.uid);
        setBrandProfiles(profiles);
      } catch (error) {
        console.error('Error loading brand profiles:', error);
      }
    }
    loadBrandProfiles();
  }, [user]);

  const handleOptimize = async () => {
    if (!selectedBrandId) return;
    // Add optimization logic here
  };

  return (
    <div className="p-8 h-full">
      <h1 className="text-2xl font-bold mb-6">Optimize Products</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[calc(100vh-10rem)]">
        {/* Left Column - Brand Selection and Optimization Controls */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Select Brand Profile <span className="text-red-500">*</span></h2>
              <button
                onClick={() => {/* Add navigation to brand profile creation */}}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium inline-flex items-center"
              >
                + Add New Brand
              </button>
            </div>
            
            {brandProfiles.length > 0 ? (
              <div className="space-y-4">
                <select
                  value={selectedBrandId}
                  onChange={(e) => setSelectedBrandId(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Select a brand profile</option>
                  {brandProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.brandName}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="text-center border border-dashed border-gray-300 rounded-lg p-6">
                <p className="text-gray-500 mb-4">No brand profiles yet</p>
                <button
                  onClick={() => {/* Add navigation to brand profile creation */}}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Create your first brand profile
                </button>
                <p className="text-sm text-red-500 mt-4">
                  Please select or create a brand profile before generating content
                </p>
              </div>
            )}
          </div>

          <button
            onClick={handleOptimize}
            disabled={!selectedBrandId}
            className="w-full bg-blue-600 text-white px-4 py-3 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg font-medium shadow-sm"
          >
            Optimize Now
          </button>
        </div>

        {/* Right Column - Optimization History */}
        <div className="bg-white rounded-lg shadow-sm p-6 flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Optimization History</h2>
            <span className="text-sm text-gray-500">
              {optimizationHistory.length} products optimized
            </span>
          </div>

          {optimizationHistory.length > 0 ? (
            <div className="space-y-6 flex-1 overflow-y-auto">
              {optimizationHistory.map((item) => (
                <div key={item.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium">{item.productName}</h3>
                    <span className="text-sm text-gray-500">
                      {item.timestamp.toLocaleDateString()}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Before</h4>
                      <div className="space-y-2 text-sm">
                        <p><span className="font-medium">Title:</span> {item.before.title}</p>
                        <p><span className="font-medium">Description:</span> {item.before.description}</p>
                        <p><span className="font-medium">Tags:</span> {item.before.tags.join(', ')}</p>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">After</h4>
                      <div className="space-y-2 text-sm">
                        <p><span className="font-medium">Title:</span> {item.after.title}</p>
                        <p><span className="font-medium">Description:</span> {item.after.description}</p>
                        <p><span className="font-medium">Tags:</span> {item.after.tags.join(', ')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  Select a brand profile to start optimizing your products
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 