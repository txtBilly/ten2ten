'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

type Intent = 'looking' | 'offering' | 'both';

export default function SignUpPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const d = getDictionary(locale);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [intent, setIntent] = useState<Intent>('looking');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'confirm'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('submitting');

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { intent } },
    });

    if (signUpError) {
      setStatus('idle');
      if (signUpError.message.toLowerCase().includes('already registered')) {
        setError(d.auth.errorEmailExists);
      } else {
        setError(d.auth.errorGeneric);
      }
      return;
    }

    // Email confirmation ON: session is null until confirmed.
    // Email confirmation OFF: session is set — go straight to onboarding.
    if (data.session) {
      router.push(`/${locale}/onboarding`);
    } else {
      setStatus('confirm');
    }
  }

  const intents: { value: Intent; label: string }[] = [
    { value: 'looking', label: d.auth.intentLooking },
    { value: 'offering', label: d.auth.intentOffering },
    { value: 'both', label: d.auth.intentBoth },
  ];

  if (status === 'confirm') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
        <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <div className="rounded-2xl border border-sage/40 bg-sage/10 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sage/20">
            <span className="text-2xl text-sage">✓</span>
          </div>
          <h1 className="mb-2 font-display text-2xl text-paper">{d.auth.confirmTitle}</h1>
          <p className="text-sm text-muted">
            {d.auth.confirmBody.replace('{email}', email)}
          </p>
        </div>
        <p className="mt-6 text-center text-sm text-muted">
          {d.auth.haveAccount}{' '}
          <Link href={`/${locale}/signin`} className="text-paper underline-offset-2 hover:underline">
            {d.auth.signInLink}
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <h1 className="mb-8 font-display text-3xl text-paper">{d.auth.signUp}</h1>

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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={d.auth.passwordPlaceholder}
            className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm text-muted">{d.auth.intentLabel}</legend>
          <div className="flex flex-wrap gap-2">
            {intents.map(({ value, label }) => (
              <label
                key={value}
                className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition ${
                  intent === value
                    ? 'border-gold bg-gold text-ink'
                    : 'border-white/15 text-muted hover:border-white/30 hover:text-paper'
                }`}
              >
                <input
                  type="radio"
                  name="intent"
                  value={value}
                  checked={intent === value}
                  onChange={() => setIntent(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

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
          {status === 'submitting' ? d.auth.signingUp : d.auth.signUp}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {d.auth.haveAccount}{' '}
        <Link href={`/${locale}/signin`} className="text-paper underline-offset-2 hover:underline">
          {d.auth.signInLink}
        </Link>
      </p>
    </main>
  );
}
