import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLocale, getDictionary } from '@/i18n/config';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { VerifiedBadge } from '@/components/VerifiedBadge';

export default async function AccountPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const d = getDictionary(locale);
  const a = d.account;

  const user = await requireUser(locale);
  const supabase = createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_first_name, full_name, email, verification_status, rating_avg, rating_count, created_at')
    .eq('id', user.id)
    .single();

  const verificationStatus = profile?.verification_status ?? 'unverified';
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(locale === 'es' ? 'es-US' : 'en-US', {
        month: 'long', year: 'numeric',
      })
    : null;

  return (
    <main className="mx-auto max-w-lg px-5 py-16">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>

      {/* Profile summary */}
      <div className="mb-8 flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10 font-display text-xl text-paper">
          {profile?.display_first_name?.[0]?.toUpperCase() ?? '?'}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl text-paper">
              {profile?.display_first_name ?? user.email}
            </h1>
            {verificationStatus === 'verified' && <VerifiedBadge />}
          </div>
          <p className="text-sm text-muted">{profile?.email ?? user.email}</p>
          {memberSince && (
            <p className="mt-0.5 text-xs text-muted">{a.memberSince} {memberSince}</p>
          )}
        </div>
      </div>

      {/* Verification status card */}
      <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
        verificationStatus === 'verified'
          ? 'border-sage/30 bg-sage/10 text-sage'
          : verificationStatus === 'pending'
          ? 'border-gold/30 bg-gold/10 text-gold'
          : verificationStatus === 'failed'
          ? 'border-red-500/30 bg-red-500/10 text-red-400'
          : 'border-white/10 bg-white/5 text-muted'
      }`}>
        <div className="flex items-center justify-between">
          <span>
            {verificationStatus === 'verified' && (<><span aria-hidden="true">✓ </span>{a.verifiedBadge}</>)}
            {verificationStatus === 'pending' && (<><span aria-hidden="true">⏳ </span>{a.pending}</>)}
            {verificationStatus === 'failed' && (<><span aria-hidden="true">✗ </span>{a.failed}</>)}
            {verificationStatus === 'unverified' && (<><span aria-hidden="true">○ </span>{a.unverified}</>)}
          </span>
          {verificationStatus !== 'verified' && (
            <Link
              href={`/${locale}/verify`}
              className="ml-4 rounded-lg bg-gold px-3 py-1 text-xs font-medium text-ink hover:brightness-110"
            >
              {a.verifyNow}
            </Link>
          )}
        </div>
      </div>

      {/* Nav links */}
      <nav aria-label="Account navigation">
        <ul className="flex flex-col divide-y divide-white/[0.08] rounded-xl border border-white/10">
          {([
            { href: `/${locale}/account/profile`, label: a.editProfile, icon: '✎', danger: false },
            { href: `/${locale}/account/notifications`, label: a.notifications, icon: '🔔', danger: false },
            { href: `/${locale}/account/delete`, label: a.deleteAccount, icon: '⊗', danger: true },
          ] as const).map(({ href, label, icon, danger }) => (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center justify-between px-4 py-3.5 text-sm transition hover:bg-white/5 ${
                  danger ? 'text-red-400' : 'text-paper'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="w-4 text-center text-muted" aria-hidden="true">{icon}</span>
                  {label}
                </span>
                <span className="text-muted" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Sign out */}
      <form action="/api/auth/signout" method="POST" className="mt-6">
        <button
          type="submit"
          className="w-full rounded-lg border border-white/15 px-5 py-3 text-sm text-muted transition hover:border-white/30 hover:text-paper"
        >
          {a.signOut}
        </button>
      </form>
    </main>
  );
}
