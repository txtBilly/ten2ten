'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';
import {
  EMPTY_FILTERS,
  LISTING_TYPES,
  listingPhotoUrl,
  listingTypeLabels,
  type BrowseFilters,
  type ListingTypeValue,
} from '@/lib/listings';
import { ListingCard, type ListingCardData } from '@/components/ListingCard';
import { FiltersSheet } from '@/components/FiltersSheet';

type ListingRow = {
  id: string;
  lister_id: string;
  neighborhood: string | null;
  cross_streets: string | null;
  zip: string | null;
  type: string | null;
  monthly_rent: number | null;
  available_from: string | null;
  pets_ok: boolean | null;
  laundry: boolean | null;
  doorman: boolean | null;
  elevator: boolean | null;
  outdoor: boolean | null;
  no_fee: boolean | null;
  walk_up: boolean | null;
  min_credit_score: number | null;
  status: string;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function BrowseView({ locale }: { locale: Locale }) {
  const d = getDictionary(locale);
  const b = d.browse;
  const l = d.listing;
  const router = useRouter();

  const typeLabels = listingTypeLabels(l);

  const [userId, setUserId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ListingTypeValue>('all');
  const [filters, setFilters] = useState<BrowseFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [cards, setCards] = useState<ListingCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => setUserId(user?.id ?? null));
  }, []);

  // Debounced search + immediate re-query on type/filters change. All
  // filtering happens in the Supabase query itself (server-side), not by
  // filtering the array client-side after the fact.
  useEffect(() => {
    let cancelled = false;
    const timeoutId = setTimeout(
      async () => {
        setLoading(true);
        setError('');
        const supabase = createClient();

        let query = supabase
          .from('listings')
          .select(
            'id, lister_id, neighborhood, cross_streets, zip, type, monthly_rent, available_from, pets_ok, laundry, doorman, elevator, outdoor, no_fee, walk_up, min_credit_score, status'
          )
          .in('status', ['active', 'negotiating'])
          .order('created_at', { ascending: false })
          .limit(60);

        const q = searchText.trim().replace(/[%,()]/g, '');
        if (q) {
          query = query.or(`neighborhood.ilike.%${q}%,cross_streets.ilike.%${q}%,zip.ilike.%${q}%`);
        }
        if (typeFilter !== 'all') query = query.eq('type', typeFilter);
        if (filters.rentMin) query = query.gte('monthly_rent', Number(filters.rentMin));
        if (filters.rentMax) query = query.lte('monthly_rent', Number(filters.rentMax));
        if (filters.zip.trim()) query = query.eq('zip', filters.zip.trim());
        if (filters.moveInBy) query = query.lte('available_from', filters.moveInBy);
        if (filters.laundry) query = query.eq('laundry', true);
        if (filters.petsOk) query = query.eq('pets_ok', true);
        if (filters.elevator) query = query.eq('elevator', true);
        if (filters.walkUp) query = query.eq('walk_up', true);
        if (filters.doorman) query = query.eq('doorman', true);
        if (filters.outdoor) query = query.eq('outdoor', true);
        if (filters.noFee) query = query.eq('no_fee', true);

        const { data: rows, error: queryError } = await query;
        if (cancelled) return;

        if (queryError || !rows) {
          setError(b.errorGeneric);
          setCards([]);
          setLoading(false);
          return;
        }

        const ids = rows.map((r) => r.id);
        const listerIds = Array.from(new Set(rows.map((r) => r.lister_id)));

        const [photosResult, listersResult, favouritesResult] = await Promise.all([
          ids.length
            ? supabase
                .from('listing_photos')
                .select('listing_id, storage_path, slot, sort_order')
                .in('listing_id', ids)
                .order('sort_order', { ascending: true })
            : Promise.resolve({ data: [] as { listing_id: string; storage_path: string; slot: string }[] }),
          listerIds.length
            ? supabase.from('public_profile_summary').select('id, is_verified').in('id', listerIds)
            : Promise.resolve({ data: [] as { id: string; is_verified: boolean }[] }),
          userId && ids.length
            ? supabase.from('favourites').select('listing_id').eq('seeker_id', userId).in('listing_id', ids)
            : Promise.resolve({ data: [] as { listing_id: string }[] }),
        ]);
        if (cancelled) return;

        const photoByListing = new Map<string, string>();
        (photosResult.data ?? []).forEach((p) => {
          const current = photoByListing.get(p.listing_id);
          if (!current || p.slot === 'bedroom') photoByListing.set(p.listing_id, p.storage_path);
        });

        const verifiedListers = new Set((listersResult.data ?? []).filter((p) => p.is_verified).map((p) => p.id));
        const favouritedIds = new Set((favouritesResult.data ?? []).map((f) => f.listing_id));

        const dateLocale = locale === 'es' ? 'es-ES' : 'en-US';

        const nextCards: ListingCardData[] = rows.map((row: ListingRow) => {
          const photoPath = photoByListing.get(row.id);
          const amenityLabels: string[] = [];
          if (row.laundry) amenityLabels.push(l.amenityLaundry);
          if (row.pets_ok) amenityLabels.push(l.amenityPetsOk);
          if (row.elevator) amenityLabels.push(l.amenityElevator);
          if (row.walk_up) amenityLabels.push(l.amenityWalkUp);
          if (row.doorman) amenityLabels.push(l.amenityDoorman);
          if (row.outdoor) amenityLabels.push(l.amenityOutdoor);
          if (row.no_fee) amenityLabels.push(l.amenityNoFee);

          return {
            id: row.id,
            href: `/${locale}/browse/${row.id}`,
            photoUrl: photoPath ? listingPhotoUrl(photoPath) : null,
            neighborhood: row.neighborhood ?? '',
            crossStreets: row.cross_streets ?? '',
            rentLabel: row.monthly_rent != null ? `$${row.monthly_rent.toLocaleString('en-US')}/mo` : '',
            typeLabel: row.type ? typeLabels[row.type as ListingTypeValue] ?? row.type : '',
            negotiating: row.status === 'negotiating',
            negotiatingLabel: b.statusNegotiating,
            amenityLabels,
            availableLabel: row.available_from
              ? b.availableFrom.replace(
                  '{date}',
                  new Date(`${row.available_from}T00:00:00`).toLocaleDateString(dateLocale, {
                    month: 'short',
                    day: 'numeric',
                  })
                )
              : null,
            minCreditScoreLabel:
              row.min_credit_score != null ? b.minCreditScore.replace('{score}', String(row.min_credit_score)) : null,
            verified: verifiedListers.has(row.lister_id),
            favourited: favouritedIds.has(row.id),
            favouriteAddLabel: b.favouriteAdd,
            favouriteRemoveLabel: b.favouriteRemove,
          };
        });

        setCards(nextCards);
        setLoading(false);
      },
      searchText ? 400 : 0
    );

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, typeFilter, filters, userId, locale]);

  async function handleToggleFavourite(listingId: string, currentlyFavourited: boolean) {
    if (!userId) {
      router.push(`/${locale}/signin`);
      return;
    }
    setCards((cur) => cur.map((c) => (c.id === listingId ? { ...c, favourited: !currentlyFavourited } : c)));
    const supabase = createClient();
    const { error: toggleError } = currentlyFavourited
      ? await supabase.from('favourites').delete().eq('seeker_id', userId).eq('listing_id', listingId)
      : await supabase.from('favourites').insert({ seeker_id: userId, listing_id: listingId });

    if (toggleError) {
      setCards((cur) => cur.map((c) => (c.id === listingId ? { ...c, favourited: currentlyFavourited } : c)));
    }
  }

  const typeChips: { value: 'all' | ListingTypeValue; label: string }[] = [
    { value: 'all', label: b.typeAll },
    ...LISTING_TYPES.map((value) => ({ value, label: typeLabels[value] })),
  ];

  return (
    <main className="mx-auto max-w-5xl px-5 py-16">
      <h1 className="mb-6 font-display text-3xl text-paper">{b.title}</h1>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder={b.searchPlaceholder}
          aria-label={b.searchPlaceholder}
          className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold sm:flex-1"
        />
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="shrink-0 rounded-lg border border-white/15 px-4 py-2.5 text-sm text-paper hover:border-white/30"
        >
          {b.filtersCta}
        </button>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {typeChips.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTypeFilter(value)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              typeFilter === value
                ? 'border-gold bg-gold text-ink'
                : 'border-white/15 text-muted hover:border-white/30 hover:text-paper'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted">{b.loading}</p>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-ink/40 p-8 text-center">
          <p className="mb-1 font-display text-xl text-paper">{b.noResultsTitle}</p>
          <p className="text-sm text-muted">{b.noResultsBody}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <ListingCard key={card.id} listing={card} onToggleFavourite={handleToggleFavourite} />
          ))}
        </div>
      )}

      <FiltersSheet
        open={filtersOpen}
        filters={filters}
        todayStr={todayStr()}
        labels={{
          title: b.filtersTitle,
          rentMin: b.rentMinLabel,
          rentMax: b.rentMaxLabel,
          zip: b.zipLabel,
          moveInBy: b.moveInByLabel,
          laundry: l.amenityLaundry,
          petsOk: l.amenityPetsOk,
          elevator: l.amenityElevator,
          walkUp: l.amenityWalkUp,
          doorman: l.amenityDoorman,
          outdoor: l.amenityOutdoor,
          noFee: l.amenityNoFee,
          apply: b.applyFiltersCta,
          clear: b.clearFiltersCta,
          close: b.closeCta,
        }}
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
        }}
        onClose={() => setFiltersOpen(false)}
      />
    </main>
  );
}
