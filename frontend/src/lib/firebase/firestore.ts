import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc, 
  query, 
  where,
  orderBy,
  serverTimestamp,
  increment,
  Timestamp 
} from 'firebase/firestore';
import { db } from './config';
import type { IntegrationType } from '@/types/content-selection';

// Base interface for all document types
interface BaseDocument {
  id?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Define common interfaces
export interface BrandProfile extends BaseDocument {
  userId: string;
  brandName: string;
  businessType: string;
  brandColor?: string;
  brandGuidelines?: string;
  websiteUrl?: string;
  shopifyStoreUrl?: string;
  shopifyAccessToken?: string;
  shopifyApiKey?: string;
  shopifyApiSecret?: string;
  socialMedia?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
  };
}

export interface Blog extends BaseDocument {
  userId: string;
  brandId: string;
  title: string;
  content?: string;
  status: 'draft' | 'published';
  keyword?: string;
  contentType?: string;
  toneOfVoice?: string;
  instructions?: string;
  generationSettings?: {
    usePerplexity: boolean;
    articleFraming: string;
  };
}

export interface GeneratedProduct extends BaseDocument {
  userId: string;
  productName: string;
  originalDescription?: string;
  optimizedDescription?: string;
  optimizedTitle?: string;
  keywords?: string[];
  seoScore?: number;
  recommendations?: string[];
  status: 'pending' | 'optimized' | 'published';
  shopifyProductId?: string;
}

export interface HistoryItem extends BaseDocument {
  userId: string;
  type: 'article' | 'keywords';
  title: string;
  // For articles
  content?: string;
  keyword?: string;
  // For keywords
  mainKeyword?: string;
  keywords?: Array<{
    keyword: string;
    relevance: string;
    searchVolume?: string;
    difficulty?: string;
  }>;
  // Legacy field
  details?: string;
}

export interface BlogPost extends BaseDocument {
  title: string;
  slug: string; // URL-friendly version
  content: string; // Rich HTML content
  metaDescription: string;
  featuredImage?: string;
  published: boolean;
  publishDate?: Date;
  authorId: string; // Admin who created it
  authorName: string; // Display name of author
  tags?: string[]; // For categorization
  viewCount?: number; // Track views
  showDate?: boolean; // Whether to display publish date
  showAuthor?: boolean; // Whether to display author info
}

// Generic operations for any collection
const createGenericOperations = <T extends BaseDocument>(collectionName: string) => {
  return {
    // Get all documents for a user
    getAll: async (userId: string): Promise<T[]> => {
      try {
        console.log(`Fetching ${collectionName} for user:`, userId);
        
        if (!userId) {
          console.error('No userId provided for query');
          throw new Error('User ID is required');
        }
        
        // Check if we're in a browser environment and have Firebase auth
        if (typeof window !== 'undefined') {
          const { auth } = await import('./config');
          if (!auth.currentUser) {
            console.error(`No authenticated user found when fetching ${collectionName}`);
            throw new Error('User must be authenticated');
          }
          
          // Ensure we have a valid token
          try {
            await auth.currentUser.getIdToken();
            console.log(`Auth token verified for ${collectionName} query`);
          } catch (tokenError) {
            console.error(`Failed to verify auth token for ${collectionName}:`, tokenError);
            throw new Error('Authentication token invalid');
          }
        }
        
        // Start with simple query without orderBy to avoid index requirements
        const q = query(
          collection(db, collectionName),
          where('userId', '==', userId)
        );
        
        console.log(`Executing query for ${collectionName}...`);
        const querySnapshot = await getDocs(q);
        
        const docs = querySnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        })) as T[];

        // Sort by createdAt in memory (works without indexes)
        const sortedDocs = docs.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });

        console.log(`Successfully fetched ${sortedDocs.length} documents from ${collectionName}`);
        return sortedDocs;
      } catch (error: unknown) {
        // Handle permission errors more gracefully - don't log generic error first
        const firebaseError = error as { code?: string; message?: string };
        if (firebaseError?.code === 'permission-denied') {
          // For generatedProducts, this is expected for new users - don't log as error
          if (collectionName === 'generatedProducts') {
            console.log(`${collectionName} collection not yet available for this user (this is normal for new users)`);
            return [];
          } else {
            console.error(`Permission denied for ${collectionName}. User may not be properly authenticated or may not own this data.`);
            return [];
          }
        } else if (firebaseError?.message?.includes('Missing or insufficient permissions')) {
          if (collectionName === 'generatedProducts') {
            console.log(`${collectionName} permissions not yet set up for this user (this is normal)`);
            return [];
          } else {
            console.error(`Firestore permissions error for ${collectionName}. Check authentication and Firestore rules.`);
            return [];
          }
        } else {
          // For other types of errors, log them normally
          console.error(`Error fetching ${collectionName}:`, error);
          return [];
        }
      }
    },

    // Get a document by ID
    getById: async (id: string): Promise<T | null> => {
      try {
        const docRef = doc(db, collectionName, id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          return { id: docSnap.id, ...docSnap.data() } as T;
        }
        return null;
      } catch (error) {
        console.error(`Error fetching ${collectionName} by ID:`, error);
        return null;
      }
    },

    // Create a new document
    create: async (data: Omit<T, 'id'>): Promise<T> => {
      try {
        const timestamp = serverTimestamp();
        const docRef = await addDoc(collection(db, collectionName), {
          ...data,
          createdAt: timestamp,
          updatedAt: timestamp
        });
        
        return { 
          id: docRef.id, 
          ...data,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        } as T;
      } catch (error) {
        console.error(`Error creating ${collectionName}:`, error);
        throw error;
      }
    },

    // Update a document
    update: async (id: string, data: Partial<T>): Promise<void> => {
      try {
        const docRef = doc(db, collectionName, id);
        await updateDoc(docRef, {
          ...data,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error(`Error updating ${collectionName}:`, error);
        throw error;
      }
    },

    // Delete a document
    delete: async (id: string): Promise<void> => {
      try {
        const docRef = doc(db, collectionName, id);
        await deleteDoc(docRef);
      } catch (error) {
        console.error(`Error deleting ${collectionName}:`, error);
        throw error;
      }
    }
  };
};

// Utility function to initialize collections for new users
export const initializeUserCollections = async (userId: string) => {
  if (!userId) return;
  
  try {
    console.log('Initializing collections for user:', userId);
    
    // This will ensure the user has access to all collections
    // by creating empty placeholder documents if needed
    const collections = ['brandProfiles', 'blogs', 'history', 'generatedProducts'];
    
    for (const collectionName of collections) {
      try {
        // Try to query the collection to see if user has access
        const q = query(
          collection(db, collectionName),
          where('userId', '==', userId)
        );
        await getDocs(q);
        console.log(`Collection ${collectionName} accessible for user`);
      } catch {
        console.log(`Collection ${collectionName} not yet accessible, this is normal for new users`);
      }
    }
  } catch (error) {
    console.warn('Error initializing user collections:', error);
  }
};

// Create operations for specific collections
export const brandProfileOperations = {
  async create(userId: string, data: Omit<BrandProfile, 'id'>) {
    try {
      // CHANGE: Create in the root 'brandProfiles' collection
      const docRef = await addDoc(collection(db, 'brandProfiles'), {
        ...data,
        userId: userId, // Ensure userId is explicitly set
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    } catch (error: unknown) {
      console.error('Error creating brand profile:', error);
      throw error;
    }
  },

  async getAll(userId: string): Promise<BrandProfile[]> {
    try {
      // CHANGE: Query the root 'brandProfiles' collection and filter by 'userId'
      const profilesRef = collection(db, 'brandProfiles');
      const q = query(profilesRef, where('userId', '==', userId), orderBy('createdAt', 'desc'));
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as BrandProfile));
    } catch (error) {
      console.error('❌ Error getting brand profiles:', error);
      return [];
    }
  },

  async update(userId: string, id: string, data: Partial<BrandProfile>): Promise<void> {
    try {
      // CHANGE: Update in the root 'brandProfiles' collection
      const docRef = doc(db, 'brandProfiles', id);
      // First verify the profile belongs to the user
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().userId === userId) {
        await updateDoc(docRef, {
          ...data,
          updatedAt: serverTimestamp(),
        });
      } else {
        throw new Error('Profile not found or access denied');
      }
    } catch (error) {
      console.error('Error updating brand profile:', error);
      throw error;
    }
  },

  async delete(userId: string, id: string): Promise<void> {
    try {
      // CHANGE: Delete from the root 'brandProfiles' collection
      const docRef = doc(db, 'brandProfiles', id);
      // First verify the profile belongs to the user
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().userId === userId) {
        await deleteDoc(docRef);
      } else {
        throw new Error('Profile not found or access denied');
      }
    } catch (error) {
      console.error('Error deleting brand profile:', error);
      throw error;
    }
  }
};

export const blogOperations = {
  // Get all blog posts (with optional published filter) - for articles system
  getAll: async (uid: string, publishedOnly: boolean = false): Promise<Blog[]> => {
    try {
      // CHANGE: Query the root 'blogs' collection and filter by 'userId'
      const blogsRef = collection(db, 'blogs');
      let q = query(blogsRef, where('userId', '==', uid), orderBy('createdAt', 'desc'));
      
      if (publishedOnly) {
        q = query(blogsRef, where('userId', '==', uid), where('published', '==', true), orderBy('publishDate', 'desc'));
      }
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Blog));
    } catch (error) {
      console.error('Error getting blog posts:', error);
      return [];
    }
  },

  // Get all blog posts (with optional published filter) - for blog management
  getAllBlogPosts: async (uid: string, publishedOnly: boolean = false): Promise<BlogPost[]> => {
    try {
      // CHANGE: Query the root 'blogs' collection and filter by 'userId'
      const blogsRef = collection(db, 'blogs');
      let q = query(blogsRef, where('userId', '==', uid), orderBy('createdAt', 'desc'));
      
      if (publishedOnly) {
        q = query(blogsRef, where('userId', '==', uid), where('published', '==', true), orderBy('publishDate', 'desc'));
      }
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as BlogPost));
    } catch (error) {
      console.error('Error getting blog posts:', error);
      return [];
    }
  },

  // Get blog post by slug (for public viewing)
  getBySlug: async (slug: string): Promise<BlogPost | null> => {
    try {
      console.log('🔍 Searching for blog with slug:', slug);
      
      // CHANGE: Search in root 'blogs' collection instead of user subcollections
      const blogsRef = collection(db, 'blogs');
      
      // First try: published blogs only
      const publishedQuery = query(
        blogsRef, 
        where('slug', '==', slug), 
        where('published', '==', true)
      );
      const publishedSnapshot = await getDocs(publishedQuery);
      
      console.log('📊 Published blogs found:', publishedSnapshot.size);
      
      if (!publishedSnapshot.empty) {
        const doc = publishedSnapshot.docs[0];
        const data = doc.data();
        console.log('✅ Found published blog:', { id: doc.id, title: data.title, published: data.published });
        return {
          id: doc.id,
          ...data
        } as BlogPost;
      }
      
      // Fallback: search for any blog with this slug (for debugging)
      const allQuery = query(blogsRef, where('slug', '==', slug));
      const allSnapshot = await getDocs(allQuery);
      
      console.log('📊 Total blogs with slug found:', allSnapshot.size);
      
      if (!allSnapshot.empty) {
        const doc = allSnapshot.docs[0];
        const data = doc.data();
        console.log('⚠️ Found unpublished blog:', { 
          id: doc.id, 
          title: data.title, 
          published: data.published,
          publishedType: typeof data.published 
        });
        
        // If blog exists but isn't published correctly, return null but log the issue
        if (data.published === true) {
          // This should have been caught by the first query - possible indexing issue
          console.log('🚨 Blog is published but wasn\'t found in published query - possible indexing issue');
          return {
            id: doc.id,
            ...data
          } as BlogPost;
        } else {
          console.log('❌ Blog exists but is not published:', data.published);
        }
      }
      
      console.log('❌ No blog found with slug:', slug);
      return null;
    } catch (error) {
      console.error('Error getting blog post by slug:', error);
      return null;
    }
  },

  // Get all published blogs for sitemap
  getAllPublished: async (): Promise<BlogPost[]> => {
    try {
      // CHANGE: Query root 'blogs' collection directly instead of user subcollections
      const blogsRef = collection(db, 'blogs');
      const q = query(
        blogsRef, 
        where('published', '==', true), 
        orderBy('publishDate', 'desc')
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as BlogPost));
    } catch (error) {
      console.error('Error getting all published blogs:', error);
      return [];
    }
  },

  // Create a new blog post
  create: async (uid: string, data: Partial<BlogPost>): Promise<string> => {
    try {
      // CHANGE: Create in the root 'blogs' collection
      const blogsRef = collection(db, 'blogs');
      const docRef = await addDoc(blogsRef, {
        ...data,
        userId: uid, // Ensure userId is explicitly set for new creations
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating blog post:', error);
      throw error;
    }
  },

  // Update a blog (for articles system - expects Blog interface)
  updateBlog: async (uid: string, id: string, data: Partial<Blog>): Promise<void> => {
    try {
      // CHANGE: Update in the root 'blogs' collection
      const docRef = doc(db, 'blogs', id);
      
      // Filter out undefined fields to prevent Firebase errors
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      );
      
      const updateData = {
        ...cleanData,
        updatedAt: serverTimestamp()
      };
      await updateDoc(docRef, updateData);
    } catch (error) {
      console.error('Error updating blog:', error);
      throw error;
    }
  },

  // Update a blog post (for publishing system - expects BlogPost interface)
  update: async (uid: string, id: string, data: Partial<BlogPost>): Promise<void> => {
    try {
      // CHANGE: Update in the root 'blogs' collection
      const docRef = doc(db, 'blogs', id);
      
      // Filter out undefined fields to prevent Firebase errors
      const cleanData = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      );
      
      await updateDoc(docRef, {
        ...cleanData,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error updating blog post:', error);
      throw error;
    }
  },

  // Delete a blog post
  delete: async (uid: string, id: string): Promise<void> => {
    try {
      // CHANGE: Delete from the root 'blogs' collection
      const docRef = doc(db, 'blogs', id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting blog post:', error);
      throw error;
    }
  },

  // Generate URL-friendly slug from title
  generateSlug: (title: string): string => {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  },

  // Check if slug is unique
  isSlugUnique: async (uid: string, slug: string, excludeId?: string): Promise<boolean> => {
    try {
      // CHANGE: Query the root 'blogs' collection and filter by 'userId'
      const blogsRef = collection(db, 'blogs');
      const q = query(blogsRef, where('userId', '==', uid), where('slug', '==', slug));
      const snapshot = await getDocs(q);
      
      if (excludeId) {
        return snapshot.docs.every(doc => doc.id === excludeId);
      }
      
      return snapshot.empty;
    } catch (error) {
      console.error('Error checking slug uniqueness:', error);
      return false;
    }
  },

  // Get blog by ID (for articles system - returns Blog interface)
  getBlogById: async (uid: string, id: string): Promise<Blog | null> => {
    try {
      // CHANGE: Get from the root 'blogs' collection
      const docRef = doc(db, 'blogs', id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        // Verify this blog belongs to the user
        if (data.userId === uid) {
          return {
            id: docSnap.id,
            ...data
          } as Blog;
        } else {
          return null; // Blog doesn't belong to this user
        }
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error getting blog by ID:', error);
      return null;
    }
  },

  // Get blog post by ID
  getById: async (uid: string, id: string): Promise<BlogPost | null> => {
    try {
      // CHANGE: Get from the root 'blogs' collection
      const docRef = doc(db, 'blogs', id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        // Verify this blog belongs to the user
        if (data.userId === uid) {
          return {
            id: docSnap.id,
            ...data
          } as BlogPost;
        } else {
          return null; // Blog doesn't belong to this user
        }
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error getting blog post by ID:', error);
      return null;
    }
  },

  // Increment view count
  incrementViews: async (uid: string, id: string): Promise<void> => {
    try {
      // CHANGE: Update in the root 'blogs' collection
      const docRef = doc(db, 'blogs', id);
      // First verify the blog belongs to the user
      const docSnap = await getDoc(docRef);
      if (docSnap.exists() && docSnap.data().userId === uid) {
        await updateDoc(docRef, {
          viewCount: increment(1)
        });
      }
    } catch (error) {
      console.error('Error incrementing view count:', error);
    }
  }
};
export const generatedProductOperations = createGenericOperations<GeneratedProduct>('generatedProducts');
export const historyOperations = createGenericOperations<HistoryItem>('history'); 

// New: Integration detection utilities
export function detectIntegrationType(brandProfile: BrandProfile): IntegrationType {
  const hasShopify = !!(brandProfile.shopifyStoreUrl && brandProfile.shopifyAccessToken);
  const hasWebsite = !!brandProfile.websiteUrl;
  
  if (hasShopify && hasWebsite) return 'both';
  if (hasShopify) return 'shopify';
  if (hasWebsite) return 'website';
  return 'none';
}

export function getIntegrationCapabilities(brandProfile: BrandProfile) {
  const integrationType = detectIntegrationType(brandProfile);
  
  return {
    integrationType,
    canSearchProducts: integrationType === 'shopify' || integrationType === 'both',
    canSearchCollections: integrationType === 'shopify' || integrationType === 'both',
    canSearchShopifyPages: integrationType === 'shopify' || integrationType === 'both',
    canSearchWebsitePages: integrationType === 'website' || integrationType === 'both',
    hasAnyIntegration: integrationType !== 'none'
  };
}

export function getAvailableContentTypes(brandProfile: BrandProfile) {
  const { integrationType } = getIntegrationCapabilities(brandProfile);
  
  const contentTypes = [];
  
  if (integrationType === 'shopify' || integrationType === 'both') {
    contentTypes.push(
      { key: 'includeProducts', label: 'Products', source: 'shopify' },
      { key: 'includeCollections', label: 'Collections', source: 'shopify' },
      { key: 'includePages', label: 'Shopify Pages', source: 'shopify' }
    );
  }
  
  if (integrationType === 'website' || integrationType === 'both') {
    contentTypes.push(
      { key: 'includeProductPages', label: 'Product Pages', source: 'website' },
      { key: 'includeServicePages', label: 'Service Pages', source: 'website' },
      { key: 'includeBlogPages', label: 'Blog/Resource Pages', source: 'website' },
      { key: 'includeCategoryPages', label: 'Category Pages', source: 'website' }
    );
  }
  
  return contentTypes;
} 