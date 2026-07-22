import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

// Same ssr:false pattern as /list and /browse: this page's content depends
// on a client-only fetch (the listing, its photos, the lister's public
// summary, and the viewer's own favourite state), so it's loaded with no
// server render to rule out hydration mismatches on the loading state.
const ListingDetailView = dynamic(() => import('./ListingDetailView'), {
  ssr: false,
  loading: () => (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-5 text-center">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <p className="text-sm text-muted">Loading…</p>
    </main>
  ),
});

export default function ListingDetailPage({ params }: { params: { locale: string; id: string } }) {
  if (!isLocale(params.locale)) notFound();
  return <ListingDetailView locale={params.locale as Locale} id={params.id} />;
}
