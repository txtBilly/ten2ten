'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

type VerifyStatus = 'unverified' | 'pending' | 'verified' | 'failed';

const FAILURE_REASONS: Record<string, keyof ReturnType<typeof getDictionary>['verify']> = {
  age_under_18: 'failedReasonAge',
  document_mismatch: 'failedReasonMismatch',
};

export default function VerifyPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { next?: string };
}) {
  const locale = params.locale as Locale;
  const d = getDictionary(locale);
  const v = d.verify;
  const router = useRouter();

  // Where to send the user after a successful verification — e.g. back into
  // the listing flow (?next=list) that gated them here. Defaults to /account.
  const nextPath = `/${locale}/${searchParams?.next?.replace(/^\/+/, '') || 'account'}`;

  const [status, setStatus] = useState<VerifyStatus>('unverified');
  const [failureReason, setFailureReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Load current verification status from the profile
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('profiles')
        .select('verification_status, kyc_vendor_ref')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.verification_status) {
            setStatus(data.verification_status as VerifyStatus);
          }
        });
    });
  }, []);

  async function startVerification() {
    setError('');
    setSubmitting(true);
    setStatus('pending');

    const res = await fetch('/api/identity/start', { method: 'POST' });
    const body = await res.json();

    if (!res.ok) {
      setError(v.errorGeneric);
      setStatus('unverified');
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    if (body.status === 'verified') {
      setStatus('verified');
    } else if (body.status === 'failed') {
      setStatus('failed');
      setFailureReason(body.failureReason ?? '');
    }
    // If still 'pending' (real provider), the status stays pending — user waits.
  }

  function getFailureMessage() {
    const key = FAILURE_REASONS[failureReason];
    return key ? v[key] : v.failedReasonDefault;
  }

  // ── Verified ──────────────────────────────────────────────────────────────
  if (status === 'verified') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="mb-4 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sage/20">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="16" fill="currentColor" className="text-sage/30" />
            <path d="M10 16l4.5 4.5L22 11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-sage" />
          </svg>
        </div>
        <h1 className="mb-2 font-display text-3xl text-paper">{v.successTitle}</h1>
        <VerifiedBadge className="mb-4" />
        <p className="mb-8 text-sm text-muted">{v.successBody}</p>
        <button
          onClick={() => router.push(nextPath)}
          className="w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110"
        >
          {v.continueCta}
        </button>
      </main>
    );
  }

  // ── Pending ───────────────────────────────────────────────────────────────
  if (status === 'pending') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="mb-4 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
          <svg className="animate-spin text-gold" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
            <path d="M16 3a13 13 0 0 1 13 13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="mb-2 font-display text-3xl text-paper">{v.pendingTitle}</h1>
        <p className="text-sm text-muted">{v.pendingBody}</p>
      </main>
    );
  }

  // ── Failed ────────────────────────────────────────────────────────────────
  if (status === 'failed') {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="mb-4 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="16" fill="currentColor" className="text-red-500/20" />
            <path d="M11 11l10 10M21 11l-10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-red-400" />
          </svg>
        </div>
        <h1 className="mb-2 font-display text-3xl text-paper">{v.failedTitle}</h1>
        <p className="mb-1 text-sm text-muted">{v.failedBody}</p>
        <p className="mb-8 text-sm text-red-400">{getFailureMessage()}</p>
        <button
          onClick={() => { setStatus('unverified'); setFailureReason(''); }}
          className="w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110"
        >
          {v.retryCta}
        </button>
      </main>
    );
  }

  // ── Intro (unverified) ────────────────────────────────────────────────────
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-16 text-center">
      <p className="mb-4 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-gold/10">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="8" y="6" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="2" className="text-gold" />
          <path d="M12 12h8M12 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gold" />
        </svg>
      </div>
      <h1 className="mb-2 font-display text-3xl text-paper">{v.title}</h1>
      <p className="mb-8 text-sm text-muted">{v.subtitle}</p>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        onClick={startVerification}
        disabled={submitting}
        className="w-full rounded-lg bg-gold px-5 py-3 font-medium text-ink transition hover:brightness-110 disabled:opacity-50"
      >
        {submitting ? v.starting : v.startCta}
      </button>

      {/* Dev-only controls to simulate different outcomes */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 rounded-lg border border-white/10 p-4 text-left">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Dev — simulate outcome</p>
          <div className="flex gap-2">
            {(['success', 'fail', 'underage'] as const).map((outcome) => (
              <button
                key={outcome}
                onClick={async () => {
                  // Override the mock outcome via a temp env hint (server reads MOCK_KYC_RESULT)
                  // In dev, append ?mock={outcome} which the start route can read.
                  setError('');
                  setSubmitting(true);
                  setStatus('pending');
                  const res = await fetch(`/api/identity/start?mock=${outcome}`, { method: 'POST' });
                  const body = await res.json();
                  setSubmitting(false);
                  if (body.status === 'verified') setStatus('verified');
                  else if (body.status === 'failed') { setStatus('failed'); setFailureReason(body.failureReason ?? ''); }
                }}
                className="rounded border border-white/15 px-3 py-1 text-xs text-muted hover:text-paper"
              >
                {outcome}
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
