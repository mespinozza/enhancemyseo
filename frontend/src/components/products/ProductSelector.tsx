'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { Search, Filter, Check, X, Eye, ShoppingCart, Tag, Store, Package } from 'lucide-react';
import Image from 'next/image';
import { 
  GET_PRODUCTS, 
  GET_VENDORS, 
  GET_PRODUCT_TYPES, 
  GET_TAGS,
  Product,
  ProductsQueryResult,
  VendorsQueryResult,
  ProductTypesQueryResult,
  TagsQueryResult
} from '@/lib/apollo/queries';

interface ProductSelectorProps {
  onProductsSelect: (products: Product[]) => void;
  selectedProducts: Product[];
  maxSelection?: number;
  allowMultiple?: boolean;
}

interface FilterState {
  search: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  priceRange: {
    min: string;
    max: string;
  };
}

export default function ProductSelector({ 
  onProductsSelect, 
  selectedProducts = [], 
  maxSelection = 10,
  allowMultiple = true 
}: ProductSelectorProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    vendor: '',
    productType: '',
    tags: [],
    status: '',
    priceRange: { min: '', max: '' }
  });
  
  const [showFilters, setShowFilters] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
  const [sortBy, setSortBy] = useState<'CREATED_AT' | 'UPDATED_AT' | 'TITLE' | 'VENDOR'>('CREATED_AT');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  // Build GraphQL query string from filters
  const buildQueryString = () => {
    const queryParts: string[] = [];
    
    if (filters.search) {
      queryParts.push(`title:*${filters.search}*`);
    }
    
    if (filters.vendor) {
      queryParts.push(`vendor:"${filters.vendor}"`);
    }
    
    if (filters.productType) {
      queryParts.push(`product_type:"${filters.productType}"`);
    }
    
    if (filters.tags.length > 0) {
      queryParts.push(...filters.tags.map(tag => `tag:"${tag}"`));
    }
    
    if (filters.status) {
      queryParts.push(`status:${filters.status}`);
    }
    
    return queryParts.length > 0 ? queryParts.join(' AND ') : undefined;
  };

  // Fetch products with current filters
  const { data: productsData, loading: productsLoading, refetch: refetchProducts } = useQuery<ProductsQueryResult>(
    GET_PRODUCTS,
    {
      variables: {
        first: 20,
        query: buildQueryString(),
        sortKey: sortBy,
        reverse: sortOrder === 'DESC'
      },
      skip: false
    }
  );

  // Fetch filter options
  const { data: vendorsData } = useQuery<VendorsQueryResult>(GET_VENDORS);
  const { data: productTypesData } = useQuery<ProductTypesQueryResult>(GET_PRODUCT_TYPES);
  const { data: tagsData } = useQuery<TagsQueryResult>(GET_TAGS);

  // Extract filter options from data
  const vendors = vendorsData?.shop.productVendors.edges.map(edge => edge.node) || [];
  const productTypes = productTypesData?.shop.productTypes.edges.map(edge => edge.node) || [];
  const availableTags = tagsData?.shop.productTags.edges.map(edge => edge.node) || [];

  // Handle product selection
  const handleProductSelect = (product: Product) => {
    if (allowMultiple) {
      const isSelected = selectedProducts.some(p => p.id === product.id);
      let newSelection: Product[];
      
      if (isSelected) {
        newSelection = selectedProducts.filter(p => p.id !== product.id);
      } else {
        if (selectedProducts.length >= maxSelection) {
          return; // Max selection reached
        }
        newSelection = [...selectedProducts, product];
      }
      
      onProductsSelect(newSelection);
    } else {
      onProductsSelect([product]);
    }
  };

  // Handle tag filter toggle
  const handleTagToggle = (tag: string) => {
    setFilters(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      search: '',
      vendor: '',
      productType: '',
      tags: [],
      status: '',
      priceRange: { min: '', max: '' }
    });
  };

  // Refetch when filters change
  useEffect(() => {
    refetchProducts();
  }, [filters, sortBy, sortOrder, refetchProducts]);

  const products = productsData?.products.edges.map(edge => edge.node) || [];

  return (
    <div className="w-full">
      {/* Header with search and filter toggle */}
      <div className="mb-6">
        <div className="flex gap-4 items-center mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search products..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 border rounded-lg flex items-center gap-2 transition-colors ${
              showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {/* Selection Summary */}
        {selectedProducts.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-blue-700 font-medium">
                {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
                {maxSelection > 1 && ` (${selectedProducts.length}/${maxSelection})`}
              </span>
              <button
                onClick={() => onProductsSelect([])}
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                Clear all
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Vendor Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Store className="inline w-4 h-4 mr-1" />
                Vendor
              </label>
              <select
                value={filters.vendor}
                onChange={(e) => setFilters(prev => ({ ...prev, vendor: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All vendors</option>
                {vendors.map(vendor => (
                  <option key={vendor} value={vendor}>{vendor}</option>
                ))}
              </select>
            </div>

            {/* Product Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Package className="inline w-4 h-4 mr-1" />
                Product Type
              </label>
              <select
                value={filters.productType}
                onChange={(e) => setFilters(prev => ({ ...prev, productType: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All types</option>
                {productTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>

          {/* Tags Filter */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Tag className="inline w-4 h-4 mr-1" />
              Tags
            </label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {availableTags.slice(0, 50).map(tag => (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    filters.tags.includes(tag)
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Sort Options */}
          <div className="mt-4 flex gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sort by</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'CREATED_AT' | 'UPDATED_AT' | 'TITLE' | 'VENDOR')}
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="CREATED_AT">Created Date</option>
                <option value="UPDATED_AT">Updated Date</option>
                <option value="TITLE">Title</option>
                <option value="VENDOR">Vendor</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Order</label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'ASC' | 'DESC')}
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="DESC">Newest first</option>
                <option value="ASC">Oldest first</option>
              </select>
            </div>
          </div>

          {/* Clear Filters Button */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Clear all filters
            </button>
          </div>
        </div>
      )}

      {/* Products Grid */}
      {productsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="bg-gray-200 w-full h-40 rounded-lg mb-3"></div>
              <div className="bg-gray-200 h-4 rounded mb-2"></div>
              <div className="bg-gray-200 h-3 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map(product => {
            const isSelected = selectedProducts.some(p => p.id === product.id);
            const featuredImage = product.featuredImage || product.images.edges[0]?.node;
            const price = product.variants.edges[0]?.node.price;

            return (
              <div
                key={product.id}
                className={`border rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                  isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Product Image */}
                <div className="relative mb-3">
                  {featuredImage ? (
                    <Image
                      src={featuredImage.url}
                      alt={featuredImage.altText || product.title}
                      width={200}
                      height={160}
                      className="w-full h-40 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-40 bg-gray-200 rounded-lg flex items-center justify-center">
                      <Package className="w-12 h-12 text-gray-400" />
                    </div>
                  )}
                  
                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="space-y-2">
                  <h3 className="font-medium text-gray-900 line-clamp-2 text-sm">
                    {product.title}
                  </h3>
                  
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>{product.vendor}</span>
                    {price && <span className="font-medium">${price}</span>}
                  </div>
                  
                  {product.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {product.tags.slice(0, 3).map(tag => (
                        <span
                          key={tag}
                          className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                      {product.tags.length > 3 && (
                        <span className="text-xs text-gray-500">
                          +{product.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => handleProductSelect(product)}
                    disabled={!allowMultiple && selectedProducts.length > 0 && !isSelected}
                    className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
                      isSelected
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4 inline mr-1" />
                    {isSelected ? 'Selected' : 'Select'}
                  </button>
                  
                  <button
                    onClick={() => setPreviewProduct(product)}
                    className="px-3 py-2 text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-600">
            Try adjusting your filters or search terms to find products.
          </p>
        </div>
      )}

      {/* Product Preview Modal */}
      {previewProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  {previewProduct.title}
                </h2>
                <button
                  onClick={() => setPreviewProduct(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Product Images */}
              {previewProduct.images.edges.length > 0 && (
                <div className="mb-4">
                  <div className="grid grid-cols-2 gap-2">
                    {previewProduct.images.edges.slice(0, 4).map(({ node: image }) => (
                      <Image
                        key={image.id}
                        src={image.url}
                        alt={image.altText || previewProduct.title}
                        width={200}
                        height={160}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Product Details */}
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900 mb-2">Description</h3>
                  <p className="text-gray-700 text-sm">
                    {previewProduct.description || 'No description available'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Vendor</h3>
                    <p className="text-gray-700 text-sm">{previewProduct.vendor}</p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Product Type</h3>
                    <p className="text-gray-700 text-sm">{previewProduct.productType}</p>
                  </div>
                </div>

                {previewProduct.tags.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {previewProduct.tags.map(tag => (
                        <span
                          key={tag}
                          className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Variants */}
                {previewProduct.variants.edges.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Variants</h3>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {previewProduct.variants.edges.map(({ node: variant }) => (
                        <div key={variant.id} className="flex justify-between items-center text-sm">
                          <span>{variant.title}</span>
                          <span className="font-medium">${variant.price}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    handleProductSelect(previewProduct);
                    setPreviewProduct(null);
                  }}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {selectedProducts.some(p => p.id === previewProduct.id) ? 'Remove from Selection' : 'Add to Selection'}
                </button>
                <button
                  onClick={() => setPreviewProduct(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 