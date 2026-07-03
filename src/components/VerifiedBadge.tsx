export function VerifiedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-sage/20 px-2 py-0.5 text-xs font-medium text-sage ${className}`}
      aria-label="Identity verified"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <circle cx="5" cy="5" r="5" fill="currentColor" opacity="0.3" />
        <path d="M3 5l1.5 1.5L7 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Verified
    </span>
  );
}
