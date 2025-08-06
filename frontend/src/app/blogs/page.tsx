'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useRouter } from 'next/navigation';
import { blogOperations, BlogPost } from '@/lib/firebase/firestore';
import { Plus, Edit, Trash2, Eye, Calendar, Users, FileText, Globe, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function BlogsPage() {
  const { user, subscription_status, loading } = useAuth();
  const router = useRouter();
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [isLoadingBlogs, setIsLoadingBlogs] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);

  // Access control - only admin users can access this page
  useEffect(() => {
    if (!loading && user && subscription_status !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, subscription_status, loading, router]);

  // Load blog posts
  const loadBlogs = useCallback(async () => {
    if (!user) return;
    
    setIsLoadingBlogs(true);
    try {
      const blogPosts = await blogOperations.getAllBlogPosts(user.uid);
      setBlogs(blogPosts);
    } catch (error) {
      console.error('Error loading blogs:', error);
      toast.error('Failed to load blog posts');
    } finally {
      setIsLoadingBlogs(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadBlogs();
    }
  }, [user, loadBlogs]);

  // Delete blog post
  const handleDelete = async (id: string) => {
    if (!user) return;
    
    try {
      await blogOperations.delete(user.uid, id);
      toast.success('Blog post deleted successfully');
      loadBlogs(); // Reload the list
    } catch (error) {
      console.error('Error deleting blog:', error);
      toast.error('Failed to delete blog post');
    }
    setShowDeleteModal(null);
  };

  // Toggle publish status
  const togglePublish = async (blog: BlogPost) => {
    if (!user) return;

    try {
      const updates: Partial<BlogPost> = {
        published: !blog.published
      };
      
      // Set publish date when publishing
      if (!blog.published) {
        updates.publishDate = new Date();
      }

      await blogOperations.update(user.uid, blog.id!, updates);
      toast.success(blog.published ? 'Blog unpublished' : 'Blog published successfully');
      loadBlogs(); // Reload the list
    } catch (error) {
      console.error('Error toggling publish status:', error);
      toast.error('Failed to update blog status');
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

  const publishedCount = blogs.filter(blog => blog.published).length;
  const draftCount = blogs.filter(blog => !blog.published).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Blog Management</h1>
                <p className="mt-2 text-gray-600">Create and manage your blog posts</p>
              </div>
              <Link
                href="/blogs/editor"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Post
              </Link>
            </div>
            
            {/* Stats */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-blue-600 mr-2" />
                  <div>
                    <p className="text-sm text-blue-600">Total Posts</p>
                    <p className="text-2xl font-bold text-blue-900">{blogs.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <Globe className="w-5 h-5 text-green-600 mr-2" />
                  <div>
                    <p className="text-sm text-green-600">Published</p>
                    <p className="text-2xl font-bold text-green-900">{publishedCount}</p>
                  </div>
                </div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <Clock className="w-5 h-5 text-yellow-600 mr-2" />
                  <div>
                    <p className="text-sm text-yellow-600">Drafts</p>
                    <p className="text-2xl font-bold text-yellow-900">{draftCount}</p>
                  </div>
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <Users className="w-5 h-5 text-purple-600 mr-2" />
                  <div>
                    <p className="text-sm text-purple-600">Total Views</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {blogs.reduce((sum, blog) => sum + (blog.viewCount || 0), 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoadingBlogs ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading blog posts...</p>
          </div>
        ) : blogs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No blog posts yet</h3>
            <p className="text-gray-600 mb-6">Get started by creating your first blog post</p>
            <Link
              href="/blogs/editor"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Post
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Views
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {blogs.map((blog) => (
                    <tr key={blog.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                              {blog.title}
                            </div>
                            <div className="text-sm text-gray-500 truncate max-w-xs">
                              /{blog.slug}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          blog.published 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {blog.published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {blog.viewCount || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-1" />
                          {blog.published && blog.publishDate 
                            ? blog.publishDate.toLocaleDateString()
                            : blog.createdAt?.toDate?.()?.toLocaleDateString() || 'Unknown'
                          }
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          {blog.published && (
                            <Link
                              href={`/blog/${blog.slug}`}
                              target="_blank"
                              className="text-blue-600 hover:text-blue-700 p-1 rounded"
                              title="View Post"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                          )}
                          <Link
                            href={`/blogs/editor/${blog.id}`}
                            className="text-gray-600 hover:text-gray-700 p-1 rounded"
                            title="Edit Post"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => togglePublish(blog)}
                            className={`p-1 rounded ${
                              blog.published 
                                ? 'text-yellow-600 hover:text-yellow-700' 
                                : 'text-green-600 hover:text-green-700'
                            }`}
                            title={blog.published ? 'Unpublish' : 'Publish'}
                          >
                            <Globe className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteModal(blog.id!)}
                            className="text-red-600 hover:text-red-700 p-1 rounded"
                            title="Delete Post"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="text-center">
              <Trash2 className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Delete Blog Post</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this blog post? This action cannot be undone.
              </p>
              <div className="flex justify-center space-x-4">
                <button
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(showDeleteModal)}
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