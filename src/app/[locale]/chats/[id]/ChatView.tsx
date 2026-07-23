'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { listingTypeLabel } from '@/lib/listings';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

// Placeholder chat screen for step 3 (atomic Connect). It proves the connection
// opened and the disclosure is correct — seeker sees the lister + exact address,
// lister sees the seeker's disclosed name + credit band + bg status. Real-time
// messaging, the safety-message injection, and the close flow arrive in step 4.
// Copy here is functional, not final.

type Chat = {
  id: string;
  seeker_id: string;
  lister_id: string;
  listing_id: string;
  status: string;
  disclosed_seeker_name: string | null;
  disclosed_credit_score: number | null;
  disclosed_bg_status: string | null;
};

type Listing = {
  neighborhood: string | null;
  full_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  monthly_rent: number | null;
  type: string | null;
};

function creditBand(score: number | null): string {
  if (score == null) return 'Not available';
  if (score >= 800) return 'Excellent (800+)';
  if (score >= 740) return 'Very good (740–799)';
  if (score >= 670) return 'Good (670–739)';
  if (score >= 580) return 'Fair (580–669)';
  return 'Poor (below 580)';
}

export default function ChatView({ locale, id }: { locale: Locale; id: string }) {
  const l = getDictionary(locale).listing;
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [role, setRole] = useState<'seeker' | 'lister' | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setPhase('error');
        return;
      }
      const { data: c } = await supabase
        .from('chats')
        .select(
          'id, seeker_id, lister_id, listing_id, status, disclosed_seeker_name, disclosed_credit_score, disclosed_bg_status'
        )
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      if (!c) {
        setPhase('error');
        return;
      }
      const r = c.seeker_id === user.id ? 'seeker' : c.lister_id === user.id ? 'lister' : null;
      if (!r) {
        setPhase('error');
        return;
      }
      const { data: lst } = await supabase
        .from('listings')
        .select('neighborhood, full_address, contact_name, contact_phone, monthly_rent, type')
        .eq('id', c.listing_id)
        .maybeSingle();
      if (cancelled) return;
      setChat(c as Chat);
      setListing((lst as Listing) ?? null);
      setRole(r);
      setPhase('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (phase === 'loading') {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-5 text-center">
        <p className="text-sm text-muted">Loading conversation…</p>
      </main>
    );
  }

  if (phase === 'error' || !chat) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="mb-4 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <p role="alert" className="mb-6 text-sm text-red-400">
          This conversation isn’t available.
        </p>
        <Link href={`/${locale}/browse`} className="text-sm text-gold hover:underline">
          Back to Browse
        </Link>
      </main>
    );
  }

  const listingLine = listing
    ? [
        listing.neighborhood,
        listing.type ? listingTypeLabel(listing.type, l) : null,
        listing.monthly_rent != null ? `$${listing.monthly_rent.toLocaleString('en-US')}/mo` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="mb-1 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <h1 className="mb-1 font-display text-2xl text-paper">Conversation open</h1>
      {listingLine && <p className="mb-6 text-sm text-muted">{listingLine}</p>}

      <div className="mb-6 rounded-2xl border border-white/10 bg-ink/40 p-4">
        {role === 'seeker' ? (
          <>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Lister</p>
            <p className="font-medium text-paper">{listing?.contact_name ?? '—'}</p>
            {listing?.full_address && (
              <p className="mt-2 text-sm text-muted">
                <span className="text-paper">Address:</span> {listing.full_address}
              </p>
            )}
            {listing?.contact_phone && <p className="text-sm text-muted">Phone: {listing.contact_phone}</p>}
          </>
        ) : (
          <>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Seeker</p>
            <p className="font-medium text-paper">{chat.disclosed_seeker_name ?? '—'}</p>
            <p className="mt-2 text-sm text-muted">Credit band: {creditBand(chat.disclosed_credit_score)}</p>
            <p className="text-sm text-muted">
              Background check: {chat.disclosed_bg_status === 'verified' ? 'Verified' : '—'}
            </p>
          </>
        )}
      </div>

      <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-muted">
        Keep the conversation on Ten2Ten. Never share sensitive financial details, and meet in a safe, public way.
      </div>

      <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
        <p className="text-sm text-muted">Messaging arrives in the next update.</p>
      </div>
    </main>
  );
}
