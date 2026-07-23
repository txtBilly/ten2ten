import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { isLocale } from '@/i18n/config';
import type { Locale } from '@/i18n/config';
import SiteHeader from '@/components/SiteHeader';

// Client-only, like the other Session 3/4 views: the chat depends on the
// current user's auth + a participant check, so no server render.
const ChatView = dynamic(() => import('./ChatView'), {
  ssr: false,
  loading: () => (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-5 text-center">
      <p className="text-sm text-muted">Loading…</p>
    </main>
  ),
});

export default function ChatPage({ params }: { params: { locale: string; id: string } }) {
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  return (
    <>
      <SiteHeader locale={locale} />
      <ChatView locale={locale} id={params.id} />
    </>
  );
}
