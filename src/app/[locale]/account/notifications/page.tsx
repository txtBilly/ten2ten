'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

type Channel = 'email' | 'sms' | 'push';
type EventKey = 'bid_accepted' | 'chat_message' | 'listing_freed' | 'expiry_warn';

const EVENT_KEYS: EventKey[] = ['bid_accepted', 'chat_message', 'listing_freed', 'expiry_warn'];
const CHANNELS: Channel[] = ['email', 'sms', 'push'];

type Prefs = Record<EventKey, Channel[]>;

const DEFAULTS: Prefs = {
  bid_accepted: ['sms', 'email'],
  chat_message: ['push'],
  listing_freed: ['push', 'email'],
  expiry_warn: ['sms', 'push'],
};

export default function NotificationsPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const d = getDictionary(locale);
  const n = d.notifications;
  const common = d.common;
  const router = useRouter();

  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push(`/${locale}/signin`); return; }
      supabase
        .from('notification_prefs')
        .select('bid_accepted, chat_message, listing_freed, expiry_warn')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setPrefs(data as Prefs);
          setLoading(false);
        });
    });
  }, [locale, router]);

  function toggleChannel(event: EventKey, channel: Channel) {
    setPrefs((cur) => {
      const current = cur[event];
      const next = current.includes(channel)
        ? current.filter((c) => c !== channel)
        : [...current, channel];
      return { ...cur, [event]: next };
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('saving');

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push(`/${locale}/signin`); return; }

    const { error: updateError } = await supabase
      .from('notification_prefs')
      .upsert({ user_id: user.id, ...prefs }, { onConflict: 'user_id' });

    if (updateError) {
      setError(n.errorGeneric);
      setStatus('idle');
      return;
    }
    setStatus('saved');
    setTimeout(() => setStatus('idle'), 3000);
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center px-5">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-16">
      <p className="mb-1 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <div className="mb-8 flex items-center gap-3">
        <Link href={`/${locale}/account`} className="text-muted hover:text-paper" aria-label={common.back}>‹</Link>
        <h1 className="font-display text-3xl text-paper">{n.title}</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
        {/* Header row */}
        <div className="mb-1 grid grid-cols-[1fr_repeat(3,3rem)] items-center gap-2 px-4 text-xs uppercase tracking-wide text-muted">
          <span />
          {CHANNELS.map((c) => (
            <span key={c} className="text-center">{n[c]}</span>
          ))}
        </div>

        {EVENT_KEYS.map((eventKey) => (
          <div
            key={eventKey}
            className="grid grid-cols-[1fr_repeat(3,3rem)] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
          >
            <span className="text-sm text-paper">{n[eventKey]}</span>
            {CHANNELS.map((channel) => {
              const checked = prefs[eventKey].includes(channel);
              const id = `${eventKey}-${channel}`;
              return (
                <div key={channel} className="flex justify-center">
                  <input
                    id={id}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleChannel(eventKey, channel)}
                    aria-label={`${n[eventKey]} via ${n[channel]}`}
                    className="h-4 w-4 cursor-pointer accent-gold"
                  />
                </div>
              );
            })}
          </div>
        ))}

        {error && (
          <p role="alert" className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        {status === 'saved' && (
          <p role="status" className="mt-2 rounded-lg border border-sage/30 bg-sage/10 px-3 py-2 text-sm text-sage">
            {n.saved}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'saving'}
          className="mt-4 w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110 disabled:opacity-50"
        >
          {status === 'saving' ? n.saving : n.save}
        </button>
      </form>
    </main>
  );
}
