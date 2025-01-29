'use client';

import { useAuth } from '@/lib/firebase/auth-context';
import { useRouter } from 'next/navigation';
import Header from '@/components/layout/Header';
import Hero from '@/components/home/Hero';
import Reviews from '@/components/home/Reviews';
import Features from '@/components/home/Features';
import Pricing from '@/components/home/Pricing';

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();

  // Removed the automatic redirect to allow users to view the homepage

  return (
    <>
      <Header />
      <main className="min-h-screen space-y-8">
        <Hero />
        <Reviews />
        <Features />
        <Pricing />
        <div id="features" className="py-20">
          {/* Features section will be added here */}
        </div>
      </main>
    </>
  );
}
