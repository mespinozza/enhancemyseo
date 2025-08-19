'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams, notFound } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { 
  ArrowRight, 
  FileText, 
  Zap, 
  Target, 
  ShoppingCart, 
  BarChart3, 
  Search, 
  DollarSign,
  Check,
  ChevronDown,
  TrendingUp,
  Shield,
  Star,
  MapPin,
  Users,
  Building2
} from 'lucide-react';
import Head from 'next/head';
import { createCheckoutSession, getPriceId, getDisplayPrice, getOriginalPrice, getAnnualPrice } from '@/lib/stripe';
import { 
  parseLocationFromParams, 
  generateLocationSEO, 
  generateBreadcrumbs, 
  generateLocationLinks,
  generateLocationSchema,
  formatServiceName,
  LocationContext 
} from '@/lib/location-utils';

// Pricing component without header for location pages
function LocationPricing() {
  const router = useRouter();
  const { user } = useAuth();
  const [isAnnual, setIsAnnual] = useState(true);

  interface PricingTier {
    name: string;
    price: string;
    description: string;
    features: string[];
    buttonText: string;
    popular?: boolean;
    priceId?: string | null;
  }

  const pricingTiers: PricingTier[] = [
    {
      name: "Free",
      price: "0",
      description: "Perfect for trying out our platform",
      features: [
        "2 article generations per month",
        "Basic article structure & formatting",
        "Shopify product integration",
        "Community support"
      ],
      buttonText: "Get Started",
      priceId: getPriceId('free'),
    },
    {
      name: "Kickstart",
      price: getDisplayPrice('kickstart', isAnnual).toString(),
      description: "Ideal for growing businesses",
      features: [
        "15 article generations per month",
        "Advanced article customization",
        "Bulk article generation",
        "Product & collection integration",
        "Priority email support"
      ],
      buttonText: "Get Started",
      popular: true,
      priceId: getPriceId('kickstart'),
    },
    {
      name: "SEO Takeover",
      price: getDisplayPrice('seo_takeover', isAnnual).toString(),
      description: "For serious content creators",
      features: [
        "50 article generations per month",
        "Advanced SEO optimization",
        "Custom article templates",
        "API access for integrations",
        "Dedicated account manager"
      ],
      buttonText: "Get Started",
      priceId: getPriceId('seo_takeover'),
    }
  ];

  const handlePricingClick = async (tier: PricingTier) => {
    if (tier.name === 'Free') {
      if (user) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }

    if (tier.priceId) {
      try {
        const userToken = await user.getIdToken();
        await createCheckoutSession(tier.priceId, userToken);
      } catch (error) {
        console.error('Error creating checkout session:', error);
      }
    }
  };

  return (
    <>
      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-3 mb-12">
        <span className={`text-sm ${!isAnnual ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
          Monthly billing
        </span>
        <button
          onClick={() => setIsAnnual(!isAnnual)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            isAnnual ? 'bg-blue-600' : 'bg-gray-200'
          }`}
          role="switch"
          aria-checked={isAnnual}
        >
          <span
            className={`${
              isAnnual ? 'translate-x-6' : 'translate-x-1'
            } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
          />
        </button>
        <span className={`text-sm ${isAnnual ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
          Annual billing
          <span className="ml-1.5 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
            Save 20%
          </span>
        </span>
      </div>

      {/* Pricing Tiers */}
      <div className="grid md:grid-cols-3 gap-8">
        {pricingTiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 ${
              tier.popular ? 'ring-2 ring-blue-600' : ''
            }`}
          >
            {tier.popular && (
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-blue-600 text-white text-sm font-medium px-3 py-1 rounded-full">
                  Most Popular
                </span>
              </div>
            )}
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{tier.name}</h3>
              <div className="flex flex-col mb-2">
                <div className="flex items-baseline">
                  {isAnnual && tier.name !== "Free" ? (
                    <>
                      <span className="text-2xl font-bold text-gray-400 line-through mr-2">
                        ${getOriginalPrice(tier.name.toLowerCase().replace(' ', '_'))}
                      </span>
                      <span className="text-4xl font-bold text-gray-900">${tier.price}</span>
                      <span className="text-gray-600 ml-2">/month</span>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-gray-900">${tier.price}</span>
                      <span className="text-gray-600 ml-2">/month</span>
                    </>
                  )}
                </div>
                {isAnnual && tier.name !== "Free" && (
                  <span className="text-sm text-blue-600 mt-1">
                    (Billed at ${getAnnualPrice(tier.name.toLowerCase().replace(' ', '_'))} per year)
                  </span>
                )}
              </div>
              <p className="text-gray-600">{tier.description}</p>
            </div>
            <ul className="space-y-4 mb-8">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start">
                  <Check className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" />
                  <span className="text-gray-600">{feature}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handlePricingClick(tier)}
              className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                tier.popular
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
              }`}
            >
              {tier.buttonText}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export default function LocationBasedServicePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [locationContext, setLocationContext] = useState<LocationContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [animatedStats, setAnimatedStats] = useState({ articles: 0, traffic: 0, time: 0, pageTime: 0 });
  const [hasAnimated, setHasAnimated] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  const transformWords = ['Keywords', 'Ideas', 'Products', 'Topics'];

  // Parse URL parameters and validate location
  useEffect(() => {
    if (params.location && Array.isArray(params.location)) {
      const context = parseLocationFromParams(params.location);
      if (!context) {
        notFound();
        return;
      }
      setLocationContext(context);
    } else {
      notFound();
    }
    setIsLoading(false);
  }, [params]);

  // Word carousel animation effect
  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentWordIndex((current) => (current + 1) % transformWords.length);
        setIsAnimating(false);
      }, 500);
    }, 3000);

    return () => clearInterval(interval);
  }, [transformWords.length]);

  // Stats animation
  useEffect(() => {
    // Ensure component is fully loaded before setting up observer
    if (isLoading || !locationContext) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          
          const targets = { articles: 1000, traffic: 300, time: 85, pageTime: 48 };
          const duration = 2000;
          const steps = 60;
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

    // Add a small delay to ensure DOM is ready
    const currentStatsRef = statsRef.current;
    const setupObserver = () => {
      if (currentStatsRef) {
        observer.observe(currentStatsRef);
      }
    };

    // Use setTimeout to ensure DOM is ready
    const timeoutId = setTimeout(setupObserver, 100);

    return () => {
      clearTimeout(timeoutId);
      if (currentStatsRef) {
        observer.unobserve(currentStatsRef);
      }
    };
  }, [hasAnimated, isLoading, locationContext]);

  const handleGenerateNow = () => {
    if (user) {
      router.push('/dashboard/articles');
    } else {
      router.push('/login');
    }
  };

  if (isLoading || !locationContext) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  const seoData = generateLocationSEO(locationContext);
  const breadcrumbs = generateBreadcrumbs(locationContext);
  const locationLinks = generateLocationLinks(locationContext);
  const schemaData = generateLocationSchema(locationContext);

  const stats = [
    { number: `${animatedStats.articles}+`, label: "Articles Ranked #1" },
    { number: `${animatedStats.traffic}%`, label: "Average Traffic Increase" },
    { number: `${animatedStats.time}%`, label: "Time Saved vs Manual Writing" },
    { number: `${animatedStats.pageTime}hrs`, label: "Average Time to Page 1" }
  ];

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
      title: "E-commerce Integration",
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

  const localFaqs = [
    {
      question: `How does AI article generation work in ${locationContext.city?.name || locationContext.state?.name}?`,
      answer: "Our AI leverages cutting-edge language models combined with real-time research APIs to create accurate, engaging content that meets the highest SEO standards and delivers exceptional quality for your local market."
    },
    {
      question: "Can I customize the content for my local business?",
      answer: "Absolutely! Our brand profile system stores your brand voice, business type, industry guidelines, and location-specific requirements. The AI uses this comprehensive data to ensure every article matches your unique style and local market needs."
    },
    {
      question: `How quickly can I see SEO results in ${locationContext.state?.name}?`,
      answer: "Most articles start ranking within 48-72 hours, with many reaching page 1 within 2 weeks. Results depend on local competition and content quality, but our location-optimized approach gives you an edge in local search."
    },
    {
      question: "Do you serve businesses throughout the area?",
      answer: `Yes! We serve businesses across ${locationContext.state?.name}${locationContext.city ? ` with specialized expertise in the ${locationContext.city.name} market` : ''}. Our AI understands local market dynamics and creates content that resonates with your local audience.`
    }
  ];

  return (
    <>
      <Head>
        <title>{seoData.title}</title>
        <meta name="description" content={seoData.description} />
        <meta name="keywords" content={seoData.keywords.join(', ')} />
        <link rel="canonical" href={seoData.canonicalUrl} />
        <meta property="og:title" content={seoData.title} />
        <meta property="og:description" content={seoData.description} />
        <meta property="og:url" content={seoData.canonicalUrl} />
        {schemaData && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaData) }}
          />
        )}
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Breadcrumb Navigation */}
        <div className="pt-20 pb-2 bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-2 text-sm">
              {breadcrumbs.map((crumb, index) => (
                <div key={crumb.href} className="flex items-center">
                  {index > 0 && <span className="mx-2 text-gray-400">/</span>}
                  {index === breadcrumbs.length - 1 ? (
                    <span className="text-gray-600">{crumb.name}</span>
                  ) : (
                    <a href={crumb.href} className="text-blue-600 hover:text-blue-800">
                      {crumb.name}
                    </a>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </div>

        {/* Hero Section */}
        <section className="pt-8 pb-16 bg-gradient-to-br from-blue-50 via-white to-purple-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              {/* Location Badge */}
              <div className="inline-flex items-center px-4 py-2 bg-blue-100 rounded-full text-blue-800 text-sm font-medium mb-6">
                <MapPin className="w-4 h-4 mr-2" />
                Serving {locationContext.city?.name || locationContext.state?.name}
                {locationContext.city && `, ${locationContext.state?.name}`}
              </div>

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
                <br />
                <span className="text-3xl md:text-4xl text-blue-600">
                  in {locationContext.city?.name || locationContext.state?.name}
                </span>
              </h1>
              
              <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
                Professional AI-powered content that ranks #1 on Google and converts visitors into customers. 
                Serving businesses in {locationContext.city?.name || locationContext.state?.name} with 
                cutting-edge SEO article generation.
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

        {/* Local Market Section */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-6">
                  Why {locationContext.city?.name || locationContext.state?.name} Businesses Choose Our AI Article Generation
                </h2>
                <div className="space-y-4">
                  <div className="flex items-start">
                    <Building2 className="w-6 h-6 text-blue-600 mr-3 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-gray-900">Local Market Understanding</h3>
                      <p className="text-gray-600">
                        Our AI understands the {locationContext.city?.name || locationContext.state?.name} market 
                        dynamics and creates content that resonates with your local audience.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <Users className="w-6 h-6 text-blue-600 mr-3 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-gray-900">Proven Local Results</h3>
                      <p className="text-gray-600">
                        Businesses across {locationContext.state?.name} have seen dramatic improvements 
                        in local search rankings and customer engagement.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <Search className="w-6 h-6 text-blue-600 mr-3 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-gray-900">Local SEO Optimization</h3>
                      <p className="text-gray-600">
                        Content optimized for local search terms and geographic keywords 
                        that your {locationContext.city?.name || locationContext.state?.name} customers use.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-blue-50 rounded-2xl p-8">
                <h3 className="text-2xl font-bold text-blue-900 mb-6">
                  Success in {locationContext.city?.name || locationContext.state?.name}
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center text-blue-700">
                    <TrendingUp className="w-5 h-5 mr-3" />
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
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Powerful Features for {locationContext.city?.name || locationContext.state?.name} Businesses
              </h2>
              <p className="text-lg text-gray-600">Everything you need to create content that ranks and converts locally</p>
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
              <h2 className="text-3xl font-bold mb-4">
                Proven Results in {locationContext.city?.name || locationContext.state?.name}
              </h2>
              <p className="text-gray-300 text-lg">
                Join local businesses already seeing incredible growth
              </p>
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
          </div>
        </section>

        {/* Pricing Section */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Transparent Pricing for {locationContext.city?.name || locationContext.state?.name}
              </h2>
              <p className="text-lg text-gray-600">Start generating high-quality content today</p>
            </div>
            
            {/* Custom Pricing Component without header */}
            <LocationPricing />
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
              <p className="text-lg text-gray-600">
                Common questions from {locationContext.city?.name || locationContext.state?.name} businesses
              </p>
            </div>

            <div className="space-y-4">
              {localFaqs.map((faq, index) => (
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

        {/* Related Locations */}
        {locationLinks.length > 0 && (
          <section className="py-16 bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  {formatServiceName(locationContext.service)} in Other Locations
                </h2>
                <p className="text-lg text-gray-600">
                  We also serve businesses throughout {locationContext.state?.name}
                </p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {locationLinks.slice(0, 9).map((link, index) => (
                  <a
                    key={index}
                    href={link.href}
                    className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-200"
                  >
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 text-blue-600 mr-2" />
                      <span className="text-gray-900 hover:text-blue-600">{link.name}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Final CTA Section */}
        <section className="py-16 bg-gradient-to-r from-blue-600 to-blue-400 text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-4xl font-bold mb-4">
              Ready to Dominate {locationContext.city?.name || locationContext.state?.name} Search Results?
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Join local businesses already generating high-converting content with AI
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
    </>
  );
}
