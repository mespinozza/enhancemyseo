'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { 
  ArrowRight, 
  FileText, 
  Zap, 
  Target, 
  ShoppingCart, 
  BarChart3, 
  Search, 
  Clock,
  DollarSign,
  Check,
  ChevronDown,
  TrendingUp,
  Shield,
  Star
} from 'lucide-react';
import Pricing from '@/components/home/Pricing';

export default function ArticleGenerationServicePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'solution' | 'problem'>('solution');
  const [hoveredSide, setHoveredSide] = useState<'solution' | 'problem' | null>(null);
  const [animatedStats, setAnimatedStats] = useState({ articles: 0, traffic: 0, time: 0, pageTime: 0 });
  const [hasAnimated, setHasAnimated] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  const transformWords = ['Keywords', 'Ideas', 'Products', 'Topics'];

  // Word carousel animation effect (same as homepage)
  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentWordIndex((current) => (current + 1) % transformWords.length);
        setIsAnimating(false);
      }, 500); // Half of the total animation time
    }, 3000); // Total time for each word

    return () => clearInterval(interval);
  }, [transformWords.length]);

  // Intersection Observer for stats animation
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          
          // Target values
          const targets = { articles: 1000, traffic: 300, time: 85, pageTime: 48 };
          const duration = 2000; // 2 seconds
          const steps = 60; // 60 FPS
          const stepDuration = duration / steps;
          
          let currentStep = 0;
          
          const animate = () => {
            currentStep++;
            const progress = currentStep / steps;
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            
            setAnimatedStats({
              articles: Math.round(targets.articles * easeOutQuart),
              traffic: Math.round(targets.traffic * easeOutQuart),
              time: Math.round(targets.time * easeOutQuart),
              pageTime: Math.round(targets.pageTime * easeOutQuart)
            });
            
            if (currentStep < steps) {
              setTimeout(animate, stepDuration);
            }
          };
          
          animate();
        }
      },
      { threshold: 0.5 }
    );

    const currentStatsRef = statsRef.current;
    if (currentStatsRef) {
      observer.observe(currentStatsRef);
    }

    return () => {
      if (currentStatsRef) {
        observer.unobserve(currentStatsRef);
      }
    };
  }, [hasAnimated]);

  const handleGenerateNow = () => {
    if (user) {
      router.push('/dashboard/articles');
    } else {
      router.push('/login');
    }
  };

  const features = [
    {
      icon: Target,
      title: "Brand Voice Consistency",
      description: "AI learns your brand's unique voice and maintains consistency across all content"
    },
    {
      icon: TrendingUp,
      title: "SEO Optimization",
      description: "Built-in SEO best practices that help your content rank #1 on Google"
    },
    {
      icon: ShoppingCart,
      title: "Shopify Integration",
      description: "Seamlessly integrates your products and collections into compelling content"
    },
    {
      icon: Zap,
      title: "Bulk Generation",
      description: "Generate multiple articles simultaneously to scale your content strategy"
    },
    {
      icon: Search,
      title: "Real-time Research",
      description: "AI researches current trends and data to create accurate, up-to-date content"
    },
    {
      icon: FileText,
      title: "Custom Formatting",
      description: "Professional formatting with tables, headers, and key takeaway sections"
    }
  ];

  const stats = [
    { number: `${animatedStats.articles}+`, label: "Articles Ranked #1" },
    { number: `${animatedStats.traffic}%`, label: "Average Traffic Increase" },
    { number: `${animatedStats.time}%`, label: "Time Saved vs Manual Writing" },
    { number: `${animatedStats.pageTime}hrs`, label: "Average Time to Page 1" }
  ];

  const faqs = [
    {
      question: "How does the AI ensure content quality?",
      answer: "Our AI leverages cutting-edge language models combined with real-time research APIs to create accurate, engaging content that meets the highest SEO standards and delivers exceptional quality."
    },
    {
      question: "Can I customize the content for my brand?",
      answer: "Absolutely! Our brand profile system stores your brand voice, business type, industry guidelines, and niche-specific requirements. The AI uses this comprehensive brand data to ensure every article matches your unique style, messaging, and industry expertise."
    },
    {
      question: "How quickly can I see SEO results?",
      answer: "Most articles start ranking within 48-72 hours, with many reaching page 1 within 2 weeks. Results depend on competition and content quality."
    },
    {
      question: "What makes this different from other AI writing tools?",
      answer: "Unlike generic AI tools, we specialize in SEO-optimized e-commerce content with seamless product integration for Shopify and other platforms, real-time research capabilities, and proven ranking strategies."
    },
    {
      question: "Do I need technical knowledge to use this?",
      answer: "No technical knowledge required! Simply enter your keywords, and our AI handles the research, writing, formatting, and optimization automatically."
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="pt-20 pb-16 bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Transform{' '}
              <span className="inline-flex items-baseline">
                <span className="relative">
                  <span className={`relative z-10 text-white inline-block min-w-[160px] transition-all duration-500 transform ${
                    isAnimating 
                      ? 'opacity-0 -translate-y-2' 
                      : 'opacity-100 translate-y-0'
                  }`}>
                    {transformWords[currentWordIndex]}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-400 transform -skew-y-2 rounded-lg" />
                </span>
              </span>
              <br />
              Into Revenue-Driving Articles
            </h1>
            
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
              AI-powered content that ranks #1 on Google and converts visitors into customers. 
              Create professional, SEO-optimized articles in minutes, not hours.
            </p>

            <button
              onClick={handleGenerateNow}
              className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-400 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-500 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Generate Now
              <ArrowRight className="w-5 h-5 ml-2" />
            </button>

            <div className="mt-8 flex items-center justify-center flex-wrap gap-4 md:gap-8">
              <div className="flex items-center">
                <Star className="w-5 h-5 text-yellow-400 mr-1" />
                <span className="text-sm text-gray-600">1000+ articles ranked #1</span>
              </div>
              <div className="flex items-center">
                <Shield className="w-5 h-5 text-green-500 mr-1" />
                <span className="text-sm text-gray-600">30-day money back</span>
              </div>
              <div className="flex items-center">
                <Zap className="w-5 h-5 text-blue-500 mr-1" />
                <span className="text-sm text-gray-600">Quick generation time</span>
              </div>
              <div className="flex items-center">
                <BarChart3 className="w-5 h-5 text-purple-500 mr-1" />
                <span className="text-sm text-gray-600">Real-time data research</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem/Solution Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Mobile Tab Layout */}
          <div className="md:hidden">
            <div className="space-y-2 mb-6">
              <button
                onClick={() => setActiveTab('solution')}
                className={`w-full p-4 text-left rounded-lg transition-all duration-300 ${
                  activeTab === 'solution' 
                    ? 'bg-blue-50 border-2 border-blue-200 text-blue-900' 
                    : 'bg-gray-100 border-2 border-gray-200 text-gray-600'
                }`}
              >
                <h3 className="font-bold">EnhanceMySEO</h3>
              </button>
              <button
                onClick={() => setActiveTab('problem')}
                className={`w-full p-4 text-left rounded-lg transition-all duration-300 ${
                  activeTab === 'problem' 
                    ? 'bg-red-50 border-2 border-red-200 text-red-900' 
                    : 'bg-gray-100 border-2 border-gray-200 text-gray-600'
                }`}
              >
                <h3 className="font-bold">Traditional Content Creation</h3>
              </button>
            </div>

            {/* Mobile Tab Content */}
            <div className="relative">
              {/* Solution Content */}
              <div className={`transition-all duration-300 ${
                activeTab === 'solution' ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform -translate-y-4 absolute inset-0 pointer-events-none'
              }`}>
                <div className="bg-blue-50 rounded-2xl p-8 border-2 border-blue-100">
                  <h3 className="text-2xl font-bold text-blue-900 mb-6">EnhanceMySEO</h3>
                  <div className="space-y-4">
                    <div className="flex items-center text-blue-700">
                      <Zap className="w-5 h-5 mr-3" />
                      <span>Generate articles in 2-3 minutes</span>
                    </div>
                    <div className="flex items-center text-blue-700">
                      <DollarSign className="w-5 h-5 mr-3" />
                      <span>High quality writing on the cent</span>
                    </div>
                    <div className="flex items-center text-blue-700">
                      <Target className="w-5 h-5 mr-3" />
                      <span>Brand-specific, conversion-optimized</span>
                    </div>
                    <div className="flex items-center text-blue-700">
                      <TrendingUp className="w-5 h-5 mr-3" />
                      <span>Built to rank on Google</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Problem Content */}
              <div className={`transition-all duration-300 ${
                activeTab === 'problem' ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform -translate-y-4 absolute inset-0 pointer-events-none'
              }`}>
                <div className="bg-red-50 rounded-2xl p-8 border-2 border-red-100">
                  <h3 className="text-2xl font-bold text-red-900 mb-6">Traditional Content Creation</h3>
                  <div className="space-y-4">
                    <div className="flex items-center text-red-700">
                      <Clock className="w-5 h-5 mr-3" />
                      <span>Takes 4-8 hours per article</span>
                    </div>
                    <div className="flex items-center text-red-700">
                      <DollarSign className="w-5 h-5 mr-3" />
                      <span>Costs $200-500 per article</span>
                    </div>
                    <div className="flex items-center text-red-700">
                      <Target className="w-5 h-5 mr-3" />
                      <span>Generic content that doesn&apos;t convert</span>
                    </div>
                    <div className="flex items-center text-red-700">
                      <TrendingUp className="w-5 h-5 mr-3" />
                      <span>Poor SEO performance</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Hover Layout */}
          <div className="hidden md:flex relative overflow-hidden rounded-2xl shadow-lg h-96">
            {/* Problem Side - Initially Smaller */}
            <div 
              className="group relative transition-all duration-700 ease-in-out flex-none w-1/3 hover:w-2/3 bg-red-50 border-r border-red-200 cursor-pointer"
              onMouseEnter={() => setHoveredSide('problem')}
              onMouseLeave={() => setHoveredSide(null)}
            >
              <div className={`absolute inset-0 transition-all duration-700 ${
                hoveredSide === 'solution' ? 'opacity-30 scale-95' : hoveredSide === 'problem' ? 'opacity-100 scale-100' : 'opacity-30 scale-95'
              }`}>
                <div className="h-full flex flex-col justify-center p-8">
                  <h3 className="text-2xl font-bold text-red-900 mb-6">Traditional Content Creation</h3>
                  <div className="space-y-4">
                    <div className="flex items-center text-red-700">
                      <Clock className="w-5 h-5 mr-3 flex-shrink-0" />
                      <span>Takes 4-8 hours per article</span>
                    </div>
                    <div className="flex items-center text-red-700">
                      <DollarSign className="w-5 h-5 mr-3 flex-shrink-0" />
                      <span>Costs $200-500 per article</span>
                    </div>
                    <div className="flex items-center text-red-700">
                      <Target className="w-5 h-5 mr-3 flex-shrink-0" />
                      <span>Generic content that doesn&apos;t convert</span>
                    </div>
                    <div className="flex items-center text-red-700">
                      <TrendingUp className="w-5 h-5 mr-3 flex-shrink-0" />
                      <span>Poor SEO performance</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Solution Side - Initially Larger */}
            <div 
              className="group relative transition-all duration-700 ease-in-out flex-1 w-2/3 hover:w-2/3 bg-blue-50 cursor-pointer"
              onMouseEnter={() => setHoveredSide('solution')}
              onMouseLeave={() => setHoveredSide(null)}
            >
              <div className={`absolute inset-0 transition-all duration-700 ${
                hoveredSide === 'problem' ? 'opacity-30 scale-95' : 'opacity-100 scale-100'
              }`}>
                <div className="h-full flex flex-col justify-center p-8">
                  <h3 className="text-2xl font-bold text-blue-900 mb-6">EnhanceMySEO</h3>
                  <div className="space-y-4">
                    <div className="flex items-center text-blue-700">
                      <Zap className="w-5 h-5 mr-3 flex-shrink-0" />
                      <span>Generate articles in 2-3 minutes</span>
                    </div>
                    <div className="flex items-center text-blue-700">
                      <DollarSign className="w-5 h-5 mr-3 flex-shrink-0" />
                      <span>High quality writing on the cent</span>
                    </div>
                    <div className="flex items-center text-blue-700">
                      <Target className="w-5 h-5 mr-3 flex-shrink-0" />
                      <span>Brand-specific, conversion-optimized</span>
                    </div>
                    <div className="flex items-center text-blue-700">
                      <TrendingUp className="w-5 h-5 mr-3 flex-shrink-0" />
                      <span>Built to rank on Google</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Demo Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">See The Difference</h2>
            <p className="text-lg text-gray-600">Compare our AI-optimized content with typical blog posts</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Before */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex items-center mb-4">
                <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                <h3 className="font-semibold text-gray-900">Typical Blog Content</h3>
              </div>
              <div className="bg-gray-100 p-4 rounded text-sm text-gray-600 mb-4">
                <p className="mb-2">Generic information...</p>
                <p className="mb-2">Basic information without research...</p>
                <p>No product integration or SEO optimization...</p>
              </div>
              <div className="flex items-center space-x-4 text-sm">
                <span className="text-red-600">SEO Score: 45/100</span>
                <span className="text-red-600">Conversion Rate: 1.2%</span>
              </div>
            </div>

            {/* After */}
            <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-blue-200">
              <div className="flex items-center mb-4">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                <h3 className="font-semibold text-gray-900">EnhanceMySEO Content</h3>
              </div>
              <div className="bg-blue-50 p-4 rounded text-sm text-gray-700 mb-4">
                <p className="mb-2"><strong>Insightful Visuals</strong> - Immediate Value</p>
                <p className="mb-2"><strong>Research-backed content</strong> with current data</p>
                <p><strong>Product integration</strong> and internal linking</p>
              </div>
              <div className="flex items-center space-x-4 text-sm">
                <span className="text-blue-600">SEO Score: 92/100</span>
                <span className="text-blue-600">Conversion Rate: 4.8%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Showcase Grid */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Powerful Features That Drive Results</h2>
            <p className="text-lg text-gray-600">Everything you need to create content that ranks and converts</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 border border-gray-100 hover:border-blue-200 group">
                <div className="flex items-center mb-4">
                  <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                    <feature.icon className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="ml-4 text-lg font-semibold text-gray-900">{feature.title}</h3>
                </div>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Results & Social Proof */}
      <section className="py-16 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Proven Results That Speak For Themselves</h2>
            <p className="text-gray-300 text-lg">Join thousands of businesses already seeing incredible growth</p>
          </div>

          <div ref={statsRef} className="grid md:grid-cols-4 gap-8 mb-12">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl font-bold text-blue-400 mb-2 transition-all duration-200">
                  {stat.number}
                </div>
                <div className="text-gray-300">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="text-center">
            {/* Removed award and reviews section */}
          </div>
        </div>
      </section>

      {/* Pricing Integration */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Pricing />
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-lg text-gray-600">Everything you need to know about our article generation service</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="border border-gray-200 rounded-lg">
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900">{faq.question}</span>
                  <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${openFaq === index ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-4">
                    <p className="text-gray-600">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-blue-400 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to Transform Your Content Strategy?</h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of businesses already generating high-converting content with AI
          </p>
          
          <button
            onClick={handleGenerateNow}
            className="inline-flex items-center px-8 py-4 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            Generate Now
            <ArrowRight className="w-5 h-5 ml-2" />
          </button>

          <div className="mt-8 flex items-center justify-center space-x-8 text-sm opacity-75">
            <div className="flex items-center">
              <Shield className="w-4 h-4 mr-1" />
              <span>30-day money back guarantee</span>
            </div>
            <div className="flex items-center">
              <Check className="w-4 h-4 mr-1" />
              <span>No setup fees</span>
            </div>
            <div className="flex items-center">
              <Zap className="w-4 h-4 mr-1" />
              <span>Start generating in minutes</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}