import dotenv from 'dotenv';

dotenv.config();

export const config = {
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: '1d',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  brand: {
    name: process.env.BRAND_NAME || 'Malachy Parts Plus',
    businessType: process.env.BUSINESS_TYPE || 'Kitchen Appliance Parts Dealer',
    articleTone: process.env.ARTICLE_TONE || 'Informative, helpful, informational, plain english',
    brandGuidelines: process.env.BRAND_GUIDELINES || 'Malachy Parts Plus is your trusted source for genuine OEM kitchen appliance parts. We carry an extensive selection of components from leading brands including Frymaster, Pasmo, and Rational. Whether you need replacement parts for commercial kitchen equipment, count on us for authentic, high-quality parts.',
  }
}; 