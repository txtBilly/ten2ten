'use client';

import { useState, FormEvent, Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

type Intent = 'looking' | 'offering' | 'both';

// Bump when Terms/Privacy/Identity Consent copy changes materially.
const CONSENT_VERSION = '2026-07-v1';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'zh', label: '中文' },
  { value: 'ru', label: 'Русский' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
  { value: 'ar', label: 'العربية' },
  { value: 'ko', label: '한국어' },
];

// Splits a "{token}" template string and swaps tokens for React nodes —
// lets the consent sentence carry inline links without hardcoding grammar.
function renderTemplate(template: string, tokens: Record<string, ReactNode>) {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const match = part.match(/^\{(\w+)\}$/);
    return <Fragment key={i}>{match ? tokens[match[1]] : part}</Fragment>;
  });
}

export default function SignUpPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const d = getDictionary(locale);
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [intent, setIntent] = useState<Intent>('looking');
  const [fullName, setFullName] = useState('');
  const [displayFirstName, setDisplayFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [spokenLanguages, setSpokenLanguages] = useState<string[]>([locale]);
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'confirm'>('idle');
  const [error, setError] = useState('');

  function toggleLanguage(lang: string) {
    setSpokenLanguages((cur) =>
      cur.includes(lang)
        ? cur.length > 1
          ? cur.filter((l) => l !== lang)
          : cur // keep at least one
        : [...cur, lang]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!consented) {
      setError(d.auth.consentRequired);
      return;
    }
    if (!fullName.trim() || !displayFirstName.trim() || !phone.trim()) {
      setError(d.onboarding.errorRequired);
      return;
    }
    if (!/^\+[1-9]\d{7,14}$/.test(phone.replace(/\s/g, ''))) {
      setError(d.onboarding.errorPhone);
      return;
    }

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

    // Email confirmation is OFF (per spec), so a session comes back
    // immediately and the profile can be created in this same step. If
    // confirmation were ever turned on, there'd be no session yet — fall
    // back to the "check your email" screen instead.
    const user = data.user;
    if (!data.session || !user) {
      setStatus('confirm');
      return;
    }

    const normalizedPhone = phone.replace(/\s/g, '');

    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        full_name: fullName.trim(),
        display_first_name: displayFirstName.trim(),
        phone: normalizedPhone,
        email: user.email!,
        preferred_locale: locale,
        spoken_languages: spokenLanguages,
        intent,
        consent_version: CONSENT_VERSION,
        consented_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      setStatus('idle');
      setError(d.auth.errorGeneric);
      console.error('profile upsert error:', profileError);
      return;
    }

    await supabase
      .from('notification_prefs')
      .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });

    // Seekers are not verified at signup — everyone lands on Browse.
    // A lister hits the ID-verification gate later, when they go to /list.
    router.push(`/${locale}/browse`);
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
          <p className="text-sm text-muted">{d.auth.confirmBody.replace('{email}', email)}</p>
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

  const fieldClass =
    'w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold';
  const labelClass = 'mb-1.5 block text-sm text-muted';

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-16">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <h1 className="mb-8 font-display text-3xl text-paper">{d.auth.signUp}</h1>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <label htmlFor="email" className={labelClass}>
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
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
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
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="full-name" className={labelClass}>
            {d.onboarding.fullNameLabel}
          </label>
          <input
            id="full-name"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={d.onboarding.fullNamePlaceholder}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="display-name" className={labelClass}>
            {d.onboarding.displayNameLabel}
          </label>
          <input
            id="display-name"
            type="text"
            autoComplete="given-name"
            required
            value={displayFirstName}
            onChange={(e) => setDisplayFirstName(e.target.value)}
            placeholder={d.onboarding.displayNamePlaceholder}
            className={fieldClass}
          />
          <p className="mt-1 text-xs text-muted">{d.onboarding.displayNameHint}</p>
        </div>

        <div>
          <label htmlFor="phone" className={labelClass}>
            {d.onboarding.phoneLabel}
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={d.onboarding.phonePlaceholder}
            className={fieldClass}
          />
          <p className="mt-1 text-xs text-muted">{d.onboarding.phoneHint}</p>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm text-muted">{d.onboarding.languagesLabel}</legend>
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map(({ value, label }) => (
              <label
                key={value}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition ${
                  spokenLanguages.includes(value)
                    ? 'border-gold bg-gold text-ink'
                    : 'border-white/15 text-muted hover:border-white/30 hover:text-paper'
                }`}
              >
                <input
                  type="checkbox"
                  value={value}
                  checked={spokenLanguages.includes(value)}
                  onChange={() => toggleLanguage(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

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

        <label className="flex items-start gap-3 text-sm text-muted">
          <input
            type="checkbox"
            required
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-ink/40 accent-gold"
          />
          <span>
            {renderTemplate(d.auth.consentTemplate, {
              terms: (
                <Link href={`/${locale}/terms`} className="text-paper underline-offset-2 hover:underline">
                  {d.auth.consentTermsLabel}
                </Link>
              ),
              privacy: (
                <Link href={`/${locale}/privacy`} className="text-paper underline-offset-2 hover:underline">
                  {d.auth.consentPrivacyLabel}
                </Link>
              ),
              identity: (
                <Link
                  href={`/${locale}/identity-consent`}
                  className="text-paper underline-offset-2 hover:underline"
                >
                  {d.auth.consentIdentityLabel}
                </Link>
              ),
            })}
          </span>
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'submitting' || !consented}
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
