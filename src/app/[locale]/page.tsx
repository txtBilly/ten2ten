import Link from 'next/link';
import { getDictionary, isLocale } from '@/i18n/config';
import { notFound } from 'next/navigation';
import IntakeForm from '@/components/IntakeForm';

export default function Home({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale;
  const dict = getDictionary(locale);
  const otherLocale = locale === 'en' ? 'es' : 'en';

  return (
    <main className="min-h-screen">
      {/* Top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <span className="font-display text-xl text-paper">{dict.brand.name}</span>
        <nav className="flex items-center gap-5 text-sm text-muted">
          <Link href={`/${locale}/list`} className="hover:text-paper">
            {dict.nav.list}
          </Link>
          <Link href={`/${locale}/account`} className="hover:text-paper">
            {dict.nav.signIn}
          </Link>
          <Link
            href={`/${otherLocale}`}
            className="rounded-full border border-white/15 px-3 py-1 uppercase hover:border-white/40"
          >
            {otherLocale}
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-8 pt-10 sm:pt-16">
        <p className="mb-4 text-sm uppercase tracking-wide text-gold">
          {dict.home.heroEyebrow}
        </p>
        <h1 className="max-w-3xl font-display text-4xl leading-tight text-paper sm:text-6xl">
          {dict.home.heroTitle}
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted">{dict.home.heroSubtitle}</p>

        <div className="mt-8 flex flex-wrap gap-6 text-sm text-paper/80">
          <span className="flex items-center gap-2">
            <span className="text-sage">✓</span> {dict.home.trustVerified}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-sage">✓</span> {dict.home.trustNoFee}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-sage">✓</span> {dict.home.trustGratitude}
          </span>
        </div>
      </section>

      {/* Intake — the cold-start engine */}
      <section className="mx-auto max-w-2xl px-5 py-10">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <h2 className="font-display text-2xl text-paper">{dict.intake.title}</h2>
          <p className="mb-6 mt-1 text-muted">{dict.intake.subtitle}</p>
          <IntakeForm dict={dict} locale={locale} />
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-wrap gap-5 text-sm text-muted">
          <Link href={`/${locale}/terms`} className="hover:text-paper">
            {dict.footer.terms}
          </Link>
          <Link href={`/${locale}/privacy`} className="hover:text-paper">
            {dict.footer.privacy}
          </Link>
          <Link href={`/${locale}/safety`} className="hover:text-paper">
            {dict.footer.safety}
          </Link>
        </div>
        <p className="mt-4 max-w-2xl text-xs leading-relaxed text-muted/70">
          {dict.footer.rights}
        </p>
      </footer>
    </main>
  );
}
