'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

export default function SignInPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const d = getDictionary(locale);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('submitting');

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setStatus('idle');
      setError(d.auth.errorInvalid);
      return;
    }

    router.push(`/${locale}/account`);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <h1 className="mb-8 font-display text-3xl text-paper">{d.auth.signIn}</h1>

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

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm text-muted">
            {d.auth.passwordLabel}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={d.auth.passwordPlaceholder}
            className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
          <div className="mt-1.5 text-right">
            <Link href={`/${locale}/reset`} className="text-sm text-muted hover:text-paper">
              {d.auth.forgotPassword}
            </Link>
          </div>
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
          {status === 'submitting' ? d.auth.signingIn : d.auth.signIn}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {d.auth.noAccount}{' '}
        <Link href={`/${locale}/signup`} className="text-paper underline-offset-2 hover:underline">
          {d.auth.signUpLink}
        </Link>
      </p>
    </main>
  );
}
