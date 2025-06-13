import { 
  doc, 
  collection, 
  getDocs, 
  getDoc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  Timestamp,
  DocumentData,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './config';

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
      } catch (error: any) {
        // Handle permission errors more gracefully - don't log generic error first
        if (error?.code === 'permission-denied') {
          // For generatedProducts, this is expected for new users - don't log as error
          if (collectionName === 'generatedProducts') {
            console.log(`${collectionName} collection not yet available for this user (this is normal for new users)`);
            return [];
          } else {
            console.error(`Permission denied for ${collectionName}. User may not be properly authenticated or may not own this data.`);
            return [];
          }
        } else if (error?.message?.includes('Missing or insufficient permissions')) {
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
      } catch (error: any) {
        console.log(`Collection ${collectionName} not yet accessible, this is normal for new users`);
      }
    }
  } catch (error) {
    console.warn('Error initializing user collections:', error);
  }
};

// Create operations for specific collections
export const brandProfileOperations = createGenericOperations<BrandProfile>('brandProfiles');
export const blogOperations = createGenericOperations<Blog>('blogs');
export const generatedProductOperations = createGenericOperations<GeneratedProduct>('generatedProducts');
export const historyOperations = createGenericOperations<HistoryItem>('history'); 