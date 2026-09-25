import Hero from '@/components/home/Hero';
import Features from '@/components/home/Features';
import Reviews from '@/components/home/Reviews';
import Pricing from '@/components/home/Pricing';

export default function HomePage() {
  // `Features` carries the id="features" anchor the hero's Learn More button scrolls to.
  return (
    <main className="space-y-6">
      <Hero />
      <Features />
      <Reviews />
      <Pricing />
    </main>
  );
}
