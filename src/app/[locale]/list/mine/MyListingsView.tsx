'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';
import { listingPhotoUrl, listingTypeLabel } from '@/lib/listings';

type ListingRow = {
  id: string;
  status: string;
  type: string | null;
  neighborhood: string | null;
  cross_streets: string | null;
  monthly_rent: number | null;
  published_at: string | null;
};

export default function MyListingsView({ locale }: { locale: Locale }) {
  const d = getDictionary(locale);
  const l = d.listing;
  const b = d.browse;
  const m = d.myListings;
  const router = useRouter();

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [activeListing, setActiveListing] = useState<ListingRow | null>(null);
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ListingRow[]>([]);
  const [yearlyCount, setYearlyCount] = useState(0);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatStub, setChatStub] = useState(false);

  useEffect(() => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      setError(m.errorGeneric);
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

      if (!user) {
        if (!finish()) return;
        router.replace(`/${locale}/signin`);
        return;
      }

      const { data: rows, error: rowsError } = await supabase
        .from('listings')
        .select('id, status, type, neighborhood, cross_streets, monthly_rent, published_at')
        .eq('lister_id', user.id)
        .order('updated_at', { ascending: false });
      if (settled) return;

      if (rowsError || !rows) {
        if (!finish()) return;
        setError(m.errorGeneric);
        setPhase('error');
        return;
      }

      const active = rows.find((r) => r.status === 'active' || r.status === 'negotiating') ?? null;
      const draftRows = rows.filter((r) => r.status === 'draft');

      const oneYearAgo = new Date();
      oneYearAgo.setDate(oneYearAgo.getDate() - 365);
      const published = rows.filter((r) => r.published_at && new Date(r.published_at) > oneYearAgo).length;

      let photoUrl: string | null = null;
      let chatId: string | null = null;
      if (active) {
        const { data: photo } = await supabase
          .from('listing_photos')
          .select('storage_path')
          .eq('listing_id', active.id)
          .order('sort_order', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (settled) return;
        if (photo) photoUrl = listingPhotoUrl(photo.storage_path);

        const { data: chat } = await supabase
          .from('chats')
          .select('id')
          .eq('listing_id', active.id)
          .eq('status', 'active')
          .maybeSingle();
        if (settled) return;
        chatId = chat?.id ?? null;
      }

      if (!finish()) return;
      setActiveListing(active);
      setActivePhotoUrl(photoUrl);
      setActiveChatId(chatId);
      setDrafts(draftRows);
      setYearlyCount(published);
      setPhase('ready');
    }

    load().catch(() => {
      if (!finish()) return;
      setError(m.errorGeneric);
      setPhase('error');
    });

    return () => {
      settled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  if (phase === 'loading') {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-5 text-center">
        <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <p className="text-sm text-muted">{m.loading}</p>
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="mb-4 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <p role="alert" className="text-sm text-red-400">
          {error || m.errorGeneric}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl text-paper">{m.title}</h1>
        <p className="text-sm text-muted">{m.yearlyCounter.replace('{count}', String(yearlyCount))}</p>
      </div>

      <section className="mb-10">
        <h2 className="mb-4 font-display text-xl text-paper">{m.currentSectionTitle}</h2>
        {activeListing ? (
          <div className="flex gap-4 rounded-2xl border border-white/10 bg-ink/40 p-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white/5">
              {activePhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activePhotoUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-paper">{activeListing.neighborhood}</p>
                <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs text-gold">
                  {activeListing.status === 'negotiating' ? b.statusNegotiating : m.statusActive}
                </span>
              </div>
              <p className="text-sm text-muted">{activeListing.cross_streets}</p>
              <p className="text-sm text-muted">
                {activeListing.monthly_rent != null ? `$${activeListing.monthly_rent.toLocaleString('en-US')}/mo` : ''}
                {activeListing.type ? ` · ${listingTypeLabel(activeListing.type, l)}` : ''}
              </p>
              <div className="mt-1 flex items-center gap-4">
                {activeChatId ? (
                  <Link
                    href={`/${locale}/chats/${activeChatId}`}
                    className="self-start text-sm text-gold hover:underline"
                  >
                    {m.chatCta}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setChatStub(true)}
                    className="self-start text-sm text-gold hover:underline"
                  >
                    {m.chatCta}
                  </button>
                )}
                {activeListing.status === 'active' && (
                  <Link
                    href={`/${locale}/list?id=${activeListing.id}`}
                    className="self-start text-sm text-gold hover:underline"
                  >
                    {m.editCta}
                  </Link>
                )}
              </div>
              {chatStub && <p className="text-xs text-muted">{m.chatStub}</p>}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-ink/40 p-6 text-center">
            <p className="mb-3 text-sm text-muted">{m.noActiveListing}</p>
            <Link
              href={`/${locale}/list`}
              className="inline-block rounded-lg bg-gold px-5 py-2.5 font-medium text-ink transition hover:brightness-110"
            >
              {m.createCta}
            </Link>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 font-display text-xl text-paper">{m.draftsSectionTitle}</h2>
        {drafts.length > 0 ? (
          <div className="flex flex-col gap-3">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink/40 p-4"
              >
                <div>
                  <p className="font-medium text-paper">{draft.neighborhood || m.draftUntitled}</p>
                  <p className="text-sm text-muted">
                    {draft.cross_streets}
                    {draft.type ? ` · ${listingTypeLabel(draft.type, l)}` : ''}
                  </p>
                </div>
                <Link
                  href={`/${locale}/list?id=${draft.id}`}
                  className="shrink-0 rounded-lg border border-white/15 px-4 py-2 text-sm text-paper hover:border-white/30"
                >
                  {m.editCta}
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{m.noDrafts}</p>
        )}
      </section>
    </main>
  );
}
