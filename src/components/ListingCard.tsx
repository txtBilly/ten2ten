'use client';

import Link from 'next/link';
import { VerifiedBadge } from '@/components/VerifiedBadge';

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-10-9.3C.6 8 2 4.5 5.4 3.6c2-.5 4 .3 5.1 2 .3.4.7.4 1 0 1.1-1.7 3.1-2.5 5.1-2 3.4.9 4.8 4.4 3.4 7.6-2.5 4.7-10 9.3-10 9.3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type ListingCardData = {
  id: string;
  href: string;
  photoUrl: string | null;
  neighborhood: string;
  crossStreets: string;
  rentLabel: string;
  typeLabel: string;
  negotiating: boolean;
  negotiatingLabel: string;
  amenityLabels: string[];
  availableLabel: string | null;
  minCreditScoreLabel: string | null;
  verified: boolean;
  favourited: boolean;
  favouriteAddLabel: string;
  favouriteRemoveLabel: string;
};

export function ListingCard({
  listing,
  onToggleFavourite,
}: {
  listing: ListingCardData;
  onToggleFavourite: (id: string, currentlyFavourited: boolean) => void;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink/40">
      <Link href={listing.href} className="block">
        <div className="relative aspect-[4/3] w-full bg-white/5">
          {listing.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={listing.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted/60">—</div>
          )}
          {listing.negotiating && (
            <span className="absolute left-2 top-2 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
              {listing.negotiatingLabel}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-display text-lg text-paper">{listing.neighborhood}</p>
              <p className="text-sm text-muted">{listing.crossStreets}</p>
            </div>
            {listing.verified && <VerifiedBadge />}
          </div>

          <div className="flex items-center gap-2 text-sm text-paper">
            <span className="font-medium">{listing.rentLabel}</span>
            <span className="text-muted">·</span>
            <span className="text-muted">{listing.typeLabel}</span>
          </div>

          {(listing.amenityLabels.length > 0 || listing.availableLabel) && (
            <div className="flex flex-wrap gap-1.5 text-xs text-muted">
              {listing.amenityLabels.map((label) => (
                <span key={label} className="rounded-full border border-white/10 px-2 py-0.5">
                  {label}
                </span>
              ))}
              {listing.availableLabel && (
                <span className="rounded-full border border-white/10 px-2 py-0.5">{listing.availableLabel}</span>
              )}
            </div>
          )}

          {listing.minCreditScoreLabel && <p className="text-xs text-muted">{listing.minCreditScoreLabel}</p>}
        </div>
      </Link>

      <button
        type="button"
        aria-pressed={listing.favourited}
        aria-label={listing.favourited ? listing.favouriteRemoveLabel : listing.favouriteAddLabel}
        onClick={() => onToggleFavourite(listing.id, listing.favourited)}
        className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink/70 backdrop-blur transition ${
          listing.favourited ? 'text-gold' : 'text-paper hover:text-gold'
        }`}
      >
        <HeartIcon filled={listing.favourited} />
      </button>
    </article>
  );
}
