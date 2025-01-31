'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import Link from 'next/link';

export default function Footer() {
  const router = useRouter();
  const { user } = useAuth();

  const handleGenerateClick = () => {
    if (!user) {
      router.push('/register');
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <footer className="bg-gray-900 text-white py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Logo and Description */}
          <div className="col-span-1 lg:col-span-2">
            <Link href="/" className="inline-block">
              <div className="text-2xl font-bold mb-3 hover:text-blue-400 transition-colors">EnhanceMySeo</div>
            </Link>
            <p className="text-gray-400 mb-4">
              Try EnhanceMySeo today and start ranking your content like never before
            </p>
            {/* Social Links */}
            <div className="flex flex-col space-y-1">
              <p className="text-gray-400">Follow us on Social Media:</p>
              <div className="flex items-center space-x-3">
                <a
                  href="https://tiktok.com/@enhancemyseo.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  TikTok
                </a>
                <span className="text-gray-600">|</span>
                <a
                  href="https://www.linkedin.com/company/enhancemyseo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  LinkedIn
                </a>
              </div>
            </div>
          </div>

          {/* Useful Links */}
          <div>
            <h3 className="text-blue-500 font-semibold mb-4">Useful links</h3>
            <ul className="space-y-3">
              <li>
                <button
                  onClick={() => !user ? router.push('/login') : router.push('/dashboard')}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Login/Sign Up
                </button>
              </li>
              <li>
                <button
                  onClick={handleGenerateClick}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Start Generating
                </button>
              </li>
              <li>
                <Link href="/privacy-policy" className="text-gray-400 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-gray-400 hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-blue-500 font-semibold mb-4">Contact</h3>
            <div className="text-gray-400">
              <p className="mb-2">Got an agency? Speak with us today:</p>
              <button
                onClick={() => router.push('/contact')}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                enhancemyseoplz@gmail.com
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 mt-8 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              © {new Date().getFullYear()} EnhanceMySeo. All rights reserved.
            </p>
            <p className="text-gray-400 text-sm mt-2 md:mt-0">
              Created by{' '}
              <a
                href="https://www.linkedin.com/in/espinozamanny/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                Manny Espinoza
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
} 