import { App, cert, getApps, initializeApp } from 'firebase-admin/app';

// Check if running in development mode
const isDev = process.env.NODE_ENV === 'development';

// Function to initialize Firebase Admin SDK
export function initializeFirebaseAdmin(): App {
  // If Firebase Admin is already initialized, return it
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // Check for environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Log environment variable status for debugging
  console.log('Firebase Admin SDK initialization:', {
    projectId: projectId ? 'Set' : 'Not set',
    clientEmail: clientEmail ? 'Set' : 'Not set',
    privateKey: privateKey ? 'Set (length: ' + privateKey.length + ')' : 'Not set',
    isDev
  });

  // In development or if missing required environment variables, use a mock configuration
  if (isDev || !projectId || !clientEmail || !privateKey) {
    console.warn('Using development/fallback Firebase admin credentials');
    
    try {
      // Fallback project ID should match the client-side projectId for consistency
      const fallbackProjectId = 'plzenhancemyseo';
      
      return initializeApp({
        projectId: projectId || fallbackProjectId,
        credential: cert({
          projectId: projectId || fallbackProjectId,
          clientEmail: clientEmail || 'firebase-adminsdk-fbsvc@plzenhancemyseo.iam.gserviceaccount.com',
          // Use a simplified placeholder private key for development only
          privateKey: (privateKey || '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCT0xLygOadj1lN\ncLptuzZuRir/jjDJzT6oRrKFC3+U7QiObATw+E8A4sRBoWXOhnvJ42MaEiokqi3U\nML+vdprY4ki8uMLXLeP/mLg6AAOHW9fgUOCxMFY4PZ3rXs3i+TrQGR+7bCR0sU+q\nqoYKYbbI3DnEZACYdLMlR57c3ZzBWI7pRyhbUtOpsP4PVgs/9JCFaVew4kXNlp0U\ncaFjJ6cwnrgvtSq+fOqBpyaEkTXL+fzwJ5AAoJWxnZk9RkBhI9LcewxeIM2Cg6zl\naJeRbuIkl3cIJKwa4BGdqiNggddc/qI8ZW2x/S/mbNTOzS5IqctTw7JOkdPUN6e+\n4SA2JeY9AgMBAAECggEAF/5GQMSxycia3NIrfESK/uaWM5ETc6nD3gHNl4EohdZc\nUWuQeMFA53qnEqT89oLHBFuLOg/RNc7Gbf60mij01LeTyUfu3gi1jUavPkDC0d1T\nInZWJgRbtjiwEWQ7pDfCN0UgrKXOm/8smF2hsH0wMxVlre3yV8x3SFmB3ET/HLWB\nDgLcnvmNVrlTh4KMiqj/zIZksQXYQZImY0n1X6eQZNPo5HBBRe3W9rRWO10Y4iEY\nB0IbsAxYz0BgLdM0YqrYB8J0VQQMpaXv+QP7kHxb8gCfGb/xM9Vg5g2xBDjfhe5n\nR+miTyNkSeHMFeegqY9U43xW0/oQdo3yl48OgFcjeQKBgQDNB06nas7U4o8nLn6R\nIZJw56T+LR3dzArqU3Or5hVN+f4gdLitfc5v8H9n1jXakVPinmG6X4QKWTfO0acO\nmnE23vVxE7SPz9pr8inBeqto27o23EWxfpg/ybh8RziXlYulmRW15icQLENGQ+X9\n/Kwtem5sPdfhlnLOweczBKNJxQKBgQC4kxz9ukKD3sqd4xWBwTWYfrwblPlKmt/z\nGMceq17wRMDDnnz38Ed0BqJPdaR+f7nT0g+yCx9+8VdJT7/xlpVgP8PT971YxhlG\nE9ONcHd/dgLboAtbxZUfClyjWj5xheHRxi36QtDTODnWpxFQspwec7aga8KOtLgY\nTPaamyoKGQKBgQC9Z7W6pcoDEnVKrgIQkuIU2XorsYQ4xOmEhamDMN+XlI22b/23\nkFQoRxV72IERtFW5MbV4lgqGANu0fSuGKxjRpvE5EAorHMpcFG+MpIU7Lll9msnr\nada+ftymOqlGJ8nFJoHO85o8r5dKjykmFMj+jm76IbuQVAslhC3QjMVIPQKBgA5y\npZBO5ioAZIfbYLGZeCKJuRvHm4P1f5Y92EhUTcgs+ZHWdB3MVyuD4Wyq3sdwJBGq\nncPoDv0W0yhP78xvZx3zn9aVy+KJDy1nG+Y0aYY2rJ6YdosmejfFzd6Tj9O/ESAk\njTDLziDag9yDk11nvcS8dg00ojQdfVOZoqwTfUTxAoGBAKqTZjsvJvFy4LbTnRQ9\nqWKZDKm7EZjC3hwpu+OiUTXDSVvpcy+1Xnl6IBm8TzJXBWt+uEc0oyWZ4D6cfo4x\nhBCchBeCAkontZv/0arGNMB9X0ruSl57XBq3AAhycMUFLsO/76d7irwLkyPTDAN8\nXl4GkAys6ln72fBhQM0wyrA4\n-----END PRIVATE KEY-----\n').replace(/\\n/g, '\n')
        }),
      });
    } catch (error) {
      console.error('Error initializing Firebase admin (fallback mode):', error);
      
      // Create a basic app configuration as ultimate fallback
      return initializeApp({
        projectId: 'plzenhancemyseo',
      });
    }
  }

  // For production with all environment variables available
  try {
    return initializeApp({
      credential: cert({
        projectId: projectId,
        clientEmail: clientEmail, 
        privateKey: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
      }),
    });
  } catch (error) {
    console.error('Error initializing Firebase admin with production credentials:', error);
    throw error;
  }
} 