import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';

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
    
    try {
      // Verify the ID token
      const decodedToken = await getAuth().verifyIdToken(idToken);
      if (!decodedToken.uid) {
        throw new Error('Invalid token');
      }
    } catch (error) {
      console.error('Error verifying token:', error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
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