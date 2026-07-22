import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { locales, defaultLocale } from '@/i18n/config';

// Routes that require authentication
const PROTECTED = ['/account', '/verify', '/list'];
// Routes that redirect authenticated users away
const AUTH_ONLY = ['/signin', '/signup', '/reset'];

function pickLocale(req: NextRequest): string {
  const header = req.headers.get('accept-language') ?? '';
  const preferred = header.split(',').map((p) => p.split(';')[0].trim().slice(0, 2));
  const match = preferred.find((p) => (locales as readonly string[]).includes(p));
  return match ?? defaultLocale;
}

function stripLocale(pathname: string): string {
  for (const l of locales) {
    if (pathname === `/${l}`) return '/';
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1);
  }
  return pathname;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Ensure locale prefix
  const hasLocale = (locales as readonly string[]).some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );
  if (!hasLocale) {
    const locale = pickLocale(req);
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
    return NextResponse.redirect(url);
  }

  const locale =
    (locales as readonly string[]).find(
      (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
    ) ?? defaultLocale;
  const bare = stripLocale(pathname);

  const isProtected = PROTECTED.some((p) => bare === p || bare.startsWith(p + '/'));
  const isAuthOnly = AUTH_ONLY.some((p) => bare === p || bare.startsWith(p + '/'));

  // Only hit Supabase when we need to check auth
  if (!isProtected && !isAuthOnly) return NextResponse.next();

  // If Supabase isn't configured (e.g. no .env.local yet), treat as unauthenticated.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('YOUR_PROJECT')) {
    if (isProtected) {
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}/signin`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request: req });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
        toSet.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        toSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}/signin`;
    return NextResponse.redirect(url);
  }

  if (isAuthOnly && user) {
    const url = req.nextUrl.clone();
    url.pathname = `/${locale}/account`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/', '/((?!_next|api|.*\\..*).*)'],
};
