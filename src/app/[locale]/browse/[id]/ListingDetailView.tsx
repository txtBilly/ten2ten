'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';
import { listingPhotoUrl, listingTypeLabel } from '@/lib/listings';
import { VerifiedBadge } from '@/components/VerifiedBadge';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Español',
  zh: '中文',
  ru: 'Русский',
  fr: 'Français',
  pt: 'Português',
  ar: 'العربية',
  ko: '한국어',
};

type ListingDetail = {
  id: string;
  lister_id: string;
  neighborhood: string | null;
  cross_streets: string | null;
  zip: string | null;
  type: string | null;
  monthly_rent: number | null;
  floor: string | null;
  sqft: number | null;
  description: string | null;
  available_from: string | null;
  pets_ok: boolean | null;
  laundry: boolean | null;
  doorman: boolean | null;
  elevator: boolean | null;
  outdoor: boolean | null;
  no_fee: boolean | null;
  walk_up: boolean | null;
  min_credit_score: number | null;
  gratitude_amount: number | null;
  status: string;
};

type Lister = {
  display_first_name: string;
  is_verified: boolean;
  rating_avg: number | null;
  rating_count: number;
  spoken_languages: string[] | null;
};

export default function ListingDetailView({ locale, id }: { locale: Locale; id: string }) {
  const d = getDictionary(locale);
  const l = d.listing;
  const b = d.browse;
  const dd = d.listingDetail;
  const router = useRouter();

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [lister, setLister] = useState<Lister | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [favourited, setFavourited] = useState(false);
  const [connectStub, setConnectStub] = useState(false);

  useEffect(() => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      setError(dd.errorGeneric);
      setPhase('error');
    }, 12000);

    function finish() {
      if (settled) return false;
      settled = true;
      clearTimeout(timeoutId);
      return true;
    }

    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (settled) return;
      setUserId(user?.id ?? null);

      const { data: row, error: listingError } = await supabase
        .from('listings')
        .select(
          'id, lister_id, neighborhood, cross_streets, zip, type, monthly_rent, floor, sqft, description, available_from, pets_ok, laundry, doorman, elevator, outdoor, no_fee, walk_up, min_credit_score, gratitude_amount, status'
        )
        .eq('id', id)
        .single();
      if (settled) return;

      if (listingError || !row || !['active', 'negotiating'].includes(row.status)) {
        finish();
        notFound();
        return;
      }

      const [photosResult, listerResult, favouriteResult] = await Promise.all([
        supabase
          .from('listing_photos')
          .select('storage_path, slot, sort_order')
          .eq('listing_id', id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('public_profile_summary')
          .select('display_first_name, is_verified, rating_avg, rating_count, spoken_languages')
          .eq('id', row.lister_id)
          .single(),
        user
          ? supabase.from('favourites').select('listing_id').eq('seeker_id', user.id).eq('listing_id', id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (settled) return;

      if (!finish()) return;
      setListing(row);
      setPhotos((photosResult.data ?? []).map((p) => listingPhotoUrl(p.storage_path)));
      setLister(listerResult.data ?? null);
      setFavourited(!!favouriteResult.data);
      setPhase('ready');
    }

    load().catch(() => {
      if (!finish()) return;
      setError(dd.errorGeneric);
      setPhase('error');
    });

    return () => {
      settled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, locale]);

  async function handleToggleFavourite() {
    if (!userId) {
      router.push(`/${locale}/signin`);
      return;
    }
    const next = !favourited;
    setFavourited(next);
    const supabase = createClient();
    const { error: toggleError } = next
      ? await supabase.from('favourites').insert({ seeker_id: userId, listing_id: id })
      : await supabase.from('favourites').delete().eq('seeker_id', userId).eq('listing_id', id);
    if (toggleError) setFavourited(!next);
  }

  if (phase === 'loading') {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-5 text-center">
        <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <p className="text-sm text-muted">{dd.loading}</p>
      </main>
    );
  }

  if (phase === 'error' || !listing) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="mb-4 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <p role="alert" className="text-sm text-red-400">
          {error || dd.errorGeneric}
        </p>
      </main>
    );
  }

  const typeLabel = listingTypeLabel(listing.type, l);

  const amenityLabels: string[] = [];
  if (listing.laundry) amenityLabels.push(l.amenityLaundry);
  if (listing.pets_ok) amenityLabels.push(l.amenityPetsOk);
  if (listing.elevator) amenityLabels.push(l.amenityElevator);
  if (listing.walk_up) amenityLabels.push(l.amenityWalkUp);
  if (listing.doorman) amenityLabels.push(l.amenityDoorman);
  if (listing.outdoor) amenityLabels.push(l.amenityOutdoor);
  if (listing.no_fee) amenityLabels.push(l.amenityNoFee);

  const dateLocale = locale === 'es' ? 'es-ES' : 'en-US';
  const availableLabel = listing.available_from
    ? new Date(`${listing.available_from}T00:00:00`).toLocaleDateString(dateLocale, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const ratingLabel =
    lister && lister.rating_count > 0
      ? dd.ratingLabel.replace('{avg}', String(lister.rating_avg ?? '—')).replace('{count}', String(lister.rating_count))
      : dd.noRatings;

  const languageNames = (lister?.spoken_languages ?? []).map((code) => LANGUAGE_NAMES[code] ?? code).join(', ');

  return (
    <main className="mx-auto max-w-3xl px-5 py-16">
      <Link href={`/${locale}/browse`} className="mb-6 inline-block text-sm text-muted hover:text-paper">
        ‹ {dd.backToBrowse}
      </Link>

      {photos.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              className={`aspect-[4/3] w-full rounded-xl object-cover ${i === 0 ? 'col-span-2 sm:col-span-2 sm:row-span-2' : ''}`}
            />
          ))}
        </div>
      )}

      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-paper">{listing.neighborhood}</h1>
          <p className="text-muted">
            {listing.cross_streets}
            {listing.zip ? ` · ${listing.zip}` : ''}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={favourited}
          aria-label={favourited ? b.favouriteRemove : b.favouriteAdd}
          onClick={handleToggleFavourite}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 transition ${
            favourited ? 'text-gold' : 'text-muted hover:text-paper'
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={favourited ? 'currentColor' : 'none'} aria-hidden="true">
            <path
              d="M12 20.5s-7.5-4.6-10-9.3C.6 8 2 4.5 5.4 3.6c2-.5 4 .3 5.1 2 .3.4.7.4 1 0 1.1-1.7 3.1-2.5 5.1-2 3.4.9 4.8 4.4 3.4 7.6-2.5 4.7-10 9.3-10 9.3Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-paper">
        <span className="text-xl font-medium">
          {listing.monthly_rent != null ? `$${listing.monthly_rent.toLocaleString('en-US')}/mo` : ''}
        </span>
        <span className="text-muted">·</span>
        <span className="text-muted">{typeLabel}</span>
        {listing.floor && (
          <>
            <span className="text-muted">·</span>
            <span className="text-muted">{l.floorLabel}: {listing.floor}</span>
          </>
        )}
        {listing.sqft != null && (
          <>
            <span className="text-muted">·</span>
            <span className="text-muted">{listing.sqft} {l.sqftLabel.toLowerCase()}</span>
          </>
        )}
      </div>

      {amenityLabels.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {amenityLabels.map((label) => (
            <span key={label} className="rounded-full border border-white/10 px-3 py-1 text-sm text-muted">
              {label}
            </span>
          ))}
        </div>
      )}

      {listing.description && (
        <div className="mb-6">
          <h2 className="mb-2 font-display text-lg text-paper">{l.descriptionLabel}</h2>
          <p className="whitespace-pre-wrap text-sm text-muted">{listing.description}</p>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-1 text-sm text-muted">
        {availableLabel && <p>{l.availableFromLabel}: {availableLabel}</p>}
        {listing.min_credit_score != null && <p>{b.minCreditScore.replace('{score}', String(listing.min_credit_score))}</p>}
        {listing.gratitude_amount != null && (
          <p>
            {l.gratitudeLabel}: ${listing.gratitude_amount.toLocaleString('en-US')} — {l.gratitudeHint}
          </p>
        )}
      </div>

      {lister && (
        <div className="mb-8 rounded-2xl border border-white/10 bg-ink/40 p-4">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">{dd.listedBy}</p>
          <div className="mb-1 flex items-center gap-2">
            <span className="font-medium text-paper">{lister.display_first_name}</span>
            {lister.is_verified && <VerifiedBadge />}
          </div>
          <p className="text-sm text-muted">{ratingLabel}</p>
          {languageNames && (
            <p className="text-sm text-muted">
              {dd.languagesLabel}: {languageNames}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setConnectStub(true)}
        className="w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110"
      >
        {dd.connectCta}
      </button>
      {connectStub && (
        <p role="status" className="mt-3 text-center text-sm text-muted">
          {dd.connectStub}
        </p>
      )}
    </main>
  );
}
