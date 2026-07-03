import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = createClient();
  await supabase.auth.signOut();

  // Redirect to home with locale from referrer, falling back to /en
  const referer = req.headers.get('referer') ?? '';
  const localeMatch = referer.match(/\/(en|es)\//);
  const locale = localeMatch ? localeMatch[1] : 'en';

  return NextResponse.redirect(new URL(`/${locale}`, req.url), { status: 302 });
}
