import type { Metadata } from 'next';
import Hero from '@/components/home/Hero';
import Features from '@/components/home/Features';
import ThumbnailShowcase from '@/components/home/ThumbnailShowcase';
import Reviews from '@/components/home/Reviews';
import Pricing from '@/components/home/Pricing';
import { IMPRESSIONS_HEADLINE } from '@/lib/thumbnail/landing';

const TITLE = 'EnhanceMySEO | AI SEO Articles & Blog Thumbnails for Shopify';
const DESCRIPTION = `On-brand, fact-checked SEO articles built around your products, each with an AI thumbnail in your brand, published to your Shopify blog on autopilot. The tools behind ${IMPRESSIONS_HEADLINE} Google impressions for our clients.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/', type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

export default function HomePage() {
  // `Features` carries the id="features" anchor the hero's Learn More button scrolls to.
  return (
    <main className="space-y-6">
      <Hero />
      <Features />
      <ThumbnailShowcase />
      <Reviews />
      <Pricing />
    </main>
  );
}
