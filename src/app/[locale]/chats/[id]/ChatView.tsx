'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { listingTypeLabel } from '@/lib/listings';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

// Copy here is functional, not final (part of the batched copy sweep).

type Chat = {
  id: string;
  seeker_id: string;
  lister_id: string;
  listing_id: string;
  status: string;
  opened_at: string;
  lister_close_requested_at: string | null;
  seeker_success_at: string | null;
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

type Message = { id: string; sender_id: string; body: string; created_at: string };

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
  const supabase = useMemo(() => createClient(), []);

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [role, setRole] = useState<'seeker' | 'lister' | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [actionError, setActionError] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setPhase('error');
        return;
      }
      setMyUserId(user.id);

      const { data: c } = await supabase
        .from('chats')
        .select(
          'id, seeker_id, lister_id, listing_id, status, opened_at, lister_close_requested_at, seeker_success_at, disclosed_seeker_name, disclosed_credit_score, disclosed_bg_status'
        )
        .eq('id', id)
        .maybeSingle();
      if (cancelled) return;
      const r = c ? (c.seeker_id === user.id ? 'seeker' : c.lister_id === user.id ? 'lister' : null) : null;
      if (!c || !r) {
        setPhase('error');
        return;
      }

      const [{ data: lst }, { data: msgs }] = await Promise.all([
        supabase
          .from('listings')
          .select('neighborhood, full_address, contact_name, contact_phone, monthly_rent, type')
          .eq('id', c.listing_id)
          .maybeSingle(),
        supabase
          .from('messages')
          .select('id, sender_id, body, created_at')
          .eq('chat_id', id)
          .order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;

      setChat(c as Chat);
      setListing((lst as Listing) ?? null);
      setRole(r);
      setMessages((msgs as Message[]) ?? []);
      setPhase('ready');
    })();

    // Realtime: append new messages live. We use both postgres_changes (DB-
    // driven) and a broadcast the sender emits after insert — the broadcast is
    // the reliable path (no per-subscriber RLS evaluation), deduped by id.
    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
        }
      )
      .on('broadcast', { event: 'message' }, ({ payload }) => {
        const m = payload as Message;
        setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      })
      .subscribe();
    channelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [id, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || !myUserId) return;
    setSending(true);
    setActionError('');
    const { data, error } = await supabase
      .from('messages')
      .insert({ chat_id: id, sender_id: myUserId, body: text })
      .select('id, sender_id, body, created_at')
      .single();
    setSending(false);
    if (error || !data) {
      setActionError("Couldn't send. Please try again.");
      return;
    }
    const msg = data as Message;
    // Show my own message immediately, and notify the other party directly.
    setMessages((cur) => (cur.some((x) => x.id === msg.id) ? cur : [...cur, msg]));
    channelRef.current?.send({ type: 'broadcast', event: 'message', payload: msg });
    // A seeker reply re-engages the chat and cancels a pending close request
    // (the DB trigger does this too; mirror it locally for immediate feedback).
    if (role === 'seeker') {
      setChat((c) => (c && c.lister_close_requested_at ? { ...c, lister_close_requested_at: null } : c));
    }
    setBody('');
  }

  async function handleClose(reason: 'closed_success' | 'closed_didnt_work') {
    setClosing(true);
    setActionError('');
    const { error } = await supabase.rpc('close_chat', { p_chat_id: id, p_reason: reason });
    setClosing(false);
    if (error) {
      setActionError(`Couldn't close the conversation (${error.message || 'error'}).`);
      return;
    }
    setChat((c) => (c ? { ...c, status: reason } : c));
    setCloseOpen(false);
  }

  async function handleRequestClose() {
    setClosing(true);
    setActionError('');
    const { error } = await supabase.rpc('request_close_chat', { p_chat_id: id });
    setClosing(false);
    if (error) {
      setActionError(`Couldn’t request close (${error.message || 'error'}).`);
      return;
    }
    setChat((c) => (c ? { ...c, lister_close_requested_at: new Date().toISOString() } : c));
  }

  async function handleReportSuccess() {
    setClosing(true);
    setActionError('');
    const { error } = await supabase.rpc('report_success', { p_chat_id: id });
    setClosing(false);
    if (error) {
      setActionError(`Couldn’t report success (${error.message || 'error'}).`);
      return;
    }
    setChat((c) => (c ? { ...c, seeker_success_at: new Date().toISOString() } : c));
    setCloseOpen(false);
  }

  async function handleConfirmSuccess() {
    setClosing(true);
    setActionError('');
    const { error } = await supabase.rpc('confirm_success', { p_chat_id: id });
    setClosing(false);
    if (error) {
      setActionError(`Couldn’t confirm (${error.message || 'error'}).`);
      return;
    }
    setChat((c) => (c ? { ...c, status: 'closed_success' } : c));
  }

  async function handleDeclineSuccess() {
    setClosing(true);
    setActionError('');
    const { error } = await supabase.rpc('decline_success', { p_chat_id: id });
    setClosing(false);
    if (error) {
      setActionError(`Couldn’t decline (${error.message || 'error'}).`);
      return;
    }
    // Declining frees the listing immediately and closes the chat.
    setChat((c) => (c ? { ...c, status: 'closed_didnt_work', seeker_success_at: null } : c));
  }

  async function handleConfirmClose() {
    setClosing(true);
    setActionError('');
    const { error } = await supabase.rpc('confirm_close_chat', { p_chat_id: id });
    setClosing(false);
    if (error) {
      setActionError(`Couldn’t close the conversation (${error.message || 'error'}).`);
      return;
    }
    setChat((c) => (c ? { ...c, status: 'closed_didnt_work' } : c));
  }

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

  const isActive = chat.status === 'active';
  const successReported = !!chat.seeker_success_at;
  const closeRequested = !!chat.lister_close_requested_at;
  // Seeker's most recent activity — their last message, or chat open if none.
  const seekerLastActive = messages.reduce(
    (latest, m) => (m.sender_id === chat.seeker_id && m.created_at > latest ? m.created_at : latest),
    chat.opened_at
  );
  const seekerIdleHrs = (Date.now() - new Date(seekerLastActive).getTime()) / 3_600_000;
  const listerCanRequest =
    role === 'lister' && isActive && !closeRequested && !successReported && seekerIdleHrs >= 24;
  const otherName = role === 'seeker' ? listing?.contact_name ?? '—' : chat.disclosed_seeker_name ?? '—';
  const listingLine = listing
    ? [
        listing.neighborhood,
        listing.type ? listingTypeLabel(listing.type, l) : null,
        listing.monthly_rent != null ? `$${listing.monthly_rent.toLocaleString('en-US')}/mo` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const closedLabel =
    chat.status === 'closed_success'
      ? 'This conversation was closed — marked as a success.'
      : chat.status === 'closed_didnt_work'
        ? 'This conversation was closed — didn’t work out.'
        : 'This conversation is closed.';

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col px-5 py-8">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-paper">{otherName}</h1>
          {listingLine && <p className="text-sm text-muted">{listingLine}</p>}
        </div>
        {isActive && role === 'seeker' && !successReported && (
          <button
            type="button"
            onClick={() => setCloseOpen((v) => !v)}
            className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-paper transition hover:border-white/30"
          >
            Close chat
          </button>
        )}
      </div>

      {/* Disclosure */}
      <div className="mb-4 rounded-xl border border-white/10 bg-ink/40 p-3 text-sm">
        {role === 'seeker' ? (
          <p className="text-muted">
            {listing?.full_address && (
              <>
                <span className="text-paper">Address:</span> {listing.full_address}
              </>
            )}
            {listing?.contact_phone && <> · Phone: {listing.contact_phone}</>}
          </p>
        ) : (
          <p className="text-muted">
            <span className="text-paper">Seeker:</span> {chat.disclosed_seeker_name ?? '—'} · Credit band:{' '}
            {creditBand(chat.disclosed_credit_score)} ·{' '}
            {chat.disclosed_bg_status === 'verified' ? 'Verified' : '—'}
          </p>
        )}
      </div>

      {/* Pending success — seeker reported "got the place", awaiting the lister */}
      {isActive && successReported && role === 'seeker' && (
        <div className="mb-4 rounded-xl border border-gold/30 bg-gold/5 p-4">
          <p className="mb-1 font-medium text-paper">You reported getting the place.</p>
          <p className="text-xs text-muted">
            Waiting for the lister to confirm. If they don’t respond, it closes automatically after 24 hours.
          </p>
        </div>
      )}
      {isActive && successReported && role === 'lister' && (
        <div className="mb-4 rounded-xl border border-gold/30 bg-gold/5 p-4">
          <p className="mb-1 font-medium text-paper">{otherName} reported getting the place.</p>
          <p className="mb-3 text-xs text-muted">
            Confirm to take your listing off-market, or decline if that’s not right. If you do nothing, it closes
            automatically after 24 hours.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={closing}
              onClick={handleConfirmSuccess}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-ink transition hover:brightness-110 disabled:opacity-60"
            >
              Confirm — take off-market
            </button>
            <button
              type="button"
              disabled={closing}
              onClick={handleDeclineSuccess}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-paper transition hover:border-white/30 disabled:opacity-60"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Lister close-request / seeker confirm */}
      {isActive && closeRequested && role === 'seeker' && (
        <div className="mb-4 rounded-xl border border-gold/30 bg-gold/5 p-4">
          <p className="mb-1 font-medium text-paper">The lister asked to close this chat.</p>
          <p className="mb-3 text-xs text-muted">
            Confirm to release it, or just send a message to keep it active. If you do nothing, it closes
            automatically after 24 hours.
          </p>
          <button
            type="button"
            disabled={closing}
            onClick={handleConfirmClose}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-ink transition hover:brightness-110 disabled:opacity-60"
          >
            Confirm close
          </button>
        </div>
      )}
      {isActive && closeRequested && role === 'lister' && (
        <div className="mb-4 rounded-xl border border-white/10 bg-ink/40 p-3 text-sm text-muted">
          Close requested — the seeker has 24h to respond or the chat auto-frees.
        </div>
      )}
      {listerCanRequest && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink/40 p-3">
          <p className="text-sm text-muted">The seeker hasn’t replied in over 24 hours.</p>
          <button
            type="button"
            disabled={closing}
            onClick={handleRequestClose}
            className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-sm text-paper transition hover:border-white/30 disabled:opacity-60"
          >
            Request close
          </button>
        </div>
      )}

      {/* Close panel */}
      {closeOpen && isActive && role === 'seeker' && (
        <div className="mb-4 rounded-xl border border-gold/30 bg-gold/5 p-4">
          <p className="mb-1 font-medium text-paper">How did it go?</p>
          <p className="mb-3 text-xs text-muted">
            “Didn’t work out” uses this credit and lets you open your next one.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={closing}
              onClick={handleReportSuccess}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-ink transition hover:brightness-110 disabled:opacity-60"
            >
              Got the place
            </button>
            <button
              type="button"
              disabled={closing}
              onClick={() => handleClose('closed_didnt_work')}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-paper transition hover:border-white/30 disabled:opacity-60"
            >
              Didn’t work out
            </button>
          </div>
        </div>
      )}

      {/* Safety message — pinned first in the thread */}
      <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-muted">
        Keep the conversation on Ten2Ten. Never share sensitive financial details, and meet in a safe, public way.
      </div>

      {/* Thread */}
      <div className="flex-1 space-y-3 overflow-y-auto py-2">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No messages yet. Say hello.</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === myUserId;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine ? 'bg-gold text-ink' : 'border border-white/10 bg-ink/40 text-paper'
                  }`}
                >
                  {m.body}
                </div>
                <span className="mt-0.5 text-[10px] text-muted">{mine ? 'You' : otherName}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {actionError && (
        <p role="alert" className="mb-2 text-sm text-red-400">
          {actionError}
        </p>
      )}

      {/* Composer */}
      {isActive ? (
        <form onSubmit={handleSend} className="mt-2 flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message…"
            className="flex-1 rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="rounded-lg bg-gold px-5 py-2.5 font-medium text-ink transition hover:brightness-110 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      ) : (
        <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3 text-center text-sm text-muted">
          {closedLabel}
        </p>
      )}
    </main>
  );
}
