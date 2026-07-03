'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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

export default function EditProfilePage({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const d = getDictionary(locale);
  const p = d.profile;
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [displayFirstName, setDisplayFirstName] = useState('');
  const [phone, setPhone] = useState('');
  const [spokenLanguages, setSpokenLanguages] = useState<string[]>(['en']);
  const [preferredLocale, setPreferredLocale] = useState<'en' | 'es'>(locale);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push(`/${locale}/signin`); return; }
      supabase
        .from('profiles')
        .select('full_name, display_first_name, phone, spoken_languages, preferred_locale')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setFullName(data.full_name ?? '');
            setDisplayFirstName(data.display_first_name ?? '');
            setPhone(data.phone ?? '');
            setSpokenLanguages(data.spoken_languages ?? ['en']);
            setPreferredLocale((data.preferred_locale as 'en' | 'es') ?? locale);
          }
          setLoading(false);
        });
    });
  }, [locale, router]);

  function toggleLanguage(lang: string) {
    setSpokenLanguages((cur) =>
      cur.includes(lang)
        ? cur.length > 1 ? cur.filter((l) => l !== lang) : cur
        : [...cur, lang]
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^\+[1-9]\d{7,14}$/.test(phone.replace(/\s/g, ''))) {
      setError(p.errorPhone);
      return;
    }
    setStatus('saving');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push(`/${locale}/signin`); return; }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        display_first_name: displayFirstName.trim(),
        phone: phone.replace(/\s/g, ''),
        spoken_languages: spokenLanguages,
        preferred_locale: preferredLocale,
      })
      .eq('id', user.id);

    if (updateError) {
      setError(p.errorGeneric);
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
        <Link href={`/${locale}/account`} className="text-muted hover:text-paper" aria-label={d.common.back}>‹</Link>
        <h1 className="font-display text-3xl text-paper">{p.title}</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <div>
          <label htmlFor="full-name" className="mb-1.5 block text-sm text-muted">{p.fullNameLabel}</label>
          <input
            id="full-name"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
        </div>

        <div>
          <label htmlFor="display-name" className="mb-1.5 block text-sm text-muted">{p.displayNameLabel}</label>
          <input
            id="display-name"
            type="text"
            autoComplete="given-name"
            value={displayFirstName}
            onChange={(e) => setDisplayFirstName(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
        </div>

        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm text-muted">{p.phoneLabel}</label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper placeholder:text-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-gold"
          />
        </div>

        <fieldset>
          <legend className="mb-2 text-sm text-muted">{p.languagesLabel}</legend>
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
                <input type="checkbox" value={value} checked={spokenLanguages.includes(value)}
                  onChange={() => toggleLanguage(value)} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="locale" className="mb-1.5 block text-sm text-muted">{p.localeLabel}</label>
          <select
            id="locale"
            value={preferredLocale}
            onChange={(e) => setPreferredLocale(e.target.value as 'en' | 'es')}
            className="w-full rounded-lg border border-white/15 bg-ink/40 px-3 py-2.5 text-paper outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <option value="en" className="bg-ink">{p.localeEn}</option>
            <option value="es" className="bg-ink">{p.localeEs}</option>
          </select>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        {status === 'saved' && (
          <p role="status" className="rounded-lg border border-sage/30 bg-sage/10 px-3 py-2 text-sm text-sage">
            {p.saved}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'saving'}
          className="w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110 disabled:opacity-50"
        >
          {status === 'saving' ? p.saving : p.save}
        </button>
      </form>
    </main>
  );
}
