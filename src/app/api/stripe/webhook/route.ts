import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { grantPurchaseCredits } from '@/lib/credits';
import { recordAuthorization } from '@/lib/backgroundCheckPayments';
import type Stripe from 'stripe';

// Stripe needs the raw body to verify the signature — disable body parsing.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'no_signature' }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      raw,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('[stripe] signature verification failed', err);
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const seekerId = session.metadata?.seeker_id;
      const kind = session.metadata?.kind;
      const includesBgCheck = session.metadata?.includes_bg_check === 'true';
      const paymentIntent =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;

      if (kind === 'contact_bundle' && seekerId && paymentIntent) {
        try {
          if (includesBgCheck) {
            // Manual-capture flow: the card is authorized, not charged yet.
            // Credits (and the actual capture) wait for the background-check
            // vendor result via /api/background/start.
            await recordAuthorization({
              seekerId,
              checkoutSessionId: session.id,
              paymentIntentId: paymentIntent,
              amountAuthorizedCents: session.amount_total ?? 0,
            });
          } else {
            await grantPurchaseCredits({
              seekerId,
              stripePaymentIntent: paymentIntent,
            });
          }
        } catch (e) {
          console.error('[stripe] failed to process checkout completion', e);
          // Return 500 so Stripe retries the webhook.
          return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
        }
      }
      break;
    }
    default:
      // Other events ignored for now.
      break;
  }

  return NextResponse.json({ received: true });
}
