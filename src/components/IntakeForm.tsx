'use client';

import { useState } from 'react';
import type { Dictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

type Props = { dict: Dictionary; locale: Locale };

const APARTMENT_TYPES = [
  { value: 'studio', key: 'typeStudio' },
  { value: '1br', key: 'type1br' },
  { value: '2br', key: 'type2br' },
  { value: '3br_plus', key: 'type3br' },
] as const;

const MUST_HAVES = [
  { value: 'pets_ok', key: 'petsOk' },
  { value: 'laundry', key: 'laundry' },
  { value: 'elevator', key: 'elevator' },
  { value: 'outdoor', key: 'outdoor' },
] as const;

export default function IntakeForm({ dict, locale }: Props) {
  const t = dict.intake;
  const [neighborhoods, setNeighborhoods] = useState('');
  const [type, setType] = useState<string>('');
  const [budget, setBudget] = useState('');
  const [moveIn, setMoveIn] = useState('');
  const [mustHaves, setMustHaves] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>(
    'idle'
  );
  const [errorMsg, setErrorMsg] = useState('');

  function toggleMustHave(value: string) {
    setMustHaves((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function handleSubmit() {
    const hoods = neighborhoods
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (hoods.length === 0 || phone.trim().length < 10) {
      setStatus('error');
      setErrorMsg(t.errorRequired);
      return;
    }

    setStatus('submitting');
    setErrorMsg('');

    try {
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          neighborhoods: hoods,
          type: type || undefined,
          budget_max: budget ? Number(budget) : undefined,
          move_in_by: moveIn || undefined,
          must_haves: mustHaves,
          free_text: freeText || undefined,
          phone: phone.trim(),
          email: email.trim() || undefined,
          preferred_locale: locale,
        }),
      });
      if (!res.ok) throw new Error('request failed');
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMsg(t.errorGeneric);
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-sage/40 bg-sage/10 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sage/20 text-2xl text-sage">
          ✓
        </div>
        <h2 className="mb-2 font-display text-2xl text-paper">{t.successTitle}</h2>
        <p className="text-muted">{t.successBody}</p>
      </div>
    );
  }

  const fieldClass =
    'w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-paper placeholder:text-muted/60 focus:border-gold focus:outline-none';
  const labelClass = 'mb-1.5 block text-sm font-medium text-paper/90';

  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass} htmlFor="hoods">
          {t.neighborhoods}
        </label>
        <input
          id="hoods"
          className={fieldClass}
          placeholder={t.neighborhoodsHint}
          value={neighborhoods}
          onChange={(e) => setNeighborhoods(e.target.value)}
        />
      </div>

      <div>
        <span className={labelClass}>{t.type}</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {APARTMENT_TYPES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(type === opt.value ? '' : opt.value)}
              className={
                'rounded-lg border px-3 py-2.5 text-sm transition ' +
                (type === opt.value
                  ? 'border-gold bg-gold/15 text-paper'
                  : 'border-white/15 bg-white/5 text-muted hover:border-white/30')
              }
            >
              {t[opt.key as keyof typeof t]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="budget">
            {t.budget}
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
              $
            </span>
            <input
              id="budget"
              type="number"
              inputMode="numeric"
              className={fieldClass + ' pl-8'}
              placeholder="3000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="movein">
            {t.moveIn}
          </label>
          <input
            id="movein"
            type="date"
            className={fieldClass}
            value={moveIn}
            onChange={(e) => setMoveIn(e.target.value)}
          />
        </div>
      </div>

      <div>
        <span className={labelClass}>{t.mustHaves}</span>
        <div className="flex flex-wrap gap-2">
          {MUST_HAVES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleMustHave(opt.value)}
              className={
                'rounded-full border px-4 py-2 text-sm transition ' +
                (mustHaves.includes(opt.value)
                  ? 'border-gold bg-gold/15 text-paper'
                  : 'border-white/15 bg-white/5 text-muted hover:border-white/30')
              }
            >
              {t[opt.key as keyof typeof t]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="freetext">
          {t.freeText}
        </label>
        <textarea
          id="freetext"
          rows={3}
          className={fieldClass + ' resize-none'}
          placeholder={t.freeTextPlaceholder}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="phone">
            {t.phone}
          </label>
          <input
            id="phone"
            type="tel"
            className={fieldClass}
            placeholder="+1 (917) 555-0142"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted">{t.phoneHint}</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="email">
            {t.email}
          </label>
          <input
            id="email"
            type="email"
            className={fieldClass}
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      {status === 'error' && (
        <p className="text-sm text-red-300" role="alert">
          {errorMsg}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={status === 'submitting'}
        className="w-full rounded-lg bg-gold px-6 py-3.5 font-medium text-ink transition hover:bg-gold/90 disabled:opacity-60"
      >
        {status === 'submitting' ? t.submitting : t.submit}
      </button>
    </div>
  );
}
