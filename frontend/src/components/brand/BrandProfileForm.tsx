import { useState } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations, BrandProfile } from '@/lib/firebase/firestore';

interface BrandProfileFormProps {
  existingProfile?: BrandProfile;
  onSave?: (profile: BrandProfile) => void;
  onCancel?: () => void;
}

export default function BrandProfileForm({ existingProfile, onSave, onCancel }: BrandProfileFormProps) {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    brandName: existingProfile?.brandName || '',
    businessType: existingProfile?.businessType || '',
    brandColor: existingProfile?.brandColor || '#000000',
    websiteUrl: existingProfile?.websiteUrl || '',
    shopifyStoreUrl: existingProfile?.shopifyStoreUrl || '',
    shopifyAccessToken: existingProfile?.shopifyAccessToken || '',
    shopifyApiKey: existingProfile?.shopifyApiKey || '',
    shopifyApiSecret: existingProfile?.shopifyApiSecret || '',
    socialMedia: {
      facebook: existingProfile?.socialMedia?.facebook || '',
      twitter: existingProfile?.socialMedia?.twitter || '',
      instagram: existingProfile?.socialMedia?.instagram || '',
      linkedin: existingProfile?.socialMedia?.linkedin || '',
      youtube: existingProfile?.socialMedia?.youtube || '',
      tiktok: existingProfile?.socialMedia?.tiktok || '',
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    setError('');

    try {
      const profileData = {
        ...formData,
        userId: user.uid,
      } as BrandProfile;

      let savedProfile: BrandProfile;
      if (existingProfile?.id) {
        await brandProfileOperations.update(
          user!.uid,
          existingProfile.id,
          profileData
        );
        savedProfile = { ...profileData, id: existingProfile.id };
      } else {
        const newId = await brandProfileOperations.create(user!.uid, profileData);
        savedProfile = { ...profileData, id: newId as string };
      }

      onSave?.(savedProfile);
    } catch (err) {
      setError('Failed to save brand profile. Please try again.');
      console.error('Error saving brand profile:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="brandName" className="block text-sm font-medium text-gray-700">
            Brand Name
          </label>
          <input
            type="text"
            id="brandName"
            name="brandName"
            value={formData.brandName}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="businessType" className="block text-sm font-medium text-gray-700">
            Business Type
          </label>
          <input
            type="text"
            id="businessType"
            name="businessType"
            value={formData.businessType}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label htmlFor="brandColor" className="block text-sm font-medium text-gray-700">
            Brand Color
          </label>
          <div className="mt-1 flex items-center space-x-2">
            <input
              type="color"
              id="brandColor"
              name="brandColor"
              value={formData.brandColor}
              onChange={handleChange}
              className="h-8 w-8 rounded-md border-gray-300 shadow-sm"
            />
            <input
              type="text"
              value={formData.brandColor}
              onChange={handleChange}
              name="brandColor"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Website URL Section - NEW */}
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Website URL</h3>
          <p className="text-sm text-gray-600 mb-4">
            Provide your main website URL. This can be used for content discovery and link organization.
          </p>
          
          <div>
            <label htmlFor="websiteUrl" className="block text-sm font-medium text-gray-700">
              Website URL
            </label>
            <input
              type="url"
              id="websiteUrl"
              name="websiteUrl"
              value={formData.websiteUrl}
              onChange={handleChange}
              placeholder="https://your-website.com"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          
          {/* Integration Status Indicator */}
          {(() => {
            const hasCompleteShopify = formData.shopifyStoreUrl && formData.shopifyAccessToken;
            const hasWebsiteUrl = formData.websiteUrl;
            
            if (hasCompleteShopify && hasWebsiteUrl) {
              return (
                <div className="mt-2 flex items-center text-sm text-green-600">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Both website and Shopify integration configured
                </div>
              );
            } else if (hasCompleteShopify) {
              return (
                <div className="mt-2 flex items-center text-sm text-blue-600">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  Shopify integration is primary (website URL optional)
                </div>
              );
            }
            return null;
          })()}
        </div>

        {/* Shopify Integration Section */}
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Shopify Integration</h3>
          <p className="text-sm text-gray-600 mb-4">
            Connect your Shopify store for automatic product, collection, and page integration in articles.
          </p>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="shopifyStoreUrl" className="block text-sm font-medium text-gray-700">
                Shopify Store URL
              </label>
              <input
                type="url"
                id="shopifyStoreUrl"
                name="shopifyStoreUrl"
                value={formData.shopifyStoreUrl}
                onChange={handleChange}
                placeholder="https://your-store.myshopify.com"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="shopifyAccessToken" className="block text-sm font-medium text-gray-700">
                Shopify Access Token
              </label>
              <input
                type="password"
                id="shopifyAccessToken"
                name="shopifyAccessToken"
                value={formData.shopifyAccessToken}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="shopifyApiKey" className="block text-sm font-medium text-gray-700">
                Shopify API Key
              </label>
              <input
                type="password"
                id="shopifyApiKey"
                name="shopifyApiKey"
                value={formData.shopifyApiKey}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="shopifyApiSecret" className="block text-sm font-medium text-gray-700">
                Shopify API Secret
              </label>
              <input
                type="password"
                id="shopifyApiSecret"
                name="shopifyApiSecret"
                value={formData.shopifyApiSecret}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Social Media Links Section - Moved to bottom */}
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Social Media Links</h3>
          <p className="text-sm text-gray-600 mb-4">
            Add your social media profiles to enhance your brand presence in articles.
          </p>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="facebook" className="block text-sm font-medium text-gray-700">
                Facebook
              </label>
              <input
                type="url"
                id="facebook"
                name="socialMedia.facebook"
                value={formData.socialMedia.facebook}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  socialMedia: {
                    ...prev.socialMedia,
                    facebook: e.target.value
                  }
                }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="https://facebook.com/your-page"
              />
            </div>

            <div>
              <label htmlFor="twitter" className="block text-sm font-medium text-gray-700">
                Twitter
              </label>
              <input
                type="url"
                id="twitter"
                name="socialMedia.twitter"
                value={formData.socialMedia.twitter}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  socialMedia: {
                    ...prev.socialMedia,
                    twitter: e.target.value
                  }
                }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="https://twitter.com/your-handle"
              />
            </div>

            <div>
              <label htmlFor="instagram" className="block text-sm font-medium text-gray-700">
                Instagram
              </label>
              <input
                type="url"
                id="instagram"
                name="socialMedia.instagram"
                value={formData.socialMedia.instagram}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  socialMedia: {
                    ...prev.socialMedia,
                    instagram: e.target.value
                  }
                }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="https://instagram.com/your-handle"
              />
            </div>

            <div>
              <label htmlFor="linkedin" className="block text-sm font-medium text-gray-700">
                LinkedIn
              </label>
              <input
                type="url"
                id="linkedin"
                name="socialMedia.linkedin"
                value={formData.socialMedia.linkedin}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  socialMedia: {
                    ...prev.socialMedia,
                    linkedin: e.target.value
                  }
                }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="https://linkedin.com/company/your-company"
              />
            </div>

            <div>
              <label htmlFor="youtube" className="block text-sm font-medium text-gray-700">
                YouTube
              </label>
              <input
                type="url"
                id="youtube"
                name="socialMedia.youtube"
                value={formData.socialMedia.youtube}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  socialMedia: {
                    ...prev.socialMedia,
                    youtube: e.target.value
                  }
                }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="https://youtube.com/c/your-channel"
              />
            </div>

            <div>
              <label htmlFor="tiktok" className="block text-sm font-medium text-gray-700">
                TikTok
              </label>
              <input
                type="url"
                id="tiktok"
                name="socialMedia.tiktok"
                value={formData.socialMedia.tiktok}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  socialMedia: {
                    ...prev.socialMedia,
                    tiktok: e.target.value
                  }
                }))}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="https://tiktok.com/@your-handle"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className={`px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isLoading ? 'Saving...' : existingProfile ? 'Update Profile' : 'Create Profile'}
        </button>
      </div>
    </form>
  );
} 