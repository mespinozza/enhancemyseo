import { useState, useEffect } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { brandProfileOperations, BrandProfile } from '@/lib/firebase/firestore';
import SearchConsoleSection from './SearchConsoleSection';

interface BrandProfileFormProps {
  existingProfile?: BrandProfile;
  onSave?: (profile: BrandProfile) => void;
  onCancel?: () => void;
}

interface CredentialFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  secret?: boolean;
  inputType?: 'text' | 'url';
  placeholder?: string;
  hint?: string;
}

function CredentialField({
  name,
  label,
  value,
  onChange,
  secret = false,
  inputType = 'text',
  placeholder,
  hint,
}: CredentialFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copyState]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const isHidden = secret && !revealed;
  const iconButton =
    'flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          type={isHidden ? 'password' : inputType}
          id={name}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 ${
            secret ? 'pr-16' : 'pr-10'
          } ${secret && revealed ? 'font-mono text-sm' : ''}`}
        />
        <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-1.5">
          {secret && (
            <button
              type="button"
              onClick={() => setRevealed((prev) => !prev)}
              disabled={!value}
              className={iconButton}
              aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
              title={revealed ? 'Hide' : 'Show'}
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!value}
            className={iconButton}
            aria-label={`Copy ${label}`}
            title="Copy"
          >
            {copyState === 'copied' ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {copyState !== 'idle' && (
        <p className={`mt-1 text-xs ${copyState === 'copied' ? 'text-green-600' : 'text-red-600'}`}>
          {copyState === 'copied'
            ? 'Copied to clipboard'
            : 'Could not copy — reveal the value and copy it manually'}
        </p>
      )}
    </div>
  );
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
    shopifyAuthor: existingProfile?.shopifyAuthor || '',
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
            const hasCompleteShopify = Boolean(formData.shopifyStoreUrl);
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
            <CredentialField
              name="shopifyStoreUrl"
              label="Shopify Store URL"
              value={formData.shopifyStoreUrl}
              onChange={handleChange}
              inputType="url"
              placeholder="https://your-store.myshopify.com"
              hint="The only field this needs for stores reached through our Shopify app."
            />

            <CredentialField
              name="shopifyAccessToken"
              label="Shopify Access Token (optional)"
              value={formData.shopifyAccessToken}
              onChange={handleChange}
              secret
              hint="Only for stores with an older custom app that issued a permanent shpat_ token. Leave it blank otherwise — access is requested per call."
            />

            <CredentialField
              name="shopifyApiKey"
              label="Shopify API Key (unused)"
              value={formData.shopifyApiKey}
              onChange={handleChange}
              secret
            />

            <CredentialField
              name="shopifyApiSecret"
              label="Shopify API Secret (unused)"
              value={formData.shopifyApiSecret}
              onChange={handleChange}
              secret
            />

            <div>
              <label htmlFor="shopifyAuthor" className="block text-sm font-medium text-gray-700">
                Blog author
              </label>
              <input
                type="text"
                id="shopifyAuthor"
                name="shopifyAuthor"
                value={formData.shopifyAuthor}
                onChange={handleChange}
                placeholder={formData.brandName || 'e.g. Malachy Parts Plus'}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Shown as the byline on articles pushed to Shopify. Leave it blank to use the
                brand name — without either, Shopify credits the app and shows &quot;Shopify
                API&quot;.
              </p>
            </div>
          </div>
        </div>

        <SearchConsoleSection brandId={existingProfile?.id} />

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