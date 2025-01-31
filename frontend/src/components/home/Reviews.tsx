'use client';

import { useState, useEffect } from 'react';
import { Star, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface Review {
  id: number;
  firstName: string;
  lastName: string;
  rating: number;
  text: string;
  storeType: string;
  revenueRange: string;
}

const reviews: Review[] = [
  {
    id: 1,
    firstName: "Sarah",
    lastName: "Thompson",
    rating: 5,
    text: "This AI tool has completely transformed how I create content for my store. The keyword research is spot-on and the articles are engaging and SEO-optimized. It's like having a full content team at my fingertips!",
    storeType: "Fashion & Accessories",
    revenueRange: "6-figure"
  },
  {
    id: 2,
    firstName: "Michael",
    lastName: "Chen",
    rating: 4.5,
    text: "The automated content generation has saved me countless hours. The articles are well-researched and perfectly aligned with my brand voice. My organic traffic has increased by 150% since I started using this tool.",
    storeType: "Health & Wellness",
    revenueRange: "5-figure"
  },
  {
    id: 3,
    firstName: "David",
    lastName: "Wilson",
    rating: 4.8,
    text: "Finally, a content solution that understands e-commerce! The articles are engaging, informative, and drive real results. My conversion rate has improved significantly since implementing the content strategy.",
    storeType: "Electronics",
    revenueRange: "6-figure"
  },
  {
    id: 4,
    firstName: "Emma",
    lastName: "Rodriguez",
    rating: 4.9,
    text: "The AI-generated content has helped me scale my store's organic reach tremendously. The articles are not just SEO-friendly but also genuinely helpful to my customers. This tool pays for itself many times over!",
    storeType: "Beauty & Cosmetics",
    revenueRange: "5-figure"
  },
  {
    id: 5,
    firstName: "James",
    lastName: "Anderson",
    rating: 5,
    text: "I was skeptical about AI-generated content at first, but this tool exceeded all my expectations. The keyword research is incredibly accurate, and the content quality is outstanding. A game-changer for my business!",
    storeType: "Home & Garden",
    revenueRange: "4-figure"
  }
];

export default function Reviews() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const showPrevious = () => {
    if (!isAnimating) {
      setIsAnimating(true);
      setCurrentIndex((prev) => (prev === 0 ? reviews.length - 1 : prev - 1));
      setTimeout(() => setIsAnimating(false), 500);
    }
  };

  const showNext = () => {
    if (!isAnimating) {
      setIsAnimating(true);
      setCurrentIndex((prev) => (prev === reviews.length - 1 ? 0 : prev + 1));
      setTimeout(() => setIsAnimating(false), 500);
    }
  };

  useEffect(() => {
    const interval = setInterval(showNext, 5000);
    return () => clearInterval(interval);
  }, [currentIndex]);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }).map((_, index) => (
      <Star
        key={index}
        className={`w-5 h-5 ${
          index < Math.floor(rating)
            ? 'text-yellow-400 fill-yellow-400'
            : index < rating
            ? 'text-yellow-400 fill-yellow-400 opacity-50'
            : 'text-gray-300'
        }`}
      />
    ));
  };

  const getBlurredLastName = (lastName: string) => {
    return lastName.charAt(0) + '•'.repeat(lastName.length - 1);
  };

  return (
    <section className="py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl mb-3">
            Trusted by Successful Store Owners
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            See how our AI-powered content solution is helping e-commerce businesses grow
          </p>
        </div>

        <div className="relative pb-6">
          <div className="overflow-hidden">
            <div
              className={`flex transition-transform duration-500 ease-in-out`}
              style={{
                transform: `translateX(-${currentIndex * 100}%)`,
              }}
            >
              {reviews.map((review) => (
                <div
                  key={review.id}
                  className="w-full flex-shrink-0 px-4"
                >
                  <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 mx-auto max-w-3xl">
                    <div className="flex items-center mb-6">
                      <div className="flex-shrink-0">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-center text-white text-2xl font-bold">
                          {review.firstName.charAt(0)}
                        </div>
                      </div>
                      <div className="ml-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {review.firstName} {getBlurredLastName(review.lastName)}
                        </h3>
                        <div className="flex items-center mt-1">
                          <div className="flex mr-2">
                            {renderStars(review.rating)}
                          </div>
                          <span className="text-gray-600">({review.rating})</span>
                        </div>
                        <div className="flex items-center mt-1 text-sm text-gray-600">
                          <CheckCircle className="w-4 h-4 text-blue-600 mr-1" />
                          <span>Verified {review.revenueRange} Shopify store owner</span>
                          <span className="mx-2">•</span>
                          <span>{review.storeType}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-gray-600 text-lg leading-relaxed italic mb-2">"{review.text}"</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={showPrevious}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <ChevronLeft className="w-6 h-6 text-gray-600" />
          </button>
          <button
            onClick={showNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 bg-white rounded-full p-2 shadow-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <ChevronRight className="w-6 h-6 text-gray-600" />
          </button>

          <div className="flex justify-center mt-8 space-x-2">
            {reviews.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-2.5 h-2.5 rounded-full transition-colors duration-200 ${
                  index === currentIndex ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
} 