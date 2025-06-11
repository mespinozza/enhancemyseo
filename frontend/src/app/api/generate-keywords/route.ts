import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserSubscriptionStatus } from '@/lib/firebase/admin-users';
import { serverSideUsageUtils } from '@/lib/server-usage-utils';

// Initialize Firebase Admin if not already initialized
initializeFirebaseAdmin();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
});

export async function POST(request: Request) {
  try {
    // Get the user's ID token from the Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let verifiedUser;
    
    try {
      // Verify the ID token
      verifiedUser = await getAuth().verifyIdToken(idToken);
      if (!verifiedUser.uid) {
        throw new Error('Invalid token');
      }
      console.log('User authenticated successfully:', verifiedUser.uid);
    } catch (error) {
      console.error('Error verifying token:', error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // CRITICAL: Server-side usage verification
    console.log('Verifying usage limits for user:', verifiedUser.uid);
    try {
      // Get user's subscription status from Firestore
      const subscriptionStatus = await getUserSubscriptionStatus(verifiedUser.uid, verifiedUser.email || null);
      console.log('User subscription status:', subscriptionStatus);
      
      // Get Firestore admin instance
      const adminFirestore = getFirestore();
      
      // Check if user can perform this action
      const usageCheck = await serverSideUsageUtils.canPerformAction(
        verifiedUser.uid,
        subscriptionStatus,
        'keywords',
        adminFirestore
      );
      
      if (!usageCheck.canPerform) {
        console.log('Usage limit exceeded for user:', verifiedUser.uid, usageCheck.reason);
        return NextResponse.json({ 
          error: usageCheck.reason || 'Usage limit exceeded' 
        }, { status: 429 });
      }
      
      console.log('Usage verification passed for user:', verifiedUser.uid);
    } catch (error) {
      console.error('Error verifying usage limits:', error);
      return NextResponse.json({ 
        error: 'Unable to verify usage limits' 
      }, { status: 500 });
    }

    const body = await request.json();
    const {
      baseKeyword,
      brandName,
      businessType,
      brandGuidelines,
    } = body;

    // Validate required fields
    if (!baseKeyword || !brandName || !businessType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const userPrompt = `
      Generate a list of 10 SEO-optimized keywords based on the base keyword: "${baseKeyword}"
      
      Consider that this is for a ${businessType} business named "${brandName}".
      ${brandGuidelines ? `\nConsider these brand guidelines:\n${brandGuidelines}` : ''}
      
      For each keyword, provide:
      1. The keyword itself
      2. Its relevance to the business and target audience
      3. Estimated search volume (Low/Medium/High)
      4. SEO difficulty (Easy/Medium/Hard)
      
      Format each keyword as a JSON object with these properties:
      {
        "keyword": "string",
        "relevance": "string explanation",
        "searchVolume": "string",
        "difficulty": "string"
      }
      
      Return the list as a JSON array of these objects.
    `;

    // Generate keywords using Claude
    const message = await anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: userPrompt
        }
      ]
    });

    // Parse the response as JSON
    const keywordsText = message.content[0].type === 'text' ? message.content[0].text : '';
    const keywordsMatch = keywordsText.match(/\[[\s\S]*\]/);
    if (!keywordsMatch) {
      throw new Error('Invalid response format from AI');
    }

    const keywords = JSON.parse(keywordsMatch[0]);

    // CRITICAL: Increment usage count after successful generation
    console.log('Incrementing usage count for user:', verifiedUser.uid);
    try {
      const adminFirestore = getFirestore();
      await serverSideUsageUtils.incrementUsage(verifiedUser.uid, 'keywords', adminFirestore);
      console.log('Usage count incremented successfully');
    } catch (usageError) {
      console.error('Error incrementing usage count:', usageError);
      // Continue execution - don't fail the request for usage tracking errors
    }

    return NextResponse.json({
      keywords
    });

  } catch (error) {
    console.error('Error generating keywords:', error);
    return NextResponse.json(
      { error: 'Failed to generate keywords' },
      { status: 500 }
    );
  }
} 