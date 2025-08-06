'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { Info, FileText, ArrowRight, Hash, Package, Layers, Lock } from 'lucide-react';

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
              <span>See what&apos;s included</span>
            </div>
            <h2 className="text-3xl font-bold text-gray-900">
              <div className="mb-2">We&apos;ve built the world&apos;s most</div>
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
        <div className="grid md:grid-cols-4 gap-6">
          {/* Article Generator - Main Tool (Spans 2 columns) */}
          <div className="md:col-span-2 bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 relative border-2 border-blue-500/20">
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-4 w-10 h-10 bg-blue-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center">
              <div className="w-3 h-3 bg-white rounded-full"></div>
            </div>
            <div className="flex items-center mb-4">
              <FileText className="w-10 h-10 text-blue-600 mr-4" />
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Article Generator</h3>
                <span className="text-sm text-green-600 font-medium">✓ Available Now</span>
              </div>
            </div>
            <p className="text-gray-600">
              Create SEO-optimized articles that naturally integrate your store&apos;s products and collections for maximum traffic impact.
            </p>
            <div className="flex items-center justify-between">
              <button
                onClick={handleGenerateClick}
                className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Generate Now
                <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          </div>

          {/* Keyword Generation - Coming Soon */}
          <div className="bg-white/40 backdrop-blur-sm rounded-2xl shadow-lg p-6 relative opacity-75 group cursor-not-allowed">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-100/50 to-gray-200/50 rounded-2xl blur-[1px]"></div>
            <div className="relative z-10 pt-4">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-4 w-8 h-8 bg-gray-400/20 rounded-full border-2 border-gray-400/30 flex items-center justify-center">
                <Lock className="w-3 h-3 text-gray-400" />
              </div>
              <div className="flex items-start mb-3">
                <Hash className="w-6 h-6 text-gray-400 mr-3 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-500 leading-tight">Keyword Generation</h3>
                  <span className="text-xs text-gray-400 font-medium">Coming Soon</span>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-4 line-clamp-3">
                Generate highly relevant, SEO-optimized keywords tailored to your niche and market trends.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400 font-medium">Stay tuned</span>
              </div>
            </div>
          </div>

          {/* Product Info Optimization - Coming Soon */}
          <div className="bg-white/40 backdrop-blur-sm rounded-2xl shadow-lg p-6 relative opacity-75 group cursor-not-allowed">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-100/50 to-gray-200/50 rounded-2xl blur-[1px]"></div>
            <div className="relative z-10 pt-4">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-4 w-8 h-8 bg-gray-400/20 rounded-full border-2 border-gray-400/30 flex items-center justify-center">
                <Lock className="w-3 h-3 text-gray-400" />
              </div>
              <div className="flex items-start mb-3">
                <Package className="w-6 h-6 text-gray-400 mr-3 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-500 leading-tight">Product Info Optimization</h3>
                  <span className="text-xs text-gray-400 font-medium">Coming Soon</span>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-4 line-clamp-3">
                Optimize product descriptions and metadata for maximum search visibility and conversions.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400 font-medium">Stay tuned</span>
              </div>
            </div>
          </div>

          {/* Collection Optimization - Coming Soon */}
          <div className="bg-white/40 backdrop-blur-sm rounded-2xl shadow-lg p-6 relative opacity-75 group cursor-not-allowed">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-100/50 to-gray-200/50 rounded-2xl blur-[1px]"></div>
            <div className="relative z-10 pt-4">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-4 w-8 h-8 bg-gray-400/20 rounded-full border-2 border-gray-400/30 flex items-center justify-center">
                <Lock className="w-3 h-3 text-gray-400" />
              </div>
              <div className="flex items-start mb-3">
                <Layers className="w-6 h-6 text-gray-400 mr-3 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-500 leading-tight">Collection Optimization</h3>
                  <span className="text-xs text-gray-400 font-medium">Coming Soon</span>
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-4 line-clamp-3">
                Enhance collection pages and organization for improved SEO performance and user experience.
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400 font-medium">Stay tuned</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
} 