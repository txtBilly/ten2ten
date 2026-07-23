import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

const VerifyView = dynamic(() => import('./VerifyView'), {
  ssr: false,
  loading: () => (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <p className="text-sm text-muted">Loading…</p>
    </main>
  ),
});

export default function BackgroundVerifyPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return <VerifyView locale={params.locale as Locale} />;
}
