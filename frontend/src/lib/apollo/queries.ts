import { gql } from '@apollo/client';

// Query to fetch products with filtering options
export const GET_PRODUCTS = gql`
  query GetProducts(
    $first: Int!
    $after: String
    $query: String
    $sortKey: ProductSortKeys
    $reverse: Boolean
  ) {
    products(
      first: $first
      after: $after
      query: $query
      sortKey: $sortKey
      reverse: $reverse
    ) {
      edges {
        node {
          id
          title
          handle
          description
          vendor
          productType
          tags
          status
          createdAt
          updatedAt
          featuredImage {
            id
            url
            altText
            width
            height
          }
          images(first: 5) {
            edges {
              node {
                id
                url
                altText
                width
                height
              }
            }
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                price
                compareAtPrice
                sku
                barcode
                inventoryQuantity
                availableForSale
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
          seo {
            title
            description
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

// Query to fetch unique vendors
export const GET_VENDORS = gql`
  query GetVendors {
    shop {
      productVendors(first: 250) {
        edges {
          node
        }
      }
    }
  }
`;

// Query to fetch unique product types
export const GET_PRODUCT_TYPES = gql`
  query GetProductTypes {
    shop {
      productTypes(first: 250) {
        edges {
          node
        }
      }
    }
  }
`;

// Query to fetch unique tags
export const GET_TAGS = gql`
  query GetTags {
    shop {
      productTags(first: 250) {
        edges {
          node
        }
      }
    }
  }
`;

// Query to fetch a single product by ID
export const GET_PRODUCT = gql`
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      description
      descriptionHtml
      vendor
      productType
      tags
      status
      createdAt
      updatedAt
      featuredImage {
        id
        url
        altText
        width
        height
      }
      images(first: 10) {
        edges {
          node {
            id
            url
            altText
            width
            height
          }
        }
      }
      variants(first: 50) {
        edges {
          node {
            id
            title
            price
            compareAtPrice
            sku
            barcode
            inventoryQuantity
            availableForSale
            selectedOptions {
              name
              value
            }
          }
        }
      }
      seo {
        title
        description
      }
    }
  }
`;

// TypeScript interfaces for the query results
export interface ProductImage {
  id: string;
  url: string;
  altText?: string;
  width?: number;
  height?: number;
}

export interface ProductVariant {
  id: string;
  title: string;
  price: string;
  compareAtPrice?: string;
  sku?: string;
  barcode?: string;
  inventoryQuantity?: number;
  availableForSale: boolean;
  selectedOptions: {
    name: string;
    value: string;
  }[];
}

export interface Product {
  id: string;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
  featuredImage?: ProductImage;
  images: {
    edges: {
      node: ProductImage;
    }[];
  };
  variants: {
    edges: {
      node: ProductVariant;
    }[];
  };
  seo: {
    title?: string;
    description?: string;
  };
}

export interface ProductsQueryResult {
  products: {
    edges: {
      node: Product;
      cursor: string;
    }[];
    pageInfo: {
      hasNextPage: boolean;
      hasPreviousPage: boolean;
      startCursor?: string;
      endCursor?: string;
    };
  };
}

export interface VendorsQueryResult {
  shop: {
    productVendors: {
      edges: {
        node: string;
      }[];
    };
  };
}

export interface ProductTypesQueryResult {
  shop: {
    productTypes: {
      edges: {
        node: string;
      }[];
    };
  };
}

export interface TagsQueryResult {
  shop: {
    productTags: {
      edges: {
        node: string;
      }[];
    };
  };
} 