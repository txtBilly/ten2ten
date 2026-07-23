import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { stripe, BG_CHECK_FEE_CENTS } from '@/lib/stripe';
import { getBackgroundProvider, type BackgroundCheckOutcome } from '@/lib/background';
import {
  findPendingAuthorization,
  findByPaymentIntent,
  recordAuthorization,
  markCaptured,
  markPartiallyCaptured,
  markPartialCaptureResolved,
  markVoided,
  type BgCheckAuthorization,
} from '@/lib/backgroundCheckPayments';
import { grantPurchaseCredits } from '@/lib/credits';

const KNOWN_OUTCOMES: BackgroundCheckOutcome[] = ['pass', 'no_match', 'inconclusive', 'technical_failure'];

// Collects legal name / DOB / SSN, runs the background-check vendor, and
// resolves the manual-capture authorization from checkout accordingly:
//   pass              -> capture full $135, write profile fields, grant credits
//   no_match/inconclusive -> capture $35 only, no credits, retryable
//   technical_failure -> void the whole authorization, no charge
// SSN/DOB are used only as vendor-call arguments — never persisted here.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const { legalName, dob, ssn } = (body ?? {}) as Record<string, unknown>;
  if (
    typeof legalName !== 'string' ||
    !legalName.trim() ||
    typeof dob !== 'string' ||
    !dob.trim() ||
    typeof ssn !== 'string' ||
    !ssn.trim()
  ) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 422 });
  }
  // Enforce the same rules the UI does, server-side (a client can bypass the
  // form): SSN must be XXX-XX-XXXX, and the seeker must be at least 18.
  if (!/^\d{3}-\d{2}-\d{4}$/.test(ssn)) {
    return NextResponse.json({ error: 'invalid_ssn' }, { status: 422 });
  }
  const eighteenCutoff = new Date();
  eighteenCutoff.setFullYear(eighteenCutoff.getFullYear() - 18);
  const dobTime = Date.parse(dob);
  if (Number.isNaN(dobTime) || new Date(dobTime) > eighteenCutoff) {
    return NextResponse.json({ error: 'invalid_dob' }, { status: 422 });
  }

  const sessionId = req.nextUrl.searchParams.get('session_id');
  const listingId = req.nextUrl.searchParams.get('listing_id');
  let authorization: BgCheckAuthorization | null = null;

  if (sessionId) {
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent'],
      });
    } catch (e) {
      console.error('[background] failed to retrieve checkout session', e);
      return NextResponse.json({ error: 'session_lookup_failed' }, { status: 400 });
    }
    if (session.metadata?.seeker_id !== user.id) {
      return NextResponse.json({ error: 'session_mismatch' }, { status: 403 });
    }
    const pi = session.payment_intent;
    const paymentIntentId = typeof pi === 'string' ? pi : pi?.id;
    if (!paymentIntentId) {
      return NextResponse.json({ error: 'no_payment_intent' }, { status: 400 });
    }
    authorization = await findByPaymentIntent(paymentIntentId);
    if (!authorization) {
      // Redirect-before-webhook race: the session completed but the Stripe
      // webhook hasn't recorded the authorization yet. Self-heal.
      await recordAuthorization({
        seekerId: user.id,
        checkoutSessionId: session.id,
        paymentIntentId,
        amountAuthorizedCents: session.amount_total ?? 0,
      });
      authorization = await findByPaymentIntent(paymentIntentId);
    }
  } else {
    authorization = await findPendingAuthorization(user.id);
  }

  if (!authorization) {
    return NextResponse.json({ error: 'no_pending_authorization' }, { status: 400 });
  }
  if (authorization.seeker_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (authorization.status === 'captured') {
    return NextResponse.json({ status: 'pass' }); // idempotent replay
  }
  if (authorization.status === 'voided') {
    return NextResponse.json({ error: 'authorization_voided' }, { status: 409 });
  }

  const provider = await getBackgroundProvider();
  const mockOverride = req.nextUrl.searchParams.get('mock');

  let vendorRef: string;
  if (
    mockOverride &&
    process.env.NODE_ENV === 'development' &&
    KNOWN_OUTCOMES.includes(mockOverride as BackgroundCheckOutcome)
  ) {
    vendorRef = `mock_bg_${mockOverride}_${user.id.slice(0, 8)}_${Date.now()}`;
  } else {
    const started = await provider.startCheck({ seekerId: user.id, legalName, dob, ssn });
    vendorRef = started.vendorRef;
  }
  const result = await provider.processResult(vendorRef);

  const admin = createAdminClient();
  const paymentIntentId = authorization.stripe_payment_intent_id;

  if (result.outcome === 'pass') {
    await stripe.paymentIntents.capture(paymentIntentId);
    await markCaptured(authorization.id, authorization.amount_authorized_cents);
    const { error } = await admin
      .from('profiles')
      .update({
        // The verified legal name replaces whatever the seeker typed at signup
        // and is locked from here on (enforced by the lock_verified_full_name
        // trigger). This is the name disclosed to listers on Connect.
        full_name: legalName.trim(),
        bg_check_vendor_ref: result.vendorRef,
        credit_score: result.creditScore,
        bg_check_completed_at: new Date().toISOString(),
        bg_check_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', user.id);
    if (error) {
      console.error('[background] failed to write profile bg-check fields', error);
      return NextResponse.json({ error: 'profile_update_failed' }, { status: 500 });
    }
    await grantPurchaseCredits({ seekerId: user.id, stripePaymentIntent: paymentIntentId });

    // Min-score hard block for a first-time seeker: their score is only known
    // now, after the check. They keep their verification + 3 credits, but if
    // they're below the listing they came from, they can't connect to it.
    // No credit is consumed (opening a chat is a later, separate step).
    let blockedListing = false;
    let minScore: number | null = null;
    if (listingId && result.creditScore != null) {
      const { data: listingRow } = await admin
        .from('listings')
        .select('min_credit_score')
        .eq('id', listingId)
        .maybeSingle();
      minScore = listingRow?.min_credit_score ?? null;
      blockedListing = minScore != null && result.creditScore < minScore;
    }
    return NextResponse.json({
      status: 'pass',
      creditScore: result.creditScore,
      blockedListing,
      minScore,
    });
  }

  if (result.outcome === 'no_match' || result.outcome === 'inconclusive') {
    if (authorization.status !== 'partially_captured') {
      await stripe.paymentIntents.capture(paymentIntentId, {
        amount_to_capture: BG_CHECK_FEE_CENTS,
      });
      await markPartiallyCaptured(authorization.id, BG_CHECK_FEE_CENTS);
    }
    return NextResponse.json({ status: 'retry', reason: result.outcome });
  }

  // technical_failure
  if (authorization.status === 'partially_captured') {
    // A prior no-match/inconclusive attempt already captured the $35 fee, so
    // the PaymentIntent is 'succeeded' and can't be canceled. Keep that
    // legitimate fee, close the authorization, and tell the seeker to try
    // again later — never 500 by attempting an invalid cancel.
    await markPartialCaptureResolved(authorization.id);
    return NextResponse.json({
      status: 'failed',
      reason: 'technical_failure',
      feeRetained: true,
    });
  }
  // Fresh authorization (nothing captured yet): release the hold entirely.
  await stripe.paymentIntents.cancel(paymentIntentId);
  await markVoided(authorization.id);
  return NextResponse.json({
    status: 'failed',
    reason: 'technical_failure',
    feeRetained: false,
  });
}
