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
    .select('bg_check_completed_at, bg_check_expires_at, preferred_locale')
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
