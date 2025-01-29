'use client';

import { useState, useEffect } from 'react';

const words = [
  "Enhance",
  "Elevate",
  "Enrich",
  "Evolve",
  "Empower"
];

export default function WordCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % words.length);
        setIsAnimating(false);
      }, 500);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col max-w-4xl">
      <div className="flex items-baseline gap-2 mb-2">
        <div className="relative min-w-[180px]">
          <div className="absolute inset-0 bg-blue-50/80 rounded-lg blur-sm transform -skew-x-6" />
          <span
            className={`relative block text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent transition-all duration-1000 ${
              isAnimating
                ? 'opacity-0 transform -translate-y-8'
                : 'opacity-100 transform translate-y-0'
            }`}
          >
            {words[currentIndex]}
          </span>
        </div>
        <span className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900">
          your
        </span>
      </div>
      <div className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900">
        website&apos;s SEO in
      </div>
      <div className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900">
        just a few clicks!
      </div>
    </div>
  );
} 