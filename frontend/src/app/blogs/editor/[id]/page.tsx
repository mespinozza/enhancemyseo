'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useRouter, useParams } from 'next/navigation';
import { blogOperations, BlogPost } from '@/lib/firebase/firestore';
import { Save, Eye, ArrowLeft, Globe, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import Image from 'next/image';

export default function EditBlogPage() {
  const { user, subscription_status, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const blogId = params.id as string;
  
  const [blog, setBlog] = useState<BlogPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    content: '',
    metaDescription: '',
    featuredImage: '',
    published: false,
    tags: [] as string[],
    showDate: true,
    showAuthor: true
  });
  const [tagInput, setTagInput] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Access control - only admin users can access this page
  useEffect(() => {
    if (!loading && user && subscription_status !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, subscription_status, loading, router]);

  // Auto-generate slug from title when editing
  useEffect(() => {
    if (formData.title) {
      const slug = blogOperations.generateSlug(formData.title);
      setFormData(prev => ({ ...prev, slug }));
    }
  }, [formData.title]);

  // Load existing blog post
  useEffect(() => {
    const loadBlog = async () => {
      if (!user || !blogId) return;
      
      setIsLoading(true);
      try {
        const existingBlog = await blogOperations.getById(user.uid, blogId);
        
        if (!existingBlog) {
          toast.error('Blog post not found');
          router.push('/blogs');
          return;
        }
        
        setBlog(existingBlog);
        setFormData({
          title: existingBlog.title,
          slug: existingBlog.slug,
          content: existingBlog.content,
          metaDescription: existingBlog.metaDescription || '',
          featuredImage: existingBlog.featuredImage || '',
          published: existingBlog.published,
          tags: existingBlog.tags || [],
          showDate: existingBlog.showDate ?? true,
          showAuthor: existingBlog.showAuthor ?? true
        });
      } catch (error) {
        console.error('Error loading blog:', error);
        toast.error('Failed to load blog post');
        router.push('/blogs');
      } finally {
        setIsLoading(false);
      }
    };

    if (user && subscription_status === 'admin') {
      loadBlog();
    }
  }, [user, subscription_status, blogId, router]);

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
  const handleSave = async (publish?: boolean) => {
    if (!user || !blog) return;
    
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
      // Check if slug is unique (excluding current blog)
      const isUnique = await blogOperations.isSlugUnique(user.uid, formData.slug, blog.id);
      if (!isUnique) {
        toast.error('URL slug already exists. Please choose a different one.');
        setIsSaving(false);
        return;
      }

      const publishStatus = publish !== undefined ? publish : formData.published;
      const updates: Partial<BlogPost> = {
        title: formData.title,
        slug: formData.slug,
        content: formData.content,
        metaDescription: formData.metaDescription,
        published: publishStatus,
        showDate: formData.showDate,
        showAuthor: formData.showAuthor,
        // Only include featuredImage if it has a value
        ...(formData.featuredImage && { featuredImage: formData.featuredImage }),
        // Only include tags if there are any
        ...(formData.tags.length > 0 && { tags: formData.tags })
      };

      // Set publish date if publishing for the first time
      if (publishStatus && !blog.published) {
        updates.publishDate = new Date();
      }

      await blogOperations.update(user.uid, blog.id!, updates);
      
      toast.success('Blog post updated successfully');
      
      // Update local state
      setFormData(prev => ({ ...prev, published: publishStatus }));
      setBlog(prev => prev ? { ...prev, ...updates } : null);
    } catch (error) {
      console.error('Error saving blog:', error);
      toast.error('Failed to save blog post');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete blog post
  const handleDelete = async () => {
    if (!user || !blog) return;
    
    try {
      await blogOperations.delete(user.uid, blog.id!);
      toast.success('Blog post deleted successfully');
      router.push('/blogs');
    } catch (error) {
      console.error('Error deleting blog:', error);
      toast.error('Failed to delete blog post');
    }
  };

  // Show loading while checking subscription status
  if (loading || isLoading) {
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

  if (!blog) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Blog post not found</div>
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
                <h1 className="text-2xl font-bold text-gray-900">Edit Post</h1>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                  blog.published ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {blog.published ? 'Published' : 'Draft'}
                </span>
              </div>
              <div className="flex items-center space-x-3">
                {blog.published && (
                  <Link
                    href={`/blog/${blog.slug}`}
                    target="_blank"
                    className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Live
                  </Link>
                )}
                <button
                  onClick={() => setIsPreview(!isPreview)}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {isPreview ? 'Edit' : 'Preview'}
                </button>
                <button
                  onClick={() => handleSave()}
                  disabled={isSaving}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </button>
                <button
                  onClick={() => handleSave(!formData.published)}
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  {formData.published ? 'Unpublish' : 'Publish'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content - Same as create editor but with existing data */}
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

          {/* Sidebar - Same as create editor */}
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
                        width={1200}
                        height={630}
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

            {/* Display Options */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Display Options</h3>
              
              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    id="showDate"
                    type="checkbox"
                    checked={formData.showDate}
                    onChange={(e) => handleInputChange('showDate', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="showDate" className="ml-2 block text-sm text-gray-700">
                    Show publish date
                  </label>
                </div>
                
                <div className="flex items-center">
                  <input
                    id="showAuthor"
                    type="checkbox"
                    checked={formData.showAuthor}
                    onChange={(e) => handleInputChange('showAuthor', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="showAuthor" className="ml-2 block text-sm text-gray-700">
                    Show author name
                  </label>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Actions</h3>
              
              <div className="space-y-3">
                <button
                  onClick={() => handleSave()}
                  disabled={isSaving}
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </button>
                
                <button
                  onClick={() => handleSave(!formData.published)}
                  disabled={isSaving}
                  className="w-full inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  {formData.published ? 'Unpublish' : 'Publish Now'}
                </button>

                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full inline-flex items-center justify-center px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Post
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="text-center">
              <Trash2 className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Blog Post</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete &quot;{blog.title}&quot;? This action cannot be undone.
              </p>
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 