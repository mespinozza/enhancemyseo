'use client';

import { useAuth } from '@/lib/firebase/auth-context';
import Link from 'next/link';
import WordCarousel from './WordCarousel';
import HeroPanels from './HeroPanels';
import { ArrowRight, Check, ChevronDown } from 'lucide-react';

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
          {/* Full height only beside the panel; stacked on mobile it would leave a screen of blank space. */}
          <div className="max-w-xl flex items-center pt-8 sm:pt-12 lg:pt-0 lg:min-h-[calc(100vh-12rem)]">
            <div>
              <h1 className="text-[2.5rem] leading-[1.1] sm:text-5xl lg:text-6xl font-bold mb-6">
                <span className="inline-flex items-baseline gap-2 sm:gap-3">
                  <span className="relative px-2 -mx-1">
                    <span className="relative z-10 text-white">
                      <WordCarousel />
                    </span>
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-400 transform -skew-y-2 rounded-lg" />
                  </span>
                  your
                </span>
                <br />
                website&apos;s SEO in<br />
                just a few clicks!
              </h1>
              
              <p className="text-lg sm:text-xl text-gray-600 mb-8">
                On-brand, fact-checked articles built around your products, published
                to your Shopify blog on autopilot.
              </p>
              
              <div className="flex gap-3 sm:gap-4">
                <Link
                  href={user ? '/dashboard' : '/login'}
                  className="group relative inline-flex flex-1 items-center justify-center overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3.5 text-[15px] font-semibold sm:text-base text-white shadow-lg shadow-blue-600/30 ring-1 ring-inset ring-white/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-600/40 active:translate-y-0 sm:flex-none sm:px-7"
                >
                  {/* A sheen that sweeps across on hover. */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[300%] motion-reduce:hidden"
                  />
                  Generate now
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                
                <button
                  onClick={scrollToFeatures}
                  className="group inline-flex flex-1 items-center justify-center whitespace-nowrap rounded-xl bg-white/80 px-4 py-3.5 text-[15px] font-semibold sm:text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-md hover:ring-blue-200 active:translate-y-0 sm:flex-none sm:px-7"
                >
                  How it works
                  <ChevronDown className="ml-1.5 h-5 w-5 text-blue-600 transition-transform duration-200 group-hover:translate-y-0.5" />
                </button>
              </div>

              {/* One row on phones: the third point only joins once there is room for it. */}
              <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[13px] text-gray-500 sm:gap-x-5 sm:text-sm">
                {['2 free articles a month', 'Connects to Shopify', 'Runs on a schedule'].map((item, index) => (
                  <li key={item} className={`items-center gap-1.5 ${index === 2 ? 'hidden sm:flex' : 'flex'}`}>
                    <Check className="h-4 w-4 text-green-500" strokeWidth={2.5} />
                    {item}
                  </li>
                ))}
              </ul>
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

