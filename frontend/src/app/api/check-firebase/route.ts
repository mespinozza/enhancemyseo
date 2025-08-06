import { NextResponse } from 'next/server';
import { getApps } from 'firebase/app';
import { auth } from '@/lib/firebase/config';

export async function GET() {
  try {
    // Check if Firebase is initialized
    const apps = getApps();
    
    // Return configuration info (obscured for security)
    const config = {
      isInitialized: apps.length > 0,
      authProviders: auth.config.apiKey ? 'API key exists' : 'No API key',
      apiKeyFirstFiveChars: auth.config.apiKey ? auth.config.apiKey.substring(0, 5) + '...' : 'None',
      projectId: auth.app.options.projectId || 'None',
      environment: process.env.NODE_ENV,
      apiKeyFromEnv: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? 'Exists' : 'Not set',
    };
    
    return NextResponse.json({ success: true, config });
  } catch (error: unknown) {
    console.error('Firebase check failed:', error);
    return NextResponse.json(
      { error: 'Firebase initialization failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 