'use client';

import AdminGate from '@/components/results/AdminGate';
import CaseStudyEditor from '@/components/results/CaseStudyEditor';

export default function NewCaseStudyPage() {
  return (
    <AdminGate>
      <CaseStudyEditor />
    </AdminGate>
  );
}
