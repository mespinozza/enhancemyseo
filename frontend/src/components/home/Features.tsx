'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { Info, KeySquare, FileText, ArrowRight } from 'lucide-react';

const contextWords = ['context-aware', 'informed', 'aware', 'Responsive'];

export default function Features() {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentWordIndex((prev) => (prev + 1) % contextWords.length);
        setIsAnimating(false);
      }, 500);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleGenerateClick = () => {
    if (user) {
      router.push('/dashboard');
    } else {
      router.push('/register');
    }
  };

  return (
    <section className="py-8 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header with animated text */}
        <div className="flex justify-between items-start mb-10">
          <div className="flex-1">
            {/* Placeholder for any left content */}
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end text-sm text-gray-600 mb-2">
              <Info className="w-4 h-4 mr-1" />
              <span>See what's included</span>
            </div>
            <h2 className="text-3xl font-bold text-gray-900">
              <div className="mb-2">We've built the world's most</div>
              <div className="flex items-baseline justify-end space-x-2">
                <span
                  className={`inline-block transition-opacity duration-500 text-blue-600 min-w-[120px] ${
                    isAnimating ? 'opacity-0' : 'opacity-100'
                  }`}
                >
                  {contextWords[currentWordIndex]}
                </span>
                <span className="inline-block">SEO suite.</span>
              </div>
            </h2>
          </div>
        </div>

        {/* Visual Roadmap */}
        <div className="relative mb-8">
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-px h-12 bg-gradient-to-b from-blue-600/0 to-blue-600/50"></div>
          <div className="absolute top-12 left-0 right-0 flex justify-between">
            <div className="w-px h-6 bg-gradient-to-b from-blue-600/50 to-blue-600/20 transform -translate-x-1/2 ml-[25%]"></div>
            <div className="w-px h-6 bg-gradient-to-b from-blue-600/50 to-blue-600/20 transform translate-x-1/2 mr-[25%]"></div>
          </div>
        </div>

        {/* Tools Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Keyword Generator */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 relative">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-4 w-8 h-8 bg-blue-600/10 rounded-full border-2 border-blue-600/20 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
            </div>
            <div className="flex items-center mb-4">
              <KeySquare className="w-8 h-8 text-blue-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">Keyword Generator</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Generate highly relevant, SEO-optimized keywords tailored to your brand's voice and market niche. 
              Our AI analyzes market trends and search patterns to deliver keywords that drive organic traffic.
            </p>
            <div className="flex items-center justify-between">
              <button
                onClick={handleGenerateClick}
                className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium"
              >
                Generate Now
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>

          {/* Article Generator */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 relative">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-4 w-8 h-8 bg-blue-600/10 rounded-full border-2 border-blue-600/20 flex items-center justify-center">
              <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
            </div>
            <div className="flex items-center mb-4">
              <FileText className="w-8 h-8 text-blue-600 mr-3" />
              <h3 className="text-xl font-semibold text-gray-900">Article Generator</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Create engaging, SEO-optimized articles that resonate with your audience. 
              Our AI ensures each piece is unique, informative, and aligned with your brand's tone while 
              maintaining high search engine visibility.
            </p>
            <div className="flex items-center justify-between">
              <button
                onClick={handleGenerateClick}
                className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium"
              >
                Generate Now
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
} 