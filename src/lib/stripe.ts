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
}): Promise<string> {
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

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: params.email,
    line_items: lineItems,
    locale: params.locale,
    // The webhook reads this to credit the right seeker.
    metadata: { seeker_id: params.seekerId, kind: 'contact_bundle' },
    success_url: `${appUrl}/${params.locale}/account?purchase=success`,
    cancel_url: `${appUrl}/${params.locale}/account?purchase=cancelled`,
  });

  return session.url!;
}
