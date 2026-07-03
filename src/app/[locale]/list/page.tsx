import Link from 'next/link';
import { isLocale } from '@/i18n/config';
import { notFound } from 'next/navigation';

// Placeholder — built out in a later session.
export default function Page({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-5 text-center">
      <p className="mb-2 text-sm uppercase tracking-wide text-gold">Ten2Ten</p>
      <h1 className="font-display text-3xl text-paper">Coming soon</h1>
      <p className="mt-3 text-muted">
        The <strong className="text-paper">list</strong> experience is being built. For now, tell us
        what you're looking for on the home page and we'll match you by hand.
      </p>
      <Link
        href={`/${params.locale}`}
        className="mt-6 rounded-lg bg-gold px-5 py-3 font-medium text-ink hover:bg-gold/90"
      >
        Back to home
      </Link>
    </main>
  );
}
