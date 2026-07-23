import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

export const CONTACT_BUNDLE_PRICE_CENTS = Number(
  process.env.CONTACT_BUNDLE_PRICE_CENTS ?? 10000
); // $100 => 3 contact credits

export const BG_CHECK_FEE_CENTS = Number(
  process.env.BG_CHECK_FEE_CENTS ?? 3500
); // $35 one-time, added on a seeker's first purchase

// Create a Checkout Session for a seeker buying a contact bundle.
// `includeBgCheck` adds the one-time $35 screening line on the first purchase.
export async function createContactCheckout(params: {
  seekerId: string;
  email: string;
  includeBgCheck: boolean;
  locale: 'en' | 'es';
  listingId?: string | null;
}): Promise<{ id: string; url: string }> {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      price_data: {
        currency: 'usd',
        product_data: { name: '3 contact credits' },
        unit_amount: CONTACT_BUNDLE_PRICE_CENTS,
      },
      quantity: 1,
    },
  ];

  if (params.includeBgCheck) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: 'One-time background screening' },
        unit_amount: BG_CHECK_FEE_CENTS,
      },
      quantity: 1,
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // First purchase (includeBgCheck): authorize $135 now, capture later once
  // the background-check vendor result is known (full $135 on pass, $35-only
  // on no-match/inconclusive, voided on technical failure / 24h abandonment).
  // Returning purchases ($100, no bg check) keep the simple auto-capture flow.
  const listingParam = params.listingId
    ? `&listing_id=${encodeURIComponent(params.listingId)}`
    : '';
  const successUrl = params.includeBgCheck
    ? `${appUrl}/${params.locale}/background/verify?session_id={CHECKOUT_SESSION_ID}${listingParam}`
    : `${appUrl}/${params.locale}/account?purchase=success`;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: params.email,
    line_items: lineItems,
    locale: params.locale,
    // USD-only platform (whole-dollar money model). Pin to card so Checkout
    // can't surface location-based methods (Bancontact/iDEAL/etc.). Apple Pay
    // and Google Pay still ride on 'card'. The EUR currency conversion seen in
    // testing is Stripe *Adaptive Pricing* — an account-level Dashboard setting
    // (Settings > Payments > Adaptive pricing), not controllable from this SDK
    // version; disable it there to keep amounts in USD.
    payment_method_types: ['card'],
    // The webhook reads this to credit the right seeker.
    metadata: {
      seeker_id: params.seekerId,
      kind: 'contact_bundle',
      includes_bg_check: params.includeBgCheck ? 'true' : 'false',
      ...(params.listingId ? { listing_id: params.listingId } : {}),
    },
    ...(params.includeBgCheck && {
      payment_intent_data: {
        capture_method: 'manual',
        metadata: { seeker_id: params.seekerId, kind: 'contact_bundle' },
      },
    }),
    success_url: successUrl,
    cancel_url: `${appUrl}/${params.locale}/account?purchase=cancelled`,
  });

  return { id: session.id, url: session.url! };
}
