'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import AdminGate from '@/components/results/AdminGate';
import CaseStudyEditor from '@/components/results/CaseStudyEditor';
import { useAuth } from '@/lib/firebase/auth-context';
import { CaseStudy } from '@/lib/results/types';

function Loader({ id }: { id: string }) {
  const { user } = useAuth();
  const [study, setStudy] = useState<CaseStudy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/results/${id}`, {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        });
        const result = await response.json();
        if (cancelled) return;
        if (!response.ok) throw new Error(result.error || 'Failed to load');
        setStudy(result.caseStudy);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, user]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900">{error}</h1>
          <Link
            href="/admin/results"
            className="mt-6 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Back to case studies
          </Link>
        </div>
      </div>
    );
  }

  if (!study) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return <CaseStudyEditor existing={study} />;
}

export default function EditCaseStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <AdminGate>
      <Loader id={id} />
    </AdminGate>
  );
}
