/**
 * Marks a store we are still working with. The dot is the whole point: it reads as a
 * live status rather than a label, which is what separates an ongoing relationship
 * from a case study that finished two years ago.
 */
export default function ActiveClientBadge({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        tone === 'dark' ? 'bg-blue-400/10 text-blue-300' : 'bg-blue-50 text-blue-700'
      }`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
      </span>
      Active client
    </span>
  );
}
