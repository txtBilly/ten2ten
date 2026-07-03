'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

export default function ResetPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const d = getDictionary(locale);

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('submitting');

    const supabase = createClient();
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/${locale}/reset/confirm`
        : `/${locale}/reset/confirm`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (resetError) {
      setStatus('idle');
      setError(d.auth.errorGeneric);
      return;
    }

    setStatus('sent');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <h1 className="mb-2 font-display text-3xl text-paper">{d.auth.resetTitle}</h1>
      <p className="mb-8 text-sm text-muted">{d.auth.resetSubtitle}</p>

      {status === 'sent' ? (
        <p className="rounded-lg border border-sage/40 bg-sage/10 px-4 py-3 text-sm text-sage">
          {d.auth.resetSent}
        </p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm text-muted">
              {d.auth.emailLabel}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={d.auth.emailPlaceholder}
              className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110 disabled:opacity-50"
          >
            {status === 'submitting' ? d.auth.resetSubmitting : d.auth.resetSubmit}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        <Link href={`/${locale}/signin`} className="text-paper underline-offset-2 hover:underline">
          {d.auth.signInLink}
        </Link>
      </p>
    </main>
  );
}
