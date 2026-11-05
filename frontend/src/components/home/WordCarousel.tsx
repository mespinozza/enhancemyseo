'use client';

import { useState, useEffect } from 'react';

const words = ['Enrich', 'Enhance', 'Elevate'];

export default function WordCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentIndex((current) => (current + 1) % words.length);
        setIsAnimating(false);
      }, 500); // Half of the total animation time
    }, 3000); // Total time for each word

    return () => clearInterval(interval);
  }, []);

  return (
    <span 
      // Sized to the longest word so the highlight does not jump as words change.
      className={`inline-block min-w-[4.6em] text-center transition-all duration-500 transform ${
        isAnimating 
          ? 'opacity-0 -translate-y-2' 
          : 'opacity-100 translate-y-0'
      }`}
    >
      {words[currentIndex]}
    </span>
  );
} 