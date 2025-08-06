export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      
      <div className="space-y-6 text-gray-600">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Information We Collect</h2>
          <p>We collect information that you provide directly to us when using our AI-powered content generation platform:</p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li><strong>Account Information:</strong> Name, email address, and password for your EnhanceMySeo account</li>
            <li><strong>Brand Profile Data:</strong> Brand names, descriptions, tone preferences, and target audience information</li>
            <li><strong>Shopify Integration Data:</strong> Shopify store credentials, product information, collections, and page data when you connect your store</li>
            <li><strong>Content Generation Data:</strong> Keywords, article topics, generated content, and your content preferences</li>
            <li><strong>Usage Analytics:</strong> Article generation counts, feature usage patterns, and subscription plan details</li>
            <li><strong>Payment Information:</strong> Billing details and transaction history (processed securely through third-party providers)</li>
            <li><strong>Technical Data:</strong> Browser type, device information, IP address, and website interaction data</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">2. How We Use Your Information</h2>
          <p>We use the collected information to provide and enhance our AI content generation services:</p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li><strong>Content Generation:</strong> Process your keywords and brand information to generate SEO-optimized articles</li>
            <li><strong>Shopify Integration:</strong> Access your store&apos;s products, collections, and pages to create relevant content links</li>
            <li><strong>Service Delivery:</strong> Maintain your account, track usage limits, and provide customer support</li>
            <li><strong>Payment Processing:</strong> Handle subscription billing and transaction processing</li>
            <li><strong>Platform Improvement:</strong> Analyze usage patterns to enhance our AI algorithms and user experience</li>
            <li><strong>Communication:</strong> Send service updates, usage notifications, and account-related messages</li>
            <li><strong>Compliance:</strong> Meet legal obligations and prevent fraud or misuse of our services</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Third-Party Services and AI Processing</h2>
          <p>Our platform integrates with several third-party services to deliver our AI content generation features:</p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li><strong>Anthropic Claude:</strong> Your content prompts and brand information are processed by Claude AI to generate articles</li>
            <li><strong>Shopify API:</strong> We access your Shopify store data to retrieve product, collection, and page information</li>
            <li><strong>Firebase (Google):</strong> User authentication, data storage, and analytics services</li>
            <li><strong>Payment Processors:</strong> Secure handling of subscription payments and billing</li>
            <li><strong>OpenAI (if applicable):</strong> Additional AI processing for keyword generation and content optimization</li>
          </ul>
          <p className="mt-4">These services have their own privacy policies and security measures. We ensure data is transmitted securely and only share information necessary for service delivery.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Data Security and Storage</h2>
          <p>
            We implement industry-standard security measures to protect your personal and business information:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li>Encrypted data transmission using HTTPS/TLS protocols</li>
            <li>Secure cloud storage with Firebase and Google Cloud infrastructure</li>
            <li>Access controls and authentication requirements for all data access</li>
            <li>Regular security audits and monitoring for potential threats</li>
            <li>Shopify credentials are securely stored and used only for authorized API access</li>
          </ul>
          <p className="mt-4">However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Data Retention and Deletion</h2>
          <p>We retain your information as follows:</p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li><strong>Account Data:</strong> Retained while your account is active and for a reasonable period after closure</li>
            <li><strong>Generated Content:</strong> Stored in your account for your access and management</li>
            <li><strong>Usage Analytics:</strong> Aggregated data may be retained for platform improvement purposes</li>
            <li><strong>Shopify Data:</strong> Refreshed regularly from your store; historical data retained per your preferences</li>
          </ul>
          <p className="mt-4">You can request data deletion by contacting us. Some data may be retained as required by law or for legitimate business purposes.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Your Rights and Controls</h2>
          <p>You have the following rights regarding your data:</p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li>Access and review your personal information and generated content</li>
            <li>Update or correct your account and brand profile information</li>
            <li>Delete your account and associated data</li>
            <li>Disconnect Shopify integration and remove store access</li>
            <li>Request data portability for your generated content</li>
            <li>Opt out of non-essential communications</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Cookies and Tracking</h2>
          <p>
            We use cookies and similar technologies to enhance your experience, maintain your session, 
            and analyze platform usage. You can control cookie settings through your browser preferences.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy or our data practices, please contact us at:{' '}
            <a href="mailto:enhancemyseoplz@gmail.com" className="text-blue-600 hover:text-blue-800">
              enhancemyseoplz@gmail.com
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. 
            We will notify you of any material changes by posting the new Privacy Policy on this page and updating the 
            &quot;Last updated&quot; date below.
          </p>
        </section>

        <p className="text-sm text-gray-500 mt-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
} 