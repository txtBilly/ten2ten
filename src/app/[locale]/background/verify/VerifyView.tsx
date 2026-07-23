'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Locale } from '@/i18n/config';

// Minimal, functional collection screen — not final copy (see plan notes).
// No criminal/eviction fields: the vendor interface never returns that data.
const MOCK_OUTCOMES = ['pass', 'no_match', 'inconclusive', 'technical_failure'] as const;

const SSN_RE = /^\d{3}-\d{2}-\d{4}$/;

// Mask arbitrary input into the US SSN shape XXX-XX-XXXX as the user types.
function formatSsn(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 9);
  const parts = [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 9)].filter(Boolean);
  return parts.join('-');
}

// YYYY-MM-DD for today shifted back `years` years (safe for date-input bounds
// and string comparison, since YYYY-MM-DD sorts lexicographically).
function shiftYears(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function isAtLeast18(dob: string): boolean {
  return !!dob && dob <= shiftYears(18);
}

type Phase = 'form' | 'submitting' | 'pass' | 'retry' | 'failed' | 'error';

export default function VerifyView({ locale }: { locale: Locale }) {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const listingId = searchParams.get('listing_id');
  const listingHref = listingId ? `/${locale}/browse/${listingId}` : `/${locale}/browse`;

  const [legalName, setLegalName] = useState('');
  const [dob, setDob] = useState('');
  const [ssn, setSsn] = useState('');
  const [mockOutcome, setMockOutcome] = useState<string>('');
  const [phase, setPhase] = useState<Phase>('form');
  const [message, setMessage] = useState('');
  const [creditScore, setCreditScore] = useState<number | null>(null);

  const maxDob = shiftYears(18); // must be born on/before this to be 18+
  const minDob = shiftYears(120);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId) {
      setPhase('error');
      setMessage('Missing session — please start the purchase again.');
      return;
    }
    if (!SSN_RE.test(ssn)) {
      setPhase('error');
      setMessage('Enter your SSN as XXX-XX-XXXX (9 digits).');
      return;
    }
    if (!isAtLeast18(dob)) {
      setPhase('error');
      setMessage('You must be at least 18 years old to verify.');
      return;
    }
    setPhase('submitting');
    const url = new URL('/api/background/start', window.location.origin);
    url.searchParams.set('session_id', sessionId);
    if (mockOutcome) url.searchParams.set('mock', mockOutcome);

    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legalName, dob, ssn }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase('error');
        setMessage(data.error ?? 'Something went wrong.');
        return;
      }
      if (data.status === 'pass') {
        setPhase('pass');
        setCreditScore(data.creditScore ?? null);
      } else if (data.status === 'retry') {
        setPhase('retry');
        setMessage(
          data.reason === 'no_match'
            ? "We couldn't match your details — please double-check and try again."
            : 'Your check came back inconclusive — please try again.'
        );
      } else {
        setPhase('failed');
        setMessage(
          data.feeRetained
            ? "We couldn't complete the background check. The $35 screening fee from your earlier attempt still applies — please try again later."
            : 'The background check failed. Nothing was charged beyond the hold, which has been released.'
        );
      }
    } catch {
      setPhase('error');
      setMessage('Network error — please try again.');
    }
  }

  if (phase === 'pass') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
        <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <h1 className="mb-2 font-display text-2xl text-paper">Verified</h1>
        <p className="mb-6 text-sm text-muted">
          Background check passed{creditScore != null ? ` — credit score ${creditScore}` : ''}. 3 contact credits
          added to your account.
        </p>
        <Link
          href={listingHref}
          className="w-full max-w-xs rounded-lg bg-gold px-5 py-3 text-center font-medium text-ink transition hover:brightness-110"
        >
          {listingId ? 'Back to the listing' : 'Browse listings'}
        </Link>
      </main>
    );
  }

  if (phase === 'failed') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
        <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <h1 className="mb-2 font-display text-2xl text-paper">Check failed</h1>
        <p className="mb-6 text-sm text-red-400">{message}</p>
        <Link href={listingHref} className="text-sm text-gold underline-offset-4 hover:underline">
          {listingId ? 'Back to the listing' : 'Browse listings'}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <h1 className="mb-2 font-display text-2xl text-paper">Verify your identity</h1>
      <p className="mb-6 text-sm text-muted">
        This runs a one-time identity and credit-score check. Your SSN and full credit report are never shared with
        listers.
      </p>

      {phase === 'retry' && (
        <p role="status" className="mb-4 text-sm text-amber-400">
          {message}
        </p>
      )}
      {phase === 'error' && (
        <p role="alert" className="mb-4 text-sm text-red-400">
          {message}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Legal name
          <input
            required
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className="rounded-lg border border-white/15 bg-ink/40 px-3 py-2 text-paper"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Date of birth
          <input
            required
            type="date"
            value={dob}
            min={minDob}
            max={maxDob}
            onChange={(e) => setDob(e.target.value)}
            className="rounded-lg border border-white/15 bg-ink/40 px-3 py-2 text-paper"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          SSN
          <input
            required
            value={ssn}
            onChange={(e) => setSsn(formatSsn(e.target.value))}
            inputMode="numeric"
            maxLength={11}
            pattern="\d{3}-\d{2}-\d{4}"
            placeholder="XXX-XX-XXXX"
            className="rounded-lg border border-white/15 bg-ink/40 px-3 py-2 text-paper"
          />
        </label>

        {process.env.NODE_ENV === 'development' && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            Dev: force mock outcome
            <select
              value={mockOutcome}
              onChange={(e) => setMockOutcome(e.target.value)}
              className="rounded-lg border border-white/15 bg-ink/40 px-3 py-2 text-paper"
            >
              <option value="">(use MOCK_BG_CHECK_RESULT env default)</option>
              {MOCK_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="submit"
          disabled={phase === 'submitting'}
          className="w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110 disabled:opacity-60"
        >
          {phase === 'submitting' ? 'Checking…' : 'Submit'}
        </button>
      </form>
    </main>
  );
}
