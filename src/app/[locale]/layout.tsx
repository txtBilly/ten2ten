import { notFound } from 'next/navigation';
import { isLocale, locales } from '@/i18n/config';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!isLocale(params.locale)) notFound();
  return (
    <html lang={params.locale}>
      <body>{children}</body>
    </html>
  );
}
