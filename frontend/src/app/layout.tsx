import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'EnhanceMySEO',
  description: 'AI-powered content generation for e-commerce',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-gradient-to-b from-white via-white to-blue-50/50 bg-fixed`}>
        <Providers>
          <MainLayout>
            {children}
          </MainLayout>
        </Providers>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
