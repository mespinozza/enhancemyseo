'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import Link from 'next/link';
import { ArrowRight, TrendingUp, Users, BarChart3, Plus } from 'lucide-react';

// Define descriptions for each navigation item
const navDescriptions: Record<string, string> = {
  'Optimize Products': 'Optimize your Shopify product titles and descriptions with AI-powered SEO recommendations.',
  'Optimize Collections': 'Enhance your Shopify collection pages with SEO-optimized titles and descriptions.',
  'Generate Keywords': 'Discover relevant keywords and topics to target in your content. Get insights into search volume and competition.',
  'Generate Article': 'Create SEO-optimized articles tailored to your brand\'s voice and style. Choose from various content types and let AI do the heavy lifting.',
};

// Quick Feature Request Form Component
function FeatureRequestForm() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    type: 'feature',
    title: '',
    description: '',
    priority: 'medium'
  });

  // Listen for custom events from the Help Us Improve card
  useEffect(() => {
    const handleOpenFeatureRequest = (event: CustomEvent) => {
      const { type } = event.detail;
      setFormData(prev => ({ ...prev, type }));
      setIsOpen(true);
    };

    window.addEventListener('openFeatureRequest', handleOpenFeatureRequest as EventListener);
    
    return () => {
      window.removeEventListener('openFeatureRequest', handleOpenFeatureRequest as EventListener);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Send to Featurebase API
      const response = await fetch('https://do.featurebase.app/api/v1/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          organization: 'enhancemyseo',
          title: formData.title,
          content: formData.description,
          category: formData.type,
          author_email: user?.email || '',
          priority: formData.priority,
          tags: [formData.type, formData.priority, 'dashboard-request'],
          metadata: {
            source: 'dashboard_quick_form',
            user_agent: navigator.userAgent,
            timestamp: new Date().toISOString()
          }
        })
      });

      if (response.ok) {
        console.log('Feature request submitted successfully');
        setIsSubmitted(true);
        setFormData({ type: 'feature', title: '', description: '', priority: 'medium' });
        setTimeout(() => {
          setIsOpen(false);
          setIsSubmitted(false);
        }, 2000);
      } else {
        console.error('Feature request submission failed:', response.status);
        // Still show success for better UX
        setIsSubmitted(true);
        setTimeout(() => {
          setIsOpen(false);
          setIsSubmitted(false);
        }, 2000);
      }
    } catch (error) {
      console.error('Error submitting feature request:', error);
      // Still show success for better UX
      setIsSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsSubmitted(false);
      }, 2000);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <div className="flex items-center space-x-3">
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Request Feature</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      {isSubmitted ? (
        <div className="text-center py-4">
          <svg className="w-8 h-8 text-green-600 mx-auto mb-2" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
          <p className="text-green-700 font-medium">Thank you! Your request has been submitted.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900">Quick Feature Request</h4>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          
          <div className="flex space-x-2">
            {[
              { value: 'feature', label: 'Feature' },
              { value: 'bug', label: 'Bug' },
              { value: 'improvement', label: 'Improvement' }
            ].map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, type: type.value }))}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  formData.type === type.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Brief title of your request..."
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            required
          />

          <textarea
            placeholder="Describe your request in detail..."
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
            rows={3}
            required
          />

          <div className="flex items-center justify-between">
            <select
              value={formData.priority}
              onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
            </select>

            <button
              type="submit"
              disabled={isSubmitting || !formData.title.trim() || !formData.description.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2 text-sm"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{isSubmitting ? 'Submitting...' : 'Submit'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function DashboardHome() {
  const { subscription_status } = useAuth();
  
  // Get filtered navigation based on user's subscription status
  const availableFeatures = [
    { name: 'Optimize Products', href: '/optimize-products', icon: TrendingUp, requiredSubscription: ['admin', 'free'] },
    { name: 'Optimize Collections', href: '/optimize-collections', icon: Users, requiredSubscription: ['admin', 'free'] },
    { name: 'Generate Keywords', href: '/generate-keywords', icon: BarChart3, requiredSubscription: ['admin', 'free'] },
    { name: 'Generate Article', href: '/generate-article', icon: ArrowRight, requiredSubscription: ['admin', 'free'] },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">
        Welcome to <span className="bg-gradient-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">EnhanceMySEO</span>
      </h1>
      
      {/* Subscription Status Indicator */}
      {subscription_status === 'admin' && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                Admin Subscription Active - You have access to all features including Products, Collections, and Keywords optimization.
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Dynamic Feature Cards based on user access */}
        {availableFeatures.map((feature) => (
          <Link 
            key={feature.name}
            href={feature.href}
            className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 transition-colors group"
          >
            <div className="flex items-center mb-4">
              <feature.icon className="w-6 h-6 text-blue-600 mr-3 group-hover:text-blue-700" />
              <h2 className="text-xl font-semibold">{feature.name}</h2>
              {feature.requiredSubscription?.includes('admin') && !feature.requiredSubscription.includes('free') && (
                <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                  Admin
                </span>
              )}
            </div>
            <p className="text-gray-600 mb-4">
              {navDescriptions[feature.name] || 'Advanced feature for enhanced SEO optimization.'}
            </p>
            
            {/* Visual Elements for Generate Article */}
            {feature.name === 'Generate Article' && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg">
                <div className="flex items-center text-sm text-gray-700 mb-3">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  <span className="font-medium">AI-Powered Content Creation</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                  <div className="flex items-center">
                    <span className="mr-2">📝</span>
                    <span>SEO Optimized</span>
                  </div>
                  <div className="flex items-center">
                    <span className="mr-2">🎯</span>
                    <span>Brand Voice</span>
                  </div>
                  <div className="flex items-center">
                    <span className="mr-2">⚡</span>
                    <span>Fast Generation</span>
                  </div>
                  <div className="flex items-center">
                    <span className="mr-2">🔍</span>
                    <span>Keyword Rich</span>
                  </div>
                </div>
              </div>
            )}

            {/* Visual Elements for Generate Keywords */}
            {feature.name === 'Generate Keywords' && (
              <div className="space-y-3">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg">
                  <div className="flex items-center text-sm text-gray-700 mb-3">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    <span className="font-medium">Smart Keyword Research</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                    <div className="flex items-center">
                      <span className="mr-2">📊</span>
                      <span>Search Volume</span>
                    </div>
                    <div className="flex items-center">
                      <span className="mr-2">🏆</span>
                      <span>Competition</span>
                    </div>
                    <div className="flex items-center">
                      <span className="mr-2">💡</span>
                      <span>Suggestions</span>
                    </div>
                    <div className="flex items-center">
                      <span className="mr-2">🎯</span>
                      <span>Relevance</span>
                    </div>
                  </div>
                </div>
                {/* Sample keyword tags preview */}
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">seo tools</span>
                  <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">content marketing</span>
                  <span className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-full text-sm">+ 50 more</span>
                </div>
              </div>
            )}

            {/* Default visual for other features */}
            {feature.name !== 'Generate Article' && feature.name !== 'Generate Keywords' && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-full text-sm font-medium group-hover:bg-blue-700 transition-colors">
                  <span>Get Started →</span>
                </div>
              </div>
            )}
          </Link>
        ))}

        {/* Help Us Improve Card */}
        <div className="p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 transition-colors group">
          <div className="flex items-center mb-4">
            <Plus className="w-6 h-6 text-blue-600 mr-3 group-hover:text-blue-700" />
            <h2 className="text-xl font-semibold">Help Us Improve</h2>
          </div>
          <p className="text-gray-600 mb-4">
            Share your ideas, report bugs, or suggest improvements. Your feedback helps us build exactly what you need.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => {
                // Create and dispatch a custom event to open the feature request form
                const event = new CustomEvent('openFeatureRequest', { detail: { type: 'feature' } });
                window.dispatchEvent(event);
              }}
              className="w-full text-left px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors flex items-center"
            >
              <span className="w-4 h-4 mr-2">💡</span>
              Request a Feature
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('openFeatureRequest', { detail: { type: 'bug' } });
                window.dispatchEvent(event);
              }}
              className="w-full text-left px-3 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors flex items-center"
            >
              <span className="w-4 h-4 mr-2">🐛</span>
              Report a Bug
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('openFeatureRequest', { detail: { type: 'improvement' } });
                window.dispatchEvent(event);
              }}
              className="w-full text-left px-3 py-2 text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors flex items-center"
            >
              <span className="w-4 h-4 mr-2">⚡</span>
              Suggest Improvement
            </button>
          </div>
        </div>
      </div>

      {/* Shopify Connection Guide */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">How to Connect with EnhanceMySEO</h2>
          <div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            💡 Save these details in your Brand Profile settings
          </div>
        </div>
        
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6">
          {/* Simplified Steps Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {/* Step 1 */}
            <div className="bg-white rounded-lg p-4 border-l-4 border-blue-300 shadow-sm">
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 bg-blue-300 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">1</div>
                <h3 className="font-semibold text-gray-900">Access Apps</h3>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div>📂 Shopify Admin → <strong>Apps</strong></div>
                <div>➡️ <strong>&quot;App and sales channel settings&quot;</strong></div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-lg p-4 border-l-4 border-blue-400 shadow-sm">
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 bg-blue-400 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">2</div>
                <h3 className="font-semibold text-gray-900">Create App</h3>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div>🛠️ <strong>&quot;Develop apps for your store&quot;</strong></div>
                <div>📝 Name: &quot;EnhanceMySEO Connector&quot;</div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-lg p-4 border-l-4 border-blue-500 shadow-sm">
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">3</div>
                <h3 className="font-semibold text-gray-900">Set Scopes</h3>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div>🔐 <strong>&quot;Configure Admin API scopes&quot;</strong></div>
                <div className="text-blue-600 font-medium">✨ Select ALL scopes for full functionality</div>
                <div className="text-xs text-gray-500">This ensures all tools work to their fullest potential</div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-white rounded-lg p-4 border-l-4 border-blue-600 shadow-sm">
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">4</div>
                <h3 className="font-semibold text-gray-900">Install App</h3>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div>🚀 Go to <strong>&quot;Install app&quot;</strong> tab</div>
                <div className="text-red-600 font-medium">⚠️ Copy Access Token immediately!</div>
              </div>
            </div>

            {/* Step 5 */}
            <div className="bg-white rounded-lg p-4 border-l-4 border-blue-700 shadow-sm">
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 bg-blue-700 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">5</div>
                <h3 className="font-semibold text-gray-900">Get Credentials</h3>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div>🔑 <strong>&quot;API credentials&quot;</strong> tab</div>
                <div>✅ API Key, Secret Key, Store URL</div>
              </div>
            </div>

            {/* Step 6 */}
            <div className="bg-white rounded-lg p-4 border-l-4 border-blue-800 shadow-sm">
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 bg-blue-800 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">6</div>
                <h3 className="font-semibold text-gray-900">Save to Profile</h3>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div>💾 Add to Brand Profile settings</div>
                <div>🎯 Start optimizing your store!</div>
              </div>
            </div>
          </div>

          {/* Credentials Checklist */}
          <div className="bg-white rounded-lg p-4 border border-gray-200 mb-4">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
              <span className="text-blue-600 mr-2">📋</span>
              Credentials Checklist
            </h3>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center p-2 bg-blue-50 rounded">
                <span className="text-blue-600 mr-2">✅</span>
                <span>Shopify API Key</span>
              </div>
              <div className="flex items-center p-2 bg-blue-50 rounded">
                <span className="text-blue-600 mr-2">✅</span>
                <span>API Secret Key</span>
              </div>
              <div className="flex items-center p-2 bg-blue-50 rounded">
                <span className="text-blue-600 mr-2">✅</span>
                <span>Access Token</span>
              </div>
              <div className="flex items-center p-2 bg-blue-50 rounded">
                <span className="text-blue-600 mr-2">✅</span>
                <span>Store URL</span>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center">
            <div className="flex items-center justify-center space-x-4">
              <Link 
                href="/dashboard/settings/brands" 
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                Go to Brand Profile Settings
              </Link>
              <div className="text-xs text-gray-500">
                Save your credentials to get started
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Request Section for Non-Admin Users */}
      {subscription_status !== 'admin' && (
        <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Want More Features?</h3>
              <p className="text-gray-600 mb-4">
                Missing a feature or have an idea to improve EnhanceMySEO? We&apos;d love to hear from you! Your feedback helps us build exactly what you need.
              </p>
              
              {/* Quick Feature Request Form */}
              <FeatureRequestForm />
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 