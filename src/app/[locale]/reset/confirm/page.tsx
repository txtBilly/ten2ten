'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

export default function ResetConfirmPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const d = getDictionary(locale);
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState('');

  // Supabase sends the user here with a code in the URL fragment that the
  // browser client exchanges automatically on mount.
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User is now in a recovery session — ready to set new password.
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('submitting');

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setStatus('idle');
      setError(d.auth.errorGeneric);
      return;
    }

    setStatus('done');
    setTimeout(() => router.push(`/${locale}/account`), 1500);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <h1 className="mb-8 font-display text-3xl text-paper">{d.auth.resetTitle}</h1>

      {status === 'done' ? (
        <p className="rounded-lg border border-sage/40 bg-sage/10 px-4 py-3 text-sm text-sage">
          {d.auth.newPasswordSuccess}
        </p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm text-muted">
              {d.auth.newPasswordLabel}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={d.auth.newPasswordPlaceholder}
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
            {status === 'submitting' ? d.auth.newPasswordSubmitting : d.auth.newPasswordSubmit}
          </button>
        </form>
      )}
    </main>
  );
}
