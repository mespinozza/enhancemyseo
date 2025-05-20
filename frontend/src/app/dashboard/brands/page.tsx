'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations, BrandProfile } from '@/lib/firebase/firestore';
import BrandProfileForm from '@/components/brand/BrandProfileForm';

export default function BrandsPage() {
  const { user } = useAuth();
  const [brandProfiles, setBrandProfiles] = useState<BrandProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<BrandProfile | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadBrandProfiles();
    }
  }, [user]);

  const loadBrandProfiles = async () => {
    if (!user) return;
    
    try {
      const profiles = await brandProfileOperations.getAll(user.uid);
      setBrandProfiles(profiles);
    } catch (error) {
      console.error('Error loading brand profiles:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (profile: BrandProfile) => {
    await loadBrandProfiles();
    setShowForm(false);
    setSelectedProfile(null);
  };

  const handleDelete = async (profileId: string) => {
    if (!confirm('Are you sure you want to delete this brand profile?')) return;
    
    try {
      await brandProfileOperations.delete(profileId);
      await loadBrandProfiles();
    } catch (error) {
      console.error('Error deleting brand profile:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Brand Profiles</h1>
        <button
          onClick={() => {
            setSelectedProfile(null);
            setShowForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Add Brand Profile
        </button>
      </div>

      {showForm ? (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <BrandProfileForm
            existingProfile={selectedProfile || undefined}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setSelectedProfile(null);
            }}
          />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {brandProfiles.length === 0 ? (
            <div className="col-span-2 text-center py-12 bg-white rounded-lg border-2 border-dashed border-gray-300">
              <p className="text-gray-500">No brand profiles yet. Create one to get started!</p>
            </div>
          ) : (
            brandProfiles.map((profile) => (
              <div
                key={profile.id}
                className="bg-white rounded-lg shadow-sm p-6 border border-gray-200"
              >
                <div className="flex items-center space-x-3 mb-4">
                  <div
                    className="w-8 h-8 rounded-full"
                    style={{ backgroundColor: profile.brandColor }}
                  />
                  <h3 className="text-lg font-medium text-gray-900">
                    {profile.brandName}
                  </h3>
                </div>
                
                <p className="text-sm text-gray-600 mb-4">
                  {profile.businessType}
                </p>

                {profile.shopifyStoreUrl && (
                  <p className="text-sm text-gray-500 mb-4 truncate">
                    {profile.shopifyStoreUrl}
                  </p>
                )}

                <div className="flex justify-end space-x-2">
                  <button
                    onClick={() => {
                      setSelectedProfile(profile);
                      setShowForm(true);
                    }}
                    className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-md"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => profile.id && handleDelete(profile.id)}
                    className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-md"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
} 