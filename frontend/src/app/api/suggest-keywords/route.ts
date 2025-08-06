import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

// Initialize Anthropic client
let anthropic: Anthropic | null = null;

try {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  anthropic = new Anthropic({
    apiKey: anthropicKey,
  });
} catch (error) {
  console.error('Error initializing Anthropic client:', error);
}

export async function POST(request: Request) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // CRITICAL: Admin access control - only admin users can suggest keywords
    // Import the server subscription utils
    const { getServerUserSubscriptionStatus } = await import('@/lib/firebase/server-admin-utils');
    const subscriptionStatus = await getServerUserSubscriptionStatus(decodedToken.uid, decodedToken.email || null);
    
    if (subscriptionStatus !== 'admin') {
      console.log('Access denied for non-admin user:', decodedToken.uid, 'Subscription:', subscriptionStatus);
      return NextResponse.json({ 
        error: 'Access denied. Keyword suggestions are only available to administrators.' 
      }, { status: 403 });
    }

    if (!anthropic) {
      return NextResponse.json({ 
        error: 'AI service not available. Please check API configuration.' 
      }, { status: 500 });
    }

    const body = await request.json();
    const { baseKeywords, brandName, businessType, brandGuidelines } = body;

    if (!baseKeywords || !Array.isArray(baseKeywords) || baseKeywords.length === 0) {
      return NextResponse.json({ error: 'At least one base keyword is required' }, { status: 400 });
    }

    // Generate keyword suggestions using Anthropic
    const keywordList = baseKeywords.join('", "');
    const prompt = `You are an expert SEO keyword strategist. Based on the existing keywords "${keywordList}", generate 6-8 additional related keywords that would make excellent blog article topics.

Brand Context:
- Brand Name: ${brandName || 'Not specified'}
- Business Type: ${businessType || 'Not specified'}
- Brand Guidelines: ${brandGuidelines || 'None provided'}

Existing Keywords: ${baseKeywords.join(', ')}

Requirements:
1. Generate keywords that are semantically related to the existing keywords: "${keywordList}"
2. Focus on keywords that would make good blog article topics
3. Consider the brand's business type and target audience
4. Mix of short-tail and long-tail keywords
5. Ensure keywords are search-friendly and have commercial intent
6. Avoid duplicating any of the existing keywords exactly
7. Create complementary keywords that expand on the existing themes

Format: Return ONLY a simple comma-separated list of keywords, no numbering, no additional text.

Example format: keyword one, keyword two, keyword three

Generate related keywords now:`;

    const response = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      temperature: 0.7,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format from AI');
    }

    // Parse the keywords from the response
    const suggestedKeywords = content.text
      .split(',')
      .map(keyword => keyword.trim())
      .filter(keyword => keyword.length > 0)
      .slice(0, 8); // Limit to 8 suggestions

    return NextResponse.json({
      suggestions: suggestedKeywords,
      baseKeywords
    });

  } catch (error) {
    console.error('Error generating keyword suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to generate keyword suggestions' },
      { status: 500 }
    );
  }
} 