import Link from 'next/link';
import { getDictionary } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

// Shared top navigation. Kept out of the root layout so auth-only screens
// (signin/signup/verify) stay chromeless; rendered explicitly on the pages
// that want it (Browse, My listings). Surfaces the Browse entry point so a
// seeker always has a way back to listings.
export default function SiteHeader({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const otherLocale = locale === 'en' ? 'es' : 'en';

  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
      <Link href={`/${locale}`} className="font-display text-xl text-paper">
        {dict.brand.name}
      </Link>
      <nav className="flex items-center gap-5 text-sm text-muted">
        <Link href={`/${locale}/browse`} className="hover:text-paper">
          {dict.nav.browse}
        </Link>
        <Link href={`/${locale}/list`} className="hover:text-paper">
          {dict.nav.list}
        </Link>
        <Link href={`/${locale}/account`} className="hover:text-paper">
          {dict.nav.account}
        </Link>
        <Link
          href={`/${otherLocale}`}
          className="rounded-full border border-white/15 px-3 py-1 uppercase hover:border-white/40"
        >
          {otherLocale}
        </Link>
      </nav>
    </header>
  );
}
