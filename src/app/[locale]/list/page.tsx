import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

// The listing form is entirely client-driven (auth check + Supabase reads,
// nothing server-fetchable) and was hitting hydration mismatches on its
// loading text — the prerendered server HTML and the first client paint
// disagreed depending on build/cache timing. Loading it with `ssr: false`
// means the server never renders it at all, so there is nothing for the
// client to reconcile against: the mismatch class is gone by construction,
// not just made less likely. See ListForm.tsx for the verification-gate
// logic itself (timeout + error state).
const ListForm = dynamic(() => import('./ListForm'), {
  ssr: false,
  loading: () => (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-5 text-center">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <p className="text-sm text-muted">Loading…</p>
    </main>
  ),
});

export default function ListPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return <ListForm locale={params.locale as Locale} />;
}
