import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import type { Locale } from '@/i18n/config';
import SiteHeader from '@/components/SiteHeader';

// Same ssr:false pattern as the rest of Session 3: this page's content is a
// client-only fetch of the current lister's own listings, so it's loaded
// with no server render to rule out hydration mismatches on the loading
// state.
const MyListingsView = dynamic(() => import('./MyListingsView'), {
  ssr: false,
  loading: () => (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-5 text-center">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <p className="text-sm text-muted">Loading…</p>
    </main>
  ),
});

export default function MyListingsPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  return (
    <>
      <SiteHeader locale={locale} />
      <MyListingsView locale={locale} />
    </>
  );
}
