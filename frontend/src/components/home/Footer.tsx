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
    <footer className="bg-gray-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Logo and Description */}
          <div className="col-span-1 lg:col-span-2">
            <Link href="/" className="inline-block">
              <div className="text-2xl font-bold mb-4 hover:text-blue-400 transition-colors">EnhanceMySeo</div>
            </Link>
            <p className="text-gray-400 mb-6">
              Try EnhanceMySeo today and start ranking your content like never before
            </p>
            {/* Social Links */}
            <div className="flex space-x-4">
              <a
                href="https://tiktok.com/@enhancemyseo.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 015.43 5.5C4.71 5.11 4 4.74 3.3 4.37l1.35 2.28A4.27 4.27 0 018.91 9c2.36-.01 4.27-1.92 4.27-4.27v-8.27c1.65.17 3.22.72 4.54 1.6A7.991 7.991 0 0124 5.82v-2.3C21.27.29 17.12-.48 13.04.29v2.3c-1.65-.17-3.22-.72-4.54-1.6A7.991 7.991 0 012.23 5.82v2.3c2.73 3.23 6.88 4 10.96 3.23v-2.3z" />
                </svg>
              </a>
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
        <div className="border-t border-gray-800 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              © {new Date().getFullYear()} EnhanceMySeo. All rights reserved.
            </p>
            <p className="text-gray-400 text-sm mt-4 md:mt-0">
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