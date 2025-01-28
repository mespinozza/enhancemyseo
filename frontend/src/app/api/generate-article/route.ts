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
      blogId,
      keyword,
      brandName,
      businessType,
      contentType,
      toneOfVoice,
      instructions,
      brandGuidelines,
    } = body;

    // Validate required fields
    if (!blogId || !keyword || !brandName || !businessType || !contentType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Construct the prompt based on the enhancemyseo.py logic
    const userPrompt = `
      DO NOT START WITH ANYTHING EXCEPT <H1>. Start every page off immediately, do not chat back to me in anyway.
      You are writing for ${brandName}. Write from the perspective of this brand.
      DO NOT INCLUDE ANY EXTERNAL LINKS TO COMPETITORS.
      Start writing immediately with <h1>
      DO NOT START BY TALKING TO ME.

      Please write a long-form SEO-optimized article with 1500 words about the following keyword: ${keyword}.
      Answer in HTML, starting with one single <h1> tag, as this is going on wordpress, do not give unnecessary HTML tags.
      Please use a lot of formatting, tables are great for ranking on Google.
      Always include a key takeaways table at the top giving the key information for this topic at the very top of the article.

      The article should be written in a ${toneOfVoice || 'professional'} tone and framed as ${contentType}.
      
      ${brandGuidelines ? `Incorporate the brand guidelines:\n${brandGuidelines}` : ''}
      
      This is a ${businessType} so write from the perspective of that business.
      ${instructions ? `Additional instructions:\n${instructions}` : ''}
    `;

    // Generate content using Claude
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

    const generatedContent = message.content[0].text;

    // Extract title from the first <h1> tag
    const titleMatch = generatedContent.match(/<h1>(.*?)<\/h1>/);
    const title = titleMatch ? titleMatch[1] : `${keyword} - ${contentType}`;

    return NextResponse.json({
      title,
      content: generatedContent,
    });

  } catch (error) {
    console.error('Error generating article:', error);
    return NextResponse.json(
      { error: 'Failed to generate article' },
      { status: 500 }
    );
  }
} 