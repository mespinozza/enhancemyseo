'use client';

import { useAuth } from '@/lib/firebase/auth-context';
import { useRouter } from 'next/navigation';
import Hero from '@/components/home/Hero';
import Features from '@/components/home/Features';
import Reviews from '@/components/home/Reviews';
import Pricing from '@/components/home/Pricing';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();

  // Removed the automatic redirect to allow users to view the homepage

  return (
    <div className="space-y-12">
      <main className="space-y-6">
        <Hero />
        <Features />
        <Reviews />
        <Pricing />
        <div id="features" className="py-4">
          {/* Features section will be added here */}
        </div>
      </main>
    </div>
  );
}
