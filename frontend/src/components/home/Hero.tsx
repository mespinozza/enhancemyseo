'use client';

import { useAuth } from '@/lib/firebase/auth-context';
import Link from 'next/link';
import WordCarousel from './WordCarousel';
import { ArrowRight, ChevronDown } from 'lucide-react';

export default function Hero() {
  const { user } = useAuth();

  const scrollToFeatures = () => {
    const featuresSection = document.getElementById('features');
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="relative min-h-screen flex items-start sm:items-center">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-white -z-10" />
      
      <div className="w-full max-w-[1400px] mx-auto px-8 sm:px-12 lg:px-16 pt-28 sm:pt-12">
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-center">
          <div className="lg:col-span-7 mb-12 lg:mb-0">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6">
              <WordCarousel />
            </h1>
            
            <p className="text-xl text-gray-600 mb-8 max-w-2xl">
              Discover the power of our SEO tools for yourself
            </p>
            
            <div className="mt-8 flex gap-4">
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
          
          <div className="hidden lg:block lg:col-span-5">
            {/* Add illustration or image here later */}
            <div className="aspect-square rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 shadow-lg" />
          </div>
        </div>
      </div>
    </div>
  );
} 