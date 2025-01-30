export default function Terms() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
      
      <div className="space-y-6 text-gray-600">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Terms</h2>
          <p>
            By accessing EnhanceMySeo, you agree to be bound by these Terms of Service and comply
            with all applicable laws and regulations. If you do not agree with any of these terms,
            you are prohibited from using or accessing this site.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Use License</h2>
          <p>
            Permission is granted to temporarily access the materials (information or software) on
            EnhanceMySeo's website for personal, non-commercial transitory viewing only.
          </p>
          <p className="mt-4">This license shall automatically terminate if you violate any of these restrictions.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Disclaimer</h2>
          <p>
            The materials on EnhanceMySeo's website are provided on an 'as is' basis.
            EnhanceMySeo makes no warranties, expressed or implied, and hereby disclaims and
            negates all other warranties including, without limitation, implied warranties or
            conditions of merchantability, fitness for a particular purpose, or non-infringement
            of intellectual property or other violation of rights.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Limitations</h2>
          <p>
            In no event shall EnhanceMySeo or its suppliers be liable for any damages
            (including, without limitation, damages for loss of data or profit, or due to
            business interruption) arising out of the use or inability to use the materials on
            EnhanceMySeo's website.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Accuracy of Materials</h2>
          <p>
            The materials appearing on EnhanceMySeo's website could include technical,
            typographical, or photographic errors. EnhanceMySeo does not warrant that any of
            the materials on its website are accurate, complete, or current.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Links</h2>
          <p>
            EnhanceMySeo has not reviewed all of the sites linked to its website and is not
            responsible for the contents of any such linked site. The inclusion of any link
            does not imply endorsement by EnhanceMySeo of the site.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Modifications</h2>
          <p>
            EnhanceMySeo may revise these terms of service for its website at any time without
            notice. By using this website, you are agreeing to be bound by the then current
            version of these terms of service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Contact</h2>
          <p>
            If you have any questions about these Terms, please contact us at:{' '}
            <a href="mailto:enhancemyseoplz@gmail.com" className="text-blue-600 hover:text-blue-800">
              enhancemyseoplz@gmail.com
            </a>
          </p>
        </section>

        <p className="text-sm text-gray-500 mt-8">
          Last updated: {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
} 