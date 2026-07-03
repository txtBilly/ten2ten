'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

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

export default function OnboardingPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const d = getDictionary(locale);
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [displayFirstName, setDisplayFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [spokenLanguages, setSpokenLanguages] = useState<string[]>(['en']);
  const [preferredLocale, setPreferredLocale] = useState<'en' | 'es'>(locale);
  const [status, setStatus] = useState<'idle' | 'submitting'>('idle');
  const [error, setError] = useState('');

  function toggleLanguage(lang: string) {
    setSpokenLanguages((cur) =>
      cur.includes(lang)
        ? cur.length > 1 ? cur.filter((l) => l !== lang) : cur // keep at least one
        : [...cur, lang]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      router.push(`/${locale}/signin`);
      return;
    }

    const normalizedPhone = phone.replace(/\s/g, '');

    // Upsert the profile row (handles both first-time and re-submit)
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: fullName.trim(),
      display_first_name: displayFirstName.trim(),
      phone: normalizedPhone,
      email: user.email!,
      preferred_locale: preferredLocale,
      spoken_languages: spokenLanguages,
    }, { onConflict: 'id' });

    if (profileError) {
      setStatus('idle');
      setError(d.onboarding.errorGeneric);
      console.error('profile upsert error:', profileError);
      return;
    }

    // Insert notification_prefs defaults (ignore if already exists)
    await supabase.from('notification_prefs').upsert(
      { user_id: user.id },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );

    router.push(`/${locale}/verify`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-16">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <h1 className="mb-1 font-display text-3xl text-paper">{d.onboarding.title}</h1>
      <p className="mb-8 text-sm text-muted">{d.onboarding.subtitle}</p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {/* Full name */}
        <div>
          <label htmlFor="full-name" className="mb-1.5 block text-sm text-muted">
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
            className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
        </div>

        {/* Display first name */}
        <div>
          <label htmlFor="display-name" className="mb-1.5 block text-sm text-muted">
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
            className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
          <p className="mt-1 text-xs text-muted">{d.onboarding.displayNameHint}</p>
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm text-muted">
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
            className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
          <p className="mt-1 text-xs text-muted">{d.onboarding.phoneHint}</p>
        </div>

        {/* Spoken languages */}
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

        {/* Preferred locale */}
        <div>
          <label htmlFor="locale" className="mb-1.5 block text-sm text-muted">
            {d.onboarding.localeLabel}
          </label>
          <select
            id="locale"
            value={preferredLocale}
            onChange={(e) => setPreferredLocale(e.target.value as 'en' | 'es')}
            className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <option value="en" className="bg-ink">{d.onboarding.localeEn}</option>
            <option value="es" className="bg-ink">{d.onboarding.localeEs}</option>
          </select>
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
          {status === 'submitting' ? d.onboarding.submitting : d.onboarding.submit}
        </button>
      </form>
    </main>
  );
}
