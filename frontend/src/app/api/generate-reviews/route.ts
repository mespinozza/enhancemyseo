import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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
  console.error('Error initializing Anthropic:', error);
}

export async function GET() {
  try {
    if (!anthropic) {
      return NextResponse.json({ 
        error: 'AI service not available. Please check API configuration.' 
      }, { status: 500 });
    }

    const prompt = `Generate 5 realistic customer testimonials for an AI-powered SEO content generation tool for e-commerce stores. Each testimonial should include:

1. A realistic first name and last name
2. A genuine-sounding testimonial about how the AI tool helped their business (focus on specific benefits like traffic increase, time savings, content quality, SEO improvements, etc.)
3. A business niche/category (like "Fashion & Accessories", "Health & Wellness", "Electronics", "Home & Garden", "Beauty & Cosmetics", "Sports & Fitness", "Pet Supplies", "Kitchen & Dining", etc.)
4. A rating between 4.5 and 5.0
5. A revenue range that alternates between "5-figure" and "6-figure"

Make the testimonials varied in length and tone, but all positive. Include specific metrics when possible (like "traffic increased by X%", "saved X hours per week", etc.). Avoid repetitive language.

Return the data as a JSON array with this exact structure:
[
  {
    "firstName": "string",
    "lastName": "string", 
    "rating": number,
    "text": "string",
    "storeType": "string",
    "revenueRange": "string"
  }
]

Generate diverse, authentic-sounding testimonials now:`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.8,
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

    // Extract JSON from the response
    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Could not find valid JSON in AI response');
    }

    const reviews = JSON.parse(jsonMatch[0]);

    // Validate the reviews structure
    if (!Array.isArray(reviews) || reviews.length !== 5) {
      throw new Error('Invalid reviews format from AI');
    }

    // Add IDs to reviews
    const reviewsWithIds = reviews.map((review, index) => ({
      id: index + 1,
      ...review
    }));

    return NextResponse.json({
      reviews: reviewsWithIds,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating reviews:', error);
    return NextResponse.json({
      error: 'Failed to generate reviews'
    }, { status: 500 });
  }
} 