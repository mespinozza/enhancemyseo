import { locationData, State, City } from '@/data/locations';

export interface LocationContext {
  service: string;
  state?: State;
  city?: City;
  isStateOnly: boolean;
  isCityPage: boolean;
}

export interface LocationSEO {
  title: string;
  description: string;
  keywords: string[];
  canonicalUrl: string;
}

// Parse location from URL parameters
export const parseLocationFromParams = (params: string[]): LocationContext | null => {
  if (params.length < 1 || params.length > 3) return null;

  const [service, stateSlug, citySlug] = params;

  // Validate service (for now, only article-generation)
  if (service !== 'article-generation') return null;

  if (!stateSlug) {
    // Service-only page (shouldn't happen with our routing)
    return null;
  }

  // Find state
  const state = locationData.states.find(s => s.slug === stateSlug);
  if (!state) return null;

  if (!citySlug) {
    // State-only page
    return {
      service,
      state,
      isStateOnly: true,
      isCityPage: false
    };
  }

  // Find city within state
  const city = state.cities.find(c => c.slug === citySlug);
  if (!city) return null;

  // City + state page
  return {
    service,
    state,
    city,
    isStateOnly: false,
    isCityPage: true
  };
};

// Generate SEO metadata for location pages
export const generateLocationSEO = (context: LocationContext): LocationSEO => {
  const serviceName = formatServiceName(context.service);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://enhancemyseo.com';

  if (context.isCityPage && context.city && context.state) {
    // City-specific page
    const cityName = context.city.name;
    const stateName = context.state.name;
    
    return {
      title: `${serviceName} in ${cityName}, ${stateName} | EnhanceMySEO`,
      description: `Professional ${serviceName.toLowerCase()} services in ${cityName}, ${stateName}. AI-powered SEO content that ranks #1 on Google. Get started today!`,
      keywords: [
        `${serviceName.toLowerCase()} ${cityName}`,
        `${serviceName.toLowerCase()} ${stateName}`,
        `AI content ${cityName}`,
        `SEO services ${cityName}`,
        `article writing ${cityName}`,
        `content marketing ${stateName}`
      ],
      canonicalUrl: `${baseUrl}/services/${context.service}/${context.state.slug}/${context.city.slug}`
    };
  } else if (context.isStateOnly && context.state) {
    // State-only page
    const stateName = context.state.name;
    
    return {
      title: `${serviceName} in ${stateName} | EnhanceMySEO`,
      description: `Leading ${serviceName.toLowerCase()} services across ${stateName}. AI-powered SEO content for businesses statewide. Rank higher on Google today!`,
      keywords: [
        `${serviceName.toLowerCase()} ${stateName}`,
        `AI content ${stateName}`,
        `SEO services ${stateName}`,
        `article writing ${stateName}`,
        `content marketing ${stateName}`,
        `digital marketing ${stateName}`
      ],
      canonicalUrl: `${baseUrl}/services/${context.service}/${context.state.slug}`
    };
  }

  // Fallback
  return {
    title: `${serviceName} | EnhanceMySEO`,
    description: `Professional ${serviceName.toLowerCase()} services powered by AI`,
    keywords: [serviceName.toLowerCase()],
    canonicalUrl: `${baseUrl}/services/${context.service}`
  };
};

// Format service name for display
export const formatServiceName = (service: string): string => {
  switch (service) {
    case 'article-generation':
      return 'AI Article Generation';
    case 'keyword-research':
      return 'Keyword Research';
    case 'seo-optimization':
      return 'SEO Optimization';
    default:
      return service.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
  }
};

// Generate breadcrumb navigation
export const generateBreadcrumbs = (context: LocationContext) => {
  const breadcrumbs = [
    { name: 'Home', href: '/' }
  ];

  if (context.service) {
    breadcrumbs.push({
      name: formatServiceName(context.service),
      href: `/services/${context.service}`
    });
  }

  if (context.state) {
    breadcrumbs.push({
      name: context.state.name,
      href: `/services/${context.service}/${context.state.slug}`
    });
  }

  if (context.city) {
    breadcrumbs.push({
      name: context.city.name,
      href: `/services/${context.service}/${context.state!.slug}/${context.city.slug}`
    });
  }

  return breadcrumbs;
};

// Generate internal links for location pages
export const generateLocationLinks = (context: LocationContext) => {
  const links: { name: string; href: string; type: 'state' | 'city' | 'service' }[] = [];

  if (context.isCityPage && context.state) {
    // Link to state page
    links.push({
      name: `${formatServiceName(context.service)} in ${context.state.name}`,
      href: `/services/${context.service}/${context.state.slug}`,
      type: 'state'
    });

    // Link to other cities in the same state
    context.state.cities
      .filter(city => city.slug !== context.city?.slug)
      .slice(0, 5) // Limit to 5 related cities
      .forEach(city => {
        links.push({
          name: `${formatServiceName(context.service)} in ${city.name}`,
          href: `/services/${context.service}/${context.state!.slug}/${city.slug}`,
          type: 'city'
        });
      });
  } else if (context.isStateOnly && context.state) {
    // Link to all cities in the state
    context.state.cities.forEach(city => {
      links.push({
        name: `${formatServiceName(context.service)} in ${city.name}`,
        href: `/services/${context.service}/${context.state!.slug}/${city.slug}`,
        type: 'city'
      });
    });
  }

  return links;
};

// Generate schema.org structured data
export const generateLocationSchema = (context: LocationContext) => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://enhancemyseo.com';
  
  if (context.isCityPage && context.city && context.state) {
    return {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: `EnhanceMySEO - ${formatServiceName(context.service)}`,
      description: `Professional ${formatServiceName(context.service).toLowerCase()} services in ${context.city.name}, ${context.state.name}`,
      url: `${baseUrl}/services/${context.service}/${context.state.slug}/${context.city.slug}`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: context.city.name,
        addressRegion: context.state.name,
        addressCountry: 'US'
      },
      areaServed: {
        '@type': 'City',
        name: context.city.name,
        containedInPlace: {
          '@type': 'State',
          name: context.state.name
        }
      },
      serviceType: formatServiceName(context.service)
    };
  } else if (context.isStateOnly && context.state) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: `${formatServiceName(context.service)} in ${context.state.name}`,
      description: `Professional ${formatServiceName(context.service).toLowerCase()} services across ${context.state.name}`,
      url: `${baseUrl}/services/${context.service}/${context.state.slug}`,
      areaServed: {
        '@type': 'State',
        name: context.state.name
      },
      serviceType: formatServiceName(context.service),
      provider: {
        '@type': 'Organization',
        name: 'EnhanceMySEO'
      }
    };
  }

  return null;
};
