'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useRouter } from 'next/navigation';
import { blogOperations, BlogPost } from '@/lib/firebase/firestore';
import { Save, Eye, ArrowLeft, Globe, FileText, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import Image from 'next/image';

export default function BlogEditorPage() {
  const { user, subscription_status, loading } = useAuth();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    metaDescription: '',
    featuredImage: '',
    published: false,
    tags: [] as string[]
  });
  const [tagInput, setTagInput] = useState('');

  // Access control - only admin users can access this page
  useEffect(() => {
    if (!loading && user && subscription_status !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, subscription_status, loading, router]);

  // Auto-generate slug from title
  useEffect(() => {
    if (formData.title && !formData.slug) {
      const slug = blogOperations.generateSlug(formData.title);
      setFormData(prev => ({ ...prev, slug }));
    }
  }, [formData.title, formData.slug]);

  // Handle form input changes
  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Add tag
  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  // Remove tag
  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  // Handle image upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        handleInputChange('featuredImage', result.imageUrl);
        toast.success('Image uploaded successfully!');
      } else {
        toast.error(result.error || 'Failed to upload image');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Save blog post
  const handleSave = async (publish: boolean = false) => {
    if (!user) return;
    
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }

    if (!formData.content.trim()) {
      toast.error('Content is required');
      return;
    }

    setIsSaving(true);
    try {
      // Check if slug is unique
      const isUnique = await blogOperations.isSlugUnique(user.uid, formData.slug);
      if (!isUnique) {
        toast.error('URL slug already exists. Please choose a different one.');
        setIsSaving(false);
        return;
      }

      const blogData: Partial<BlogPost> = {
        title: formData.title,
        slug: formData.slug,
        content: formData.content,
        metaDescription: formData.metaDescription,
        featuredImage: formData.featuredImage || undefined,
        published: publish,
        authorId: user.uid,
        authorName: user.displayName || user.email || 'Admin',
        tags: formData.tags.length > 0 ? formData.tags : undefined,
        viewCount: 0
      };

      if (publish) {
        blogData.publishDate = new Date();
      }

      await blogOperations.create(user.uid, blogData);
      
      toast.success(publish ? 'Blog post published successfully!' : 'Blog post saved as draft');
      router.push('/blogs');
    } catch (error) {
      console.error('Error saving blog:', error);
      toast.error('Failed to save blog post');
    } finally {
      setIsSaving(false);
    }
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Link
                  href="/blogs"
                  className="inline-flex items-center text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Posts
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">Create New Post</h1>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setIsPreview(!isPreview)}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {isPreview ? 'Edit' : 'Preview'}
                </button>
                <button
                  onClick={() => handleSave(false)}
                  disabled={isSaving}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Draft
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  Publish
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              {isPreview ? (
                <div className="prose max-w-none">
                  <h1>{formData.title || 'Untitled Post'}</h1>
                  <div 
                    className="mt-4"
                    dangerouslySetInnerHTML={{ __html: formData.content || '<p>No content yet...</p>' }}
                  />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Title *
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter your blog post title..."
                    />
                  </div>

                  {/* Slug */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      URL Slug *
                    </label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                        /blog/
                      </span>
                      <input
                        type="text"
                        value={formData.slug}
                        onChange={(e) => handleInputChange('slug', e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-r-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="url-friendly-slug"
                      />
                    </div>
                  </div>

                  {/* Content */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Content *
                    </label>
                    <textarea
                      value={formData.content}
                      onChange={(e) => handleInputChange('content', e.target.value)}
                      rows={20}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                      placeholder="Write your blog post content in HTML or Markdown..."
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      You can use HTML tags for formatting
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* SEO Settings */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">SEO Settings</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Meta Description
                  </label>
                  <textarea
                    value={formData.metaDescription}
                    onChange={(e) => handleInputChange('metaDescription', e.target.value)}
                    rows={3}
                    maxLength={160}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Brief description for search engines..."
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {formData.metaDescription.length}/160 characters
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Featured Image
                  </label>
                  
                  {/* Image Preview */}
                  {formData.featuredImage && (
                    <div className="mb-3 relative">
                      <Image
                        src={formData.featuredImage}
                        alt="Featured image preview"
                        width={500}
                        height={280}
                        className="w-full h-32 object-cover rounded-md border"
                      />
                      <button
                        type="button"
                        onClick={() => handleInputChange('featuredImage', '')}
                        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                        title="Remove image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Upload Button */}
                  <div className="space-y-2">
                    <label className="block">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="sr-only"
                        disabled={isUploadingImage}
                      />
                      <div className="w-full flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-md hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer">
                        {isUploadingImage ? (
                          <div className="flex items-center space-x-2 text-blue-600">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            <span className="text-sm">Uploading...</span>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 text-gray-600">
                            <Upload className="w-4 h-4" />
                            <span className="text-sm">Upload Image</span>
                          </div>
                        )}
                      </div>
                    </label>

                    <div className="text-center text-xs text-gray-500">
                      or
                    </div>

                    <input
                      type="url"
                      value={formData.featuredImage}
                      onChange={(e) => handleInputChange('featuredImage', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      placeholder="Enter image URL..."
                    />
                  </div>
                  
                  <p className="mt-1 text-xs text-gray-500">
                    Upload an image (max 5MB) or enter a URL. Recommended: 1200x630px
                  </p>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Tags</h3>
              
              <div className="space-y-3">
                <div className="flex">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Add a tag..."
                  />
                  <button
                    onClick={addTag}
                    className="px-3 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 text-sm"
                  >
                    Add
                  </button>
                </div>
                
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="ml-1 text-blue-600 hover:text-blue-800"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h3>
              
              <div className="space-y-3">
                <button
                  onClick={() => handleSave(false)}
                  disabled={isSaving}
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Save as Draft
                </button>
                
                <button
                  onClick={() => handleSave(true)}
                  disabled={isSaving}
                  className="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  Publish Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 