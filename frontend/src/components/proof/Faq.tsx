'use client';

import { ChevronDown } from 'lucide-react';
import { FAQS } from '@/lib/proof/content';
import { useProofTrack } from './ProofProvider';

export default function Faq() {
  const send = useProofTrack();

  return (
    <div className="divide-y divide-gray-200 rounded-2xl bg-white px-5 shadow-sm ring-1 ring-gray-200 sm:px-8">
      {FAQS.map(({ q, a }, index) => (
        <details
          key={q}
          className="group py-1"
          onToggle={(event) => {
            if ((event.currentTarget as HTMLDetailsElement).open) send('faq_open', { question: index + 1 });
          }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left font-medium text-gray-900 transition-colors hover:text-blue-600 [&::-webkit-details-marker]:hidden">
            {q}
            <ChevronDown className="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="pb-5 text-sm leading-relaxed text-gray-600 sm:text-[15px]">{a}</p>
        </details>
      ))}
    </div>
  );
}
