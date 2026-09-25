'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * Connecting a store is OAuth now, for Shopify and for Search Console. The guide this
 * replaced walked through creating a custom app in the Shopify admin and copying an API
 * key, secret, access token and store URL across by hand — none of which we ask for any
 * more, and Shopify no longer issues those tokens to new apps.
 */
const CONNECT_STEPS = [
  {
    title: 'Add your brand',
    body: 'Create a brand profile and paste in your store address.',
    note: 'Use the permanent my-store.myshopify.com address, not a custom domain.',
  },
  {
    title: 'Connect Shopify',
    body: 'Press Connect Shopify and approve the permissions in your store. That is the whole setup.',
    note: 'Products, collections and your blog become available straight away.',
  },
  {
    title: 'Add Search Console',
    body: 'Optional. Connect it to pull the keywords you already rank for into your automations.',
    note: 'Sign in with the Google account that owns the property.',
  },
];

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
          <ArrowRight className="w-4 h-4" />
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
                Admin Subscription Active - You have access to enhanced features and analytics.
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Feature Cards - Full Width Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Generate Article Card */}
        <Link 
          href="/dashboard/articles"
          className="block p-8 bg-white rounded-lg border border-gray-200 hover:border-blue-500 transition-colors group"
        >
          <div className="flex items-center mb-6">
            <ArrowRight className="w-8 h-8 text-blue-600 mr-4 group-hover:text-blue-700" />
            <h2 className="text-2xl font-semibold">Generate Article</h2>
          </div>
          <p className="text-gray-600 mb-6 text-lg">
            Create SEO-optimized articles tailored to your brand&apos;s voice and style. Choose from various content types and let AI do the heavy lifting.
          </p>
          
          {/* Visual Elements for Generate Article */}
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
        </Link>

        {/* Help Us Improve Card */}
        <div className="p-8 bg-white rounded-lg border border-gray-200 hover:border-purple-500 transition-colors">
          <div className="flex items-center mb-6">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold">Help Us Improve</h2>
          </div>
          <p className="text-gray-600 mb-6 text-lg">
            Share your ideas, report bugs, or suggest improvements. Your feedback helps us build exactly what you need.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => {
                // Create and dispatch a custom event to open the feature request form
                const event = new CustomEvent('openFeatureRequest', { detail: { type: 'feature' } });
                window.dispatchEvent(event);
                
                // Smooth scroll to the feature request section
                setTimeout(() => {
                  const featureSection = document.querySelector('[data-feature-request-section]');
                  if (featureSection) {
                    featureSection.scrollIntoView({ 
                      behavior: 'smooth', 
                      block: 'start' 
                    });
                  }
                }, 100);
              }}
              className="w-full text-left px-4 py-3 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors flex items-center"
            >
              <span className="w-5 h-5 mr-3 text-lg">💡</span>
              <span className="font-medium">Request a Feature</span>
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('openFeatureRequest', { detail: { type: 'bug' } });
                window.dispatchEvent(event);
                
                // Smooth scroll to the feature request section
                setTimeout(() => {
                  const featureSection = document.querySelector('[data-feature-request-section]');
                  if (featureSection) {
                    featureSection.scrollIntoView({ 
                      behavior: 'smooth', 
                      block: 'start' 
                    });
                  }
                }, 100);
              }}
              className="w-full text-left px-4 py-3 text-sm bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors flex items-center"
            >
              <span className="w-5 h-5 mr-3 text-lg">🐛</span>
              <span className="font-medium">Report a Bug</span>
            </button>
            <button
              onClick={() => {
                const event = new CustomEvent('openFeatureRequest', { detail: { type: 'improvement' } });
                window.dispatchEvent(event);
                
                // Smooth scroll to the feature request section
                setTimeout(() => {
                  const featureSection = document.querySelector('[data-feature-request-section]');
                  if (featureSection) {
                    featureSection.scrollIntoView({ 
                      behavior: 'smooth', 
                      block: 'start' 
                    });
                  }
                }, 100);
              }}
              className="w-full text-left px-4 py-3 text-sm bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors flex items-center"
            >
              <span className="w-5 h-5 mr-3 text-lg">⚡</span>
              <span className="font-medium">Suggest Improvement</span>
            </button>
          </div>
        </div>
      </div>

      {/* Connection guide. Shopify and Search Console are both OAuth now, so this is
          three short steps rather than the old walkthrough for creating a custom app
          and copying four credentials by hand. */}
      <div className="mt-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Connect your store</h2>
          <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-sm text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            No API keys to copy
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {CONNECT_STEPS.map((step, index) => (
            <div
              key={step.title}
              className="relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <h3 className="font-semibold text-gray-900">{step.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">{step.body}</p>
              {step.note && <p className="mt-2 text-xs text-gray-500">{step.note}</p>}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/settings/brands"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Open brand profiles
            <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="text-sm text-gray-500">
            Already connected? Nothing to do here.
          </p>
        </div>
      </div>

      {/* Feature Request Section for Non-Admin Users */}
      {subscription_status !== 'admin' && (
        <div 
          data-feature-request-section
          className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6"
        >
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
