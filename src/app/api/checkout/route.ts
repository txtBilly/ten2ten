import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { createContactCheckout, stripe } from '@/lib/stripe';

// Creates a Stripe Checkout Session for the contact-credit bundle and redirects
// to it. Submit as a plain form POST (no client JS required):
//   <form action="/api/checkout" method="POST">
//     <input type="hidden" name="locale" value="en" />
//     <button>Buy 3 contact credits</button>
//   </form>
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!user.email) return NextResponse.json({ error: 'no_email' }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const requestedLocale = form?.get('locale');
  const listingIdRaw = form?.get('listing_id');
  const listingId = typeof listingIdRaw === 'string' && listingIdRaw ? listingIdRaw : null;

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('bg_check_completed_at, bg_check_expires_at, preferred_locale, credit_score')
    .eq('id', user.id)
    .single();
  if (error) {
    console.error('[checkout] profile lookup failed', error);
    return NextResponse.json({ error: 'profile_lookup_failed' }, { status: 500 });
  }
  if (!profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 404 });
  }

  const locale: 'en' | 'es' =
    requestedLocale === 'es' || requestedLocale === 'en'
      ? requestedLocale
      : profile.preferred_locale === 'es'
        ? 'es'
        : 'en';

  // Server-side only — this decides whether the seeker is charged the $35
  // background-check fee. A client-supplied flag would let anyone skip it.
  const includeBgCheck =
    !profile.bg_check_completed_at ||
    !profile.bg_check_expires_at ||
    new Date(profile.bg_check_expires_at) <= new Date();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Load the listing once (when we know which one) for the owner + min-score
  // guards below.
  let listingRow: { lister_id: string; min_credit_score: number | null } | null = null;
  if (listingId) {
    const { data } = await admin
      .from('listings')
      .select('lister_id, min_credit_score')
      .eq('id', listingId)
      .maybeSingle();
    listingRow = data;
  }

  // A lister can't connect to their own listing — refuse before any charge.
  if (listingRow && listingRow.lister_id === user.id) {
    return NextResponse.redirect(`${appUrl}/${locale}/browse/${listingId}?blocked=own_listing`, 303);
  }

  // Min-credit-score hard block (server-side enforcement). A verified seeker
  // (!includeBgCheck) below this listing's minimum cannot connect — refuse the
  // checkout entirely and bounce back to the listing's blocked state. First-
  // timers (includeBgCheck) aren't gated here; they're checked post-screening
  // in /api/background/start, since their score isn't known yet.
  if (!includeBgCheck && listingRow) {
    const minScore = listingRow.min_credit_score ?? null;
    if (minScore != null && (profile.credit_score == null || profile.credit_score < minScore)) {
      return NextResponse.redirect(`${appUrl}/${locale}/browse/${listingId}?blocked=min_score`, 303);
    }
  }

  try {
    const session = await createContactCheckout({
      seekerId: user.id,
      email: user.email,
      includeBgCheck,
      locale,
      listingId,
    });
    // Diagnostic: which Stripe account is STRIPE_SECRET_KEY actually pointing
    // at? If this doesn't match the account `stripe listen` is authenticated
    // to, the webhook will never see this session's events.
    const account = await stripe.accounts.retrieve();
    console.log('[checkout] session created', {
      seekerId: user.id,
      includeBgCheck,
      sessionId: session.id,
      stripeAccountId: account.id,
      stripeAccountEmail: account.email,
    });
    return NextResponse.redirect(session.url, 303);
  } catch (e) {
    console.error('[checkout] failed to create session', e);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 });
  }
}
