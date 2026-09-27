'use client';

import { Loader2, Lock } from 'lucide-react';

interface ComingSoonCardProps {
  industry: string;
}

const REDACTED = '████████████';

export default function ComingSoonCard({ industry }: ComingSoonCardProps) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm select-none cursor-not-allowed">

      {/* Blurred screenshot placeholder */}
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200">
        {/* Fake chart lines */}
        <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 400 176" preserveAspectRatio="none">
          <polyline points="0,120 60,90 120,100 180,60 240,75 300,40 360,55 400,30" fill="none" stroke="#6366F1" strokeWidth="2" />
          <polyline points="0,150 60,130 120,140 180,100 240,115 300,80 360,90 400,65" fill="none" stroke="#3B82F6" strokeWidth="1.5" />
        </svg>
        {/* Blur overlay */}
        <div className="absolute inset-0 backdrop-blur-sm bg-white/40" />
        {/* Lock badge */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 rounded-full bg-gray-900/80 px-4 py-2 text-white text-xs font-semibold backdrop-blur-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Currently working on this
            </div>
          </div>
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col p-6">
        {/* Header row — only industry shown, rest redacted */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-300 tracking-widest text-sm">{REDACTED}</span>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
            {industry}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-600">
            <Loader2 className="w-3 h-3 animate-spin" />
            Coming Soon
          </span>
        </div>

        {/* Title — redacted */}
        <div className="space-y-2 mb-3">
          <div className="h-4 w-3/4 rounded bg-gray-100 animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-gray-100 animate-pulse" />
        </div>

        {/* Date — redacted */}
        <div className="h-3 w-1/3 rounded bg-gray-100 animate-pulse mb-3" />

        {/* Summary — redacted lines */}
        <div className="space-y-1.5 mb-4">
          <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-gray-100 animate-pulse" />
          <div className="h-3 w-4/6 rounded bg-gray-100 animate-pulse" />
        </div>

        {/* Metrics — redacted */}
        <div className="mt-auto grid grid-cols-2 gap-4 border-t border-gray-100 pt-5">
          {['Clicks', 'Impressions'].map((label) => (
            <div key={label}>
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                <Lock className="w-3 h-3" />
                {label}
              </div>
              <div className="h-6 w-20 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>

        {/* CTA — hidden */}
        <div className="mt-5 flex items-center gap-1 text-sm font-medium text-gray-200">
          Details hidden until published
        </div>
      </div>
    </div>
  );
}
