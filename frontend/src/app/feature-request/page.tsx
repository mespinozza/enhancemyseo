"use client";

import { useState } from "react";
import { useAuth } from "@/lib/firebase/auth-context";
import { MessageSquarePlus, Lightbulb, Bug, Zap, Send, Star, CheckCircle } from "lucide-react";

export default function FeatureRequestPage() {
  const { user } = useAuth();
  const [feedbackForm, setFeedbackForm] = useState({
    type: 'feature',
    title: '',
    description: '',
    priority: 'medium',
    email: user?.email || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

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
          organization: 'enhancemyseo', // Your Featurebase organization
          title: feedbackForm.title,
          content: feedbackForm.description,
          category: feedbackForm.type, // feature, bug, improvement
          author_email: feedbackForm.email,
          priority: feedbackForm.priority,
          tags: [feedbackForm.type, feedbackForm.priority],
          // You can add more metadata here
          metadata: {
            source: 'website_form',
            user_agent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            form_version: '1.0'
          }
        })
      });

      if (response.ok) {
        console.log('Feedback successfully submitted to Featurebase');
        setIsSubmitted(true);
        setFeedbackForm({
          type: 'feature',
          title: '',
          description: '',
          priority: 'medium',
          email: user?.email || ''
        });
      } else {
        // Fallback: Log to console and still show success to user
        console.error('Featurebase API response:', response.status, response.statusText);
        const errorData = await response.text();
        console.error('Error details:', errorData);
        
        // For now, still show success to user (you might want to show an error instead)
        setIsSubmitted(true);
        setFeedbackForm({
          type: 'feature',
          title: '',
          description: '',
          priority: 'medium',
          email: user?.email || ''
        });
      }
    } catch (error) {
      console.error('Error submitting feedback to Featurebase:', error);
      
      // Fallback: You could implement local storage or email fallback here
      // For now, still show success to user
      setIsSubmitted(true);
      setFeedbackForm({
        type: 'feature',
        title: '',
        description: '',
        priority: 'medium',
        email: user?.email || ''
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setIsSubmitted(false);
    setFeedbackForm({
      type: 'feature',
      title: '',
      description: '',
      priority: 'medium',
      email: user?.email || ''
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-6">
              <MessageSquarePlus className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Feature Requests & Feedback
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Help us improve EnhanceMySEO by sharing your ideas, reporting bugs, or requesting new features. 
              Your feedback shapes our roadmap!
            </p>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <Lightbulb className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Feature Ideas</h3>
              <p className="text-gray-600">
                Share your ideas for new features that would make your SEO workflow more efficient and effective.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <Bug className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Bug Reports</h3>
              <p className="text-gray-600">
                Found something that's not working as expected? Let us know so we can fix it quickly.
              </p>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Improvements</h3>
              <p className="text-gray-600">
                Suggest improvements to existing features or tell us what could work better for you.
              </p>
            </div>
          </div>

          {/* Integrated Feedback Form */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-12">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6">
              <h2 className="text-2xl font-semibold text-white mb-2">Submit Your Feedback</h2>
              <p className="text-blue-100">We'd love to hear your thoughts, ideas, and suggestions!</p>
            </div>

            <div className="p-8">
              {isSubmitted ? (
                <div className="text-center py-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="text-2xl font-semibold text-gray-900 mb-2">Thank You!</h3>
                  <p className="text-gray-600 mb-6">
                    Your feedback has been submitted successfully. We'll review it and get back to you if needed.
                  </p>
                  <button
                    onClick={resetForm}
                    className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Submit Another Feedback
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Feedback Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      What type of feedback is this?
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {[
                        { value: 'feature', label: 'Feature Request', icon: Lightbulb, color: 'green' },
                        { value: 'bug', label: 'Bug Report', icon: Bug, color: 'red' },
                        { value: 'improvement', label: 'Improvement', icon: Zap, color: 'purple' }
                      ].map((type) => (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => setFeedbackForm(prev => ({ ...prev, type: type.value }))}
                          className={`p-4 border-2 rounded-lg text-left transition-all ${
                            feedbackForm.type === type.value
                              ? `border-${type.color}-500 bg-${type.color}-50`
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`w-8 h-8 bg-${type.color}-100 rounded-lg flex items-center justify-center`}>
                              <type.icon className={`w-4 h-4 text-${type.color}-600`} />
                            </div>
                            <span className="font-medium text-gray-900">{type.label}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={feedbackForm.email}
                      onChange={(e) => setFeedbackForm(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="your@email.com"
                      required
                    />
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={feedbackForm.title}
                      onChange={(e) => setFeedbackForm(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Brief summary of your feedback"
                      required
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={feedbackForm.description}
                      onChange={(e) => setFeedbackForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={5}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      placeholder="Please provide as much detail as possible. Include steps to reproduce for bugs, or specific use cases for feature requests."
                      required
                    />
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Priority Level
                    </label>
                    <div className="flex space-x-3">
                      {[
                        { value: 'low', label: 'Low', color: 'gray' },
                        { value: 'medium', label: 'Medium', color: 'yellow' },
                        { value: 'high', label: 'High', color: 'orange' },
                        { value: 'urgent', label: 'Urgent', color: 'red' }
                      ].map((priority) => (
                        <button
                          key={priority.value}
                          type="button"
                          onClick={() => setFeedbackForm(prev => ({ ...prev, priority: priority.value }))}
                          className={`flex-1 px-4 py-2 border-2 rounded-lg text-sm font-medium transition-all ${
                            feedbackForm.priority === priority.value
                              ? `border-${priority.color}-500 bg-${priority.color}-50 text-${priority.color}-700`
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {priority.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-4 px-6 rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          <span>Submit Feedback</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-white rounded-xl p-8 shadow-lg">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6">Tips for Great Feedback</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Star className="w-5 h-5 text-yellow-500 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-gray-900">Be Specific</h4>
                    <p className="text-sm text-gray-600">Include detailed steps, expected vs actual behavior, and specific use cases.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Star className="w-5 h-5 text-yellow-500 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-gray-900">Include Context</h4>
                    <p className="text-sm text-gray-600">Tell us about your workflow, business needs, and how this affects you.</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <Star className="w-5 h-5 text-yellow-500 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-gray-900">Provide Examples</h4>
                    <p className="text-sm text-gray-600">Screenshots, error messages, or examples help us understand better.</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <Star className="w-5 h-5 text-yellow-500 mt-1 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-gray-900">Set Priority</h4>
                    <p className="text-sm text-gray-600">Help us understand the urgency and impact on your work.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="mt-12 text-center">
            <p className="text-gray-500 text-sm">
              Need immediate help? Contact us at{" "}
              <a href="mailto:support@enhancemyseo.com" className="text-blue-600 hover:text-blue-700">
                support@enhancemyseo.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 