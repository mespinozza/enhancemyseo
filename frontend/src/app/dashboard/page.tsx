'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/firebase/auth-context';
import { useRouter } from 'next/navigation';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { brandProfileOperations, BrandProfile } from '@/lib/firebase/firestore';
import { blogOperations, Blog } from '@/lib/firebase/firestore';
import Link from 'next/link';
import { Key, FileText } from 'lucide-react';

interface BlogPost {
  id: string;
  title: string;
  createdAt: Date;
  status: 'draft' | 'published';
}

export default function DashboardHome() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Welcome to EnhanceMySEO</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Article Generation Card */}
        <Link 
          href="/dashboard/articles"
          className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 transition-colors"
        >
          <div className="flex items-center mb-4">
            <FileText className="w-6 h-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-semibold">Generate Article</h2>
          </div>
          <p className="text-gray-600">
            Create SEO-optimized articles tailored to your brand's voice and style.
            Choose from various content types and let AI do the heavy lifting.
          </p>
        </Link>

        {/* Keyword Generation Card */}
        <Link 
          href="/dashboard/keywords"
          className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 transition-colors"
        >
          <div className="flex items-center mb-4">
            <Key className="w-6 h-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-semibold">Generate Keywords</h2>
          </div>
          <p className="text-gray-600">
            Discover relevant keywords and topics to target in your content.
            Get insights into search volume and competition.
          </p>
        </Link>
      </div>

      {/* Quick Tips Section */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold mb-4">Quick Tips</h2>
        <div className="bg-blue-50 p-6 rounded-lg">
          <ul className="space-y-3">
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 mr-3">1</span>
              <p className="text-gray-700">Start by generating keywords related to your topic</p>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 mr-3">2</span>
              <p className="text-gray-700">Select the most relevant keywords for your content</p>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 mr-3">3</span>
              <p className="text-gray-700">Use these keywords to generate optimized articles</p>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-blue-100 text-blue-600 mr-3">4</span>
              <p className="text-gray-700">Review and edit the generated content to match your brand's voice</p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
} 