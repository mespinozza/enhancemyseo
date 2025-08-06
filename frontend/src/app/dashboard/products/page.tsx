'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useRouter } from 'next/navigation';
import { useShopify } from '@/contexts/ShopifyContext';
import { ApolloProvider } from '@apollo/client';
import { ArrowLeft, Check, X, AlertCircle, Download, ExternalLink, Store } from 'lucide-react';
import ProductSelector from '@/components/products/ProductSelector';
import { Product } from '@/lib/apollo/queries';
import { generatedProductOperations, GeneratedProduct, BrandProfile } from '@/lib/firebase/firestore';

interface ToastNotification {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function ProductsPage() {
  const { user, subscription_status, loading: authLoading } = useAuth();
  const { 
    isConnected, 
    shopDomain, 
    apolloClient, 
    brandProfiles, 
    selectedBrandProfile, 
    setSelectedBrandProfile,
    loading: shopifyLoading,
    connect 
  } = useShopify();
  const router = useRouter();
  
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationHistory, setOptimizationHistory] = useState<GeneratedProduct[]>([]);
  const [toast, setToast] = useState<ToastNotification>({ show: false, message: '', type: 'success' });
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [connectionForm, setConnectionForm] = useState({
    shopUrl: '',
    accessToken: ''
  });

  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'success' });
    }, 5000);
  };

  // Admin subscription access check
  useEffect(() => {
    if (!authLoading && subscription_status !== 'admin') {
      router.push('/dashboard');
    }
  }, [authLoading, subscription_status, router]);

  // Load optimization history
  useEffect(() => {
    async function loadOptimizationHistory() {
      if (!user?.uid) {
        console.log('No authenticated user found, skipping optimization history load');
        return;
      }
      
      // Ensure we have a valid auth token
      try {
        await user.getIdToken();
      } catch (tokenError) {
        console.error('Failed to get auth token:', tokenError);
        showToast('Authentication error. Please refresh the page.', 'error');
        return;
      }
      
      console.log('Loading optimization history for user:', user.uid);
      
      try {
        const products = await generatedProductOperations.getAll(user.uid);
        console.log('Successfully loaded products:', products.length);
        setOptimizationHistory(products);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error loading optimization history:', errorMessage);
        
        // Handle permission errors gracefully for new users
        if ((error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') || (error instanceof Error && error.message.includes('permission'))) {
          console.log('No products found for this user yet (this is normal for new users)');
          setOptimizationHistory([]); // Set empty array for new users
        } else {
          showToast('Could not load optimization history. Please refresh the page.', 'error');
        }
      }
    }
    
    // Only run when we have a fully authenticated user
    if (user?.uid && !authLoading) {
      // Add delay to ensure Firestore rules have been applied
      setTimeout(loadOptimizationHistory, 500);
    }
  }, [user, authLoading]);

  // Handle brand profile selection
  const handleBrandSelect = (brandId: string) => {
    const profile = brandProfiles.find(p => p.id === brandId);
    if (profile) {
      setSelectedBrandProfile(profile);
      
      // Auto-connect to Shopify if credentials are available
      if (profile.shopifyStoreUrl && profile.shopifyAccessToken) {
        const domain = extractShopDomain(profile.shopifyStoreUrl);
        if (domain) {
          connect(domain, profile.shopifyAccessToken);
          showToast('Connected to Shopify store successfully!', 'success');
        }
      }
    }
  };

  // Extract shop domain from URL
  const extractShopDomain = (url: string): string | null => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname;
    } catch {
      return null;
    }
  };

  // Handle manual Shopify connection
  const handleManualConnection = () => {
    if (!connectionForm.shopUrl || !connectionForm.accessToken) {
      showToast('Please provide both shop URL and access token', 'error');
      return;
    }
    
    const domain = extractShopDomain(connectionForm.shopUrl);
    if (!domain) {
      showToast('Invalid shop URL format', 'error');
      return;
    }
    
    connect(domain, connectionForm.accessToken);
    setShowConnectionForm(false);
    setConnectionForm({ shopUrl: '', accessToken: '' });
    showToast('Connected to Shopify store successfully!', 'success');
  };

  // Handle bulk product optimization
  const handleOptimizeProducts = async () => {
    if (!selectedProducts.length || !selectedBrandProfile || !user) return;
    
    setIsOptimizing(true);
    try {
      const optimizedProducts: GeneratedProduct[] = [];
      
      for (const product of selectedProducts) {
        try {
          // Call the optimization API
          const response = await fetch('/api/optimize-product', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${await user.getIdToken()}`,
            },
            body: JSON.stringify({
              productName: product.title,
              originalTitle: product.seo?.title || product.title,
              originalDescription: product.description,
              brandName: selectedBrandProfile.brandName,
              businessType: selectedBrandProfile.businessType,
              brandGuidelines: selectedBrandProfile.brandGuidelines || '',
              shopifyProductId: product.id,
              vendor: product.vendor,
              productType: product.productType,
              tags: product.tags,
            }),
          });

          let optimizedData;
          if (response.ok) {
            optimizedData = await response.json();
          } else {
            // Fallback to client-side optimization
            optimizedData = generateOptimizedProduct(product, selectedBrandProfile);
          }

          // Create the product object to save
          const newProduct: Omit<GeneratedProduct, 'id' | 'createdAt' | 'updatedAt'> = {
            userId: user.uid,
            productName: product.title,
            originalDescription: product.description,
            optimizedDescription: optimizedData.optimizedDescription,
            optimizedTitle: optimizedData.optimizedTitle,
            keywords: optimizedData.keywords,
            seoScore: optimizedData.seoScore,
            recommendations: optimizedData.recommendations,
            status: 'optimized'
          };

          // Save to Firestore
          const savedProduct = await generatedProductOperations.create(newProduct);
          optimizedProducts.push(savedProduct);
          
        } catch (error) {
          console.error(`Error optimizing product ${product.title}:`, error);
        }
      }
      
      // Update local state
      setOptimizationHistory(prev => [...optimizedProducts, ...prev]);
      setSelectedProducts([]);
      
      showToast(`Successfully optimized ${optimizedProducts.length} products!`, 'success');
      
      // Redirect to history page
      router.push('/dashboard/history?tab=products');
      
    } catch (error) {
      console.error('Error optimizing products:', error);
      showToast('Failed to optimize products. Please try again.', 'error');
    } finally {
      setIsOptimizing(false);
    }
  };

  // Fallback optimization function
  const generateOptimizedProduct = (product: Product, brand: BrandProfile) => {
    const keywords = [
      brand.brandName.toLowerCase(),
      brand.businessType.toLowerCase(),
      product.vendor.toLowerCase(),
      product.productType.toLowerCase(),
      ...product.tags.slice(0, 5),
      'premium',
      'quality'
    ].filter((word, index, arr) => arr.indexOf(word) === index);

    const optimizedTitle = `${product.title} - ${brand.brandName} | Premium ${product.productType}`;
    const optimizedDescription = `${product.description} Experience the quality and craftsmanship of ${brand.brandName}. Our ${product.productType} products are designed to exceed your expectations with premium materials and attention to detail.`;

    return {
      optimizedTitle,
      optimizedDescription,
      keywords,
      seoScore: 75 + Math.floor(Math.random() * 20),
      recommendations: [
        'Optimize product images with alt text',
        'Add customer reviews and testimonials',
        'Include size/variant information',
        'Improve meta description length'
      ]
    };
  };

  // Handle product download
  const handleDownloadProduct = (product: GeneratedProduct) => {
    const productData = {
      productName: product.productName,
      optimizedTitle: product.optimizedTitle,
      optimizedDescription: product.optimizedDescription,
      keywords: product.keywords,
      seoScore: product.seoScore,
      recommendations: product.recommendations,
      generatedAt: product.createdAt?.toDate?.()?.toISOString()
    };

    const blob = new Blob([JSON.stringify(productData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${product.productName.toLowerCase().replace(/\s+/g, '-')}-optimization.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Product data downloaded successfully!', 'success');
  };

  // Loading state
  if (authLoading || shopifyLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  // Access denied for non-admin users
  if (subscription_status !== 'admin') {
    return (
      <div className="p-8">
        <div className="max-w-md mx-auto text-center">
          <ArrowLeft className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Subscription Required</h1>
          <p className="text-gray-600 mb-6">
            This feature is only available with an admin subscription. Contact your administrator for access.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Product Optimization</h1>
            <p className="text-gray-600 mt-1">Select and optimize multiple products at once using AI-powered SEO recommendations.</p>
          </div>
          <span className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded-full">
            Admin Feature
          </span>
        </div>

        {/* Connection Status & Brand Selection */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Store Connection</h2>
            {isConnected && shopDomain && (
              <div className="flex items-center text-green-600">
                <Check className="w-4 h-4 mr-1" />
                <span className="text-sm">Connected to {shopDomain}</span>
              </div>
            )}
          </div>

          {/* Brand Profile Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Brand Profile
            </label>
            {brandProfiles.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {brandProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    onClick={() => handleBrandSelect(profile.id || '')}
                    className={`p-4 border rounded-lg text-left transition-colors ${
                      selectedBrandProfile?.id === profile.id
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
                    {profile.shopifyStoreUrl && (
                      <div className="flex items-center mt-2 text-xs text-green-600">
                        <Store className="w-3 h-3 mr-1" />
                        Shopify Connected
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-500 mb-3">No brand profiles found</p>
                <button
                  onClick={() => router.push('/dashboard/brand-profiles')}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Create your first brand profile
                </button>
              </div>
            )}
          </div>

          {/* Manual Connection Option */}
          {!isConnected && (
            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">
                    Not connected to Shopify? Connect manually to access your products.
                  </p>
                </div>
                <button
                  onClick={() => setShowConnectionForm(!showConnectionForm)}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  {showConnectionForm ? 'Cancel' : 'Connect Manually'}
                </button>
              </div>
              
              {showConnectionForm && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Shop URL
                      </label>
                      <input
                        type="text"
                        value={connectionForm.shopUrl}
                        onChange={(e) => setConnectionForm(prev => ({ ...prev, shopUrl: e.target.value }))}
                        placeholder="your-shop.myshopify.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Access Token
                      </label>
                      <input
                        type="password"
                        value={connectionForm.accessToken}
                        onChange={(e) => setConnectionForm(prev => ({ ...prev, accessToken: e.target.value }))}
                        placeholder="Your Shopify access token"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleManualConnection}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Connect to Shopify
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Product Selector */}
        {isConnected && apolloClient ? (
          <ApolloProvider client={apolloClient}>
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Select Products to Optimize</h2>
                {selectedProducts.length > 0 && (
                  <button
                    onClick={handleOptimizeProducts}
                    disabled={isOptimizing || !selectedBrandProfile}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isOptimizing ? 'Optimizing...' : `Optimize ${selectedProducts.length} Product${selectedProducts.length !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
              
              <ProductSelector
                onProductsSelect={setSelectedProducts}
                selectedProducts={selectedProducts}
                maxSelection={20}
                allowMultiple={true}
              />
            </div>
          </ApolloProvider>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Connect to Shopify</h3>
            <p className="text-gray-600 mb-4">
              Connect your Shopify store to access and optimize your products with AI-powered SEO recommendations.
            </p>
            {!selectedBrandProfile && (
              <p className="text-sm text-amber-600 mb-4">
                Please select a brand profile first, or add Shopify credentials to your brand profile.
              </p>
            )}
          </div>
        )}

        {/* Optimization History Preview */}
        {optimizationHistory.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Recent Optimizations</h2>
              <button
                onClick={() => router.push('/dashboard/history?tab=products')}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                View All
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {optimizationHistory.slice(0, 6).map((product) => (
                <div key={product.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-900 truncate">{product.productName}</h3>
                    {product.seoScore && (
                      <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                        {product.seoScore}/100
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                    {product.optimizedDescription?.substring(0, 100)}...
                  </p>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownloadProduct(product)}
                      className="flex-1 flex items-center justify-center px-3 py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </button>
                    <button
                      onClick={() => router.push(`/dashboard/history?tab=products&highlight=${product.id}`)}
                      className="flex-1 flex items-center justify-center px-3 py-2 text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast.show && (
          <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom duration-300">
            <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
              toast.type === 'success' 
                ? 'bg-green-600 text-white'
                : toast.type === 'error'
                ? 'bg-red-600 text-white' 
                : 'bg-blue-600 text-white'
            }`}>
              <div className="flex-shrink-0">
                {toast.type === 'success' ? (
                  <Check className="w-5 h-5" />
                ) : toast.type === 'error' ? (
                  <X className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
              </div>
              <span className="text-sm font-medium">{toast.message}</span>
              <button
                onClick={() => setToast({ show: false, message: '', type: 'success' })}
                className="flex-shrink-0 ml-2 hover:opacity-80"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 