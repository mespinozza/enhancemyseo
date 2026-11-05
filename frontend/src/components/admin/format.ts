import type { Plan } from '@/lib/admin/customers';

export const PLAN_STYLES: Record<Plan, string> = {
  free: 'bg-gray-100 text-gray-700',
  kickstart: 'bg-blue-100 text-blue-800',
  seo_takeover: 'bg-indigo-100 text-indigo-800',
  agency: 'bg-amber-100 text-amber-800',
  admin: 'bg-gray-900 text-white',
};

export const money = (value: number, digits = 0) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

export function relative(iso: string | null): string {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
