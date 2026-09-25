'use client';

import { useAuth } from '@/lib/firebase/auth-context';
import Link from 'next/link';
import WordCarousel from './WordCarousel';
import HeroPanels from './HeroPanels';
import { ArrowRight } from 'lucide-react';

export default function Hero() {
  const { user } = useAuth();

  const scrollToFeatures = () => {
    const featuresSection = document.getElementById('features');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-[40vh] flex items-start">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-blue-50/80 to-white -z-10" />
      
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Main Content */}
          <div className="max-w-xl flex items-center min-h-[calc(100vh-12rem)]">
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
                <span className="inline-flex items-baseline gap-3">
                  <span className="relative">
                    <span className="relative z-10 text-white">
                      <WordCarousel />
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-400 transform -skew-y-2 rounded-lg" />
                  </span>
                  your
                </span>
                <br />
                website&apos;s SEO in<br />
                just a few clicks!
              </h1>
              
              <p className="text-xl text-gray-600 mb-8">
                Discover the power of our SEO tools for yourself
              </p>
              
              <div className="flex gap-4">
                <Link
                  href={user ? '/dashboard' : '/login'}
                  className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors duration-200"
                >
                  Generate now
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
                
                <button
                  onClick={scrollToFeatures}
                  className="bg-gray-900 text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Learn More
                </button>
              </div>
            </div>
          </div>
          
          {/* Right Column - the animated comparison */}
          <div className="relative">
            <HeroPanels />
          </div>
        </div>
      </div>
    </section>
  );
}

