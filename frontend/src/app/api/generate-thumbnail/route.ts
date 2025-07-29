import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Initialize Firebase Admin if not already initialized
    initializeFirebaseAdmin();
    const decodedToken = await getAuth().verifyIdToken(token);
    
    if (!decodedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if user is admin
    const customClaims = decodedToken.customClaims || {};
    const subscriptionStatus = customClaims.subscription_status;
    
    if (subscriptionStatus !== 'admin') {
      return NextResponse.json({ 
        error: 'Access denied. This feature is only available to administrators.' 
      }, { status: 403 });
    }

    const body = await request.json();
    const { articleTitle, articleId, shopifyStoreUrl, shopifyAccessToken } = body;

    if (!articleTitle || !articleId || !shopifyStoreUrl || !shopifyAccessToken) {
      return NextResponse.json({ 
        error: 'Article title, ID, Shopify store URL and access token are required' 
      }, { status: 400 });
    }

    // Clean the store URL to ensure proper format
    const cleanStoreUrl = shopifyStoreUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Generate the detailed prompt
    const prompt = `Create a cinematic, hyper-realistic horizontal image (16:9 aspect ratio) inspired by the article title: "${articleTitle}".

Visually interpret the core subject of the article as a realistic, immersive scene — one that feels like a still frame pulled from a high-end documentary or feature film. The setting should be authentic and grounded in the real world, using photo-realistic textures, lighting, and environmental cues to tell a story at a glance.

Scene Composition & Atmosphere:

Primary Subject: Place the focus of the article (equipment, person, object, or moment) at the heart of the scene. Ensure it's mid-use, mid-repair, or in active demonstration — not staged — to show context, emotion, and utility.

Environment: Choose a realistic setting that matches the topic (e.g., a dimly lit commercial kitchen, a dusty workbench, an outdoor industrial zone). Include background elements that feel lived-in: tools on the counter, scuff marks on walls, flickering monitor lights, open manuals, or greasy fingerprints.

Natural Imperfections: Incorporate subtle blemishes and wear — scratched surfaces, smudges on glass, faded labels, lint on fabric, rust spots, chipped paint, fingerprints, or condensation on metal — to enhance realism and depth.

Lighting & Mood: Use cinematic lighting to establish the mood — cool metallic tones for technical articles, warm amber hues for people-focused scenes, sharp chiaroscuro for high-stakes repair or breakdowns. Backlighting, reflections, and soft shadows should add texture and realism.

Depth of Field: Keep the central subject in sharp focus while allowing background elements to blur softly. Use shallow depth to emphasize the scene's realism and complexity without overwhelming it.

Optional Details for Storytelling Enhancement:

Include diagrams, manuals, or UI screens if the article suggests technical guidance or digital tools.

Depict hands mid-action — turning a valve, typing code, wiping sweat, tightening a bolt — to show human interaction with the topic.

Show signs of time and use — aging equipment, dust layers, steam vapor, or subtle wear in clothing and surfaces.

Ensure the scene feels emotionally engaging and technically rich. It should visually explain the article's title at a glance, even without text.`;

    // Generate image using GPT-4o
    let imageUrl: string;
    
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: `Generate a 16:9 aspect ratio (1792x1024) HD quality image: ${prompt}`
          }
        ],
        max_tokens: 4000,
        // Image generation parameters for GPT-4o
        response_format: 'url' // This may be different for GPT-4o
      }),
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      console.error('GPT-4o API error:', errorData);
      
      // Fallback to DALL-E 3 if GPT-4o is not available yet
      console.log('Falling back to DALL-E 3...');
      const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: prompt,
          n: 1,
          size: '1792x1024',
          quality: 'hd',
          response_format: 'url'
        }),
      });

      if (!dalleResponse.ok) {
        const dalleErrorData = await dalleResponse.json();
        console.error('DALL-E 3 fallback error:', dalleErrorData);
        return NextResponse.json({ 
          error: 'Failed to generate image with both GPT-4o and DALL-E 3' 
        }, { status: 500 });
      }

      const dalleData = await dalleResponse.json();
      imageUrl = dalleData.data[0].url;
    } else {
      const responseData = await openaiResponse.json();
      
      // Handle GPT-4o response format
      if (responseData.choices?.[0]?.message?.image_url) {
        // If GPT-4o returns image_url directly
        imageUrl = responseData.choices[0].message.image_url;
      } else if (responseData.choices?.[0]?.message?.content) {
        // If GPT-4o returns content with image data or URL
        const content = responseData.choices[0].message.content;
        
        // Try to extract URL from content
        const urlMatch = content.match(/https?:\/\/[^\s]+\.(jpg|jpeg|png|webp)/i);
        if (urlMatch) {
          imageUrl = urlMatch[0];
        } else {
          console.error('No image URL found in GPT-4o response:', content);
          return NextResponse.json({ 
            error: 'Failed to extract image from GPT-4o response' 
          }, { status: 500 });
        }
      } else if (responseData.data?.[0]?.url) {
        // If GPT-4o uses similar format to DALL-E
        imageUrl = responseData.data[0].url;
      } else {
        console.error('Unexpected GPT-4o response format:', responseData);
        return NextResponse.json({ 
          error: 'Unexpected response format from GPT-4o' 
        }, { status: 500 });
      }
    }

    // Download the generated image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download generated image');
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');

    // Upload image to Shopify
    const shopifyImageResponse = await fetch(`https://${cleanStoreUrl}/admin/api/2023-10/articles/${articleId}.json`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': shopifyAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        article: {
          id: articleId,
          image: {
            attachment: imageBase64,
            alt: articleTitle,
            filename: `${articleTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`
          }
        }
      }),
    });

    if (!shopifyImageResponse.ok) {
      const errorText = await shopifyImageResponse.text();
      console.error('Failed to upload image to Shopify:', errorText);
      return NextResponse.json({ 
        error: 'Failed to upload image to Shopify article' 
      }, { status: 400 });
    }

    const updatedArticle = await shopifyImageResponse.json();

    return NextResponse.json({ 
      success: true,
      message: 'Thumbnail generated and uploaded successfully',
      imageUrl: updatedArticle.article.image?.src,
      articleId: articleId
    });

  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 