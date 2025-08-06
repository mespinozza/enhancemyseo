'use client';

import { useAuth } from '@/lib/firebase/auth-context';
import Link from 'next/link';
import WordCarousel from './WordCarousel';
import { ArrowRight, XCircle, CheckCircle, TrendingUp } from 'lucide-react';

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
          
          {/* Right Column - Feature Comparison */}
          <div className="relative pt-4">
            <div className="space-y-4">
              {/* Problems Card */}
              <div className="bg-white rounded-xl shadow-lg p-6 transform hover:-translate-y-1 transition-transform duration-200">
                <h3 className="text-lg font-semibold text-red-500 mb-4 flex items-center">
                  <XCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                  The problem with most SEO tools:
                </h3>
                <ul className="space-y-3 ml-7">
                  <li className="text-gray-700 list-disc">Manual content optimization that takes hours</li>
                  <li className="text-gray-700 list-disc">Complex keyword research process</li>
                  <li className="text-gray-700 list-disc">No automated content generation</li>
                </ul>
              </div>

              {/* Solution Card */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-400 rounded-xl shadow-lg p-6 text-white transform hover:-translate-y-1 transition-transform duration-200">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <CheckCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                  Our tool does this on auto-pilot:
                </h3>
                <ul className="space-y-3 ml-7">
                  <li className="list-disc">AI-powered content optimization in minutes</li>
                  <li className="flex items-center">
                    <svg className="h-5 w-5 text-green-500 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Intelligent product and store integration
                  </li>
                  <li className="list-disc">Automated SEO-friendly content generation</li>
                </ul>
              </div>

              {/* Results Card */}
              <div className="bg-gray-900 rounded-xl shadow-lg p-6 text-white transform hover:-translate-y-1 transition-transform duration-200">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 flex-shrink-0 text-green-400" />
                  Organic results with our tools:
                </h3>
                <div className="flex flex-col items-center">
                  {/* Line Chart */}
                  <div className="relative w-full h-32 mb-4">
                    {/* Y-axis */}
                    <div className="absolute left-0 h-full w-px bg-gray-700" />
                    {/* X-axis */}
                    <div className="absolute bottom-0 w-full h-px bg-gray-700" />
                    {/* Line Chart Path */}
                    <div className="absolute inset-0">
                      <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 320 128">
                        <path
                          d="M0,128 C40,100 60,110 100,80 C140,60 160,40 200,20 C240,10 260,5 320,0"
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="2"
                          className="path-animation"
                        />
                        {/* Start Point */}
                        <circle 
                          cx="0" 
                          cy="128" 
                          r="4" 
                          fill="#ef4444"
                          stroke="#fff"
                          strokeWidth="1" 
                        />
                        {/* End Point with Arrow */}
                        <circle 
                          cx="320" 
                          cy="0" 
                          r="4" 
                          fill="#4ade80"
                          stroke="#fff"
                          strokeWidth="1" 
                        />
                        <path
                          d="M320,0 L326,-6 L332,0 L326,6 Z"
                          fill="#4ade80"
                          className="transform rotate-[-45deg]"
                        />
                      </svg>
                    </div>
                  </div>
                  {/* Text Below Chart */}
                  <div className="text-center">
                    <div className="text-lg font-semibold text-white">
                      Content Reaching <span className="text-blue-500">Page #1</span> Google Rankings
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .path-animation {
          stroke-dasharray: 1000;
          stroke-dashoffset: 1000;
          animation: draw 2s ease forwards;
        }

        @keyframes draw {
          to {
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </section>
  );
} 