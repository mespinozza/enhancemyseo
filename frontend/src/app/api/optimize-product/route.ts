import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productName, originalTitle, originalDescription, brandName, businessType, brandGuidelines } = body;

    // Validate required fields
    if (!productName || !originalDescription || !brandName) {
      return NextResponse.json(
        { error: 'Missing required fields: productName, originalDescription, brandName' },
        { status: 400 }
      );
    }

    // Generate optimized product content
    const optimizedData = generateOptimizedProduct({
      productName,
      originalTitle: originalTitle || productName,
      originalDescription,
      brandName,
      businessType: businessType || 'business',
      brandGuidelines: brandGuidelines || ''
    });

    return NextResponse.json(optimizedData);
  } catch (error) {
    console.error('Product optimization error:', error);
    return NextResponse.json(
      { error: 'Failed to optimize product' },
      { status: 500 }
    );
  }
}

function generateOptimizedProduct(data: {
  productName: string;
  originalTitle: string;
  originalDescription: string;
  brandName: string;
  businessType: string;
  brandGuidelines: string;
}) {
  const { productName, originalDescription, brandName, businessType } = data;

  // Extract keywords from various sources
  const brandWords = brandName.toLowerCase().split(/\s+/);
  const businessWords = businessType.toLowerCase().split(/\s+/);

  // Common SEO keywords for products
  const commonKeywords = ['premium', 'quality', 'best', 'professional', 'authentic', 'reliable', 'superior', 'exclusive'];
  
  // Generate relevant keywords (remove duplicates and common words)
  const allWords = [...brandWords, ...businessWords, ...commonKeywords];
  const keywords = allWords
    .filter((word, index, arr) => arr.indexOf(word) === index)
    .filter(word => word.length > 2)
    .slice(0, 8);

  // Generate optimized title
  const optimizedTitle = `Premium ${productName} - ${brandName} | Professional ${businessType} Solutions`;

  // Generate optimized description with SEO enhancements
  const optimizedDescription = `
${originalDescription}

Experience the exceptional quality of ${productName} from ${brandName}, your trusted ${businessType} partner. Our premium products are meticulously designed with attention to detail and crafted to exceed your expectations. 

✓ Professional-grade ${productName.toLowerCase()}
✓ Backed by ${brandName}'s commitment to excellence
✓ Superior quality and customer satisfaction guaranteed
✓ Perfect for professional ${businessType} applications

With ${brandName}, you can trust that every ${productName.toLowerCase()} delivers outstanding results. Our dedication to innovation and customer success makes us the preferred choice for discerning customers who demand the best.

Choose ${brandName} for your ${productName.toLowerCase()} needs and experience the difference that quality makes.
  `.trim();

  // Calculate SEO score based on various factors
  const titleLength = optimizedTitle.length;
  const keywordDensity = keywords.length;
  const hasStructuredContent = optimizedDescription.includes('✓');
  const hasBrandMentions = (optimizedDescription.match(new RegExp(brandName, 'gi')) || []).length;
  
  let seoScore = 70; // Base score
  
  // Title optimization (30-60 characters is ideal)
  if (titleLength >= 30 && titleLength <= 60) seoScore += 15;
  else if (titleLength >= 20 && titleLength <= 80) seoScore += 10;
  
  // Description length (150-300 words is good)
  const wordCount = optimizedDescription.split(/\s+/).length;
  if (wordCount >= 150 && wordCount <= 300) seoScore += 15;
  else if (wordCount >= 100 && wordCount <= 400) seoScore += 10;
  
  // Keyword density
  if (keywordDensity >= 6) seoScore += 10;
  else if (keywordDensity >= 4) seoScore += 5;
  
  // Structured content (bullet points, etc.)
  if (hasStructuredContent) seoScore += 5;
  
  // Brand mentions (2-4 is optimal)
  if (hasBrandMentions >= 2 && hasBrandMentions <= 4) seoScore += 5;

  const recommendations = [
    'Add high-quality product images with descriptive alt text',
    'Include customer testimonials and reviews',
    'Optimize for mobile viewing experience',
    'Add clear call-to-action buttons',
    'Include detailed product specifications',
    'Add related products and upsell opportunities',
    'Implement structured data markup for better search visibility',
    'Consider adding video demonstrations or tutorials'
  ];

  return {
    optimizedTitle,
    optimizedDescription,
    keywords,
    seoScore: Math.min(seoScore, 100),
    recommendations: recommendations.slice(0, 4)
  };
} 