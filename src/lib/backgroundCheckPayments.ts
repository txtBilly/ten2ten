import { createAdminClient } from './supabase/server';
import { stripe } from './stripe';

export type AuthorizationStatus = 'authorized' | 'captured' | 'partially_captured' | 'voided';

export type BgCheckAuthorization = {
  id: string;
  seeker_id: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string;
  amount_authorized_cents: number;
  amount_captured_cents: number;
  status: AuthorizationStatus;
  created_at: string;
  resolved_at: string | null;
};

// Called from the Stripe webhook when a first-purchase (manual-capture)
// Checkout Session completes. Idempotency: unique constraint on
// stripe_payment_intent_id — a duplicate webhook delivery hits 23505.
export async function recordAuthorization(params: {
  seekerId: string;
  checkoutSessionId: string;
  paymentIntentId: string;
  amountAuthorizedCents: number;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('bg_check_authorizations').insert({
    seeker_id: params.seekerId,
    stripe_checkout_session_id: params.checkoutSessionId,
    stripe_payment_intent_id: params.paymentIntentId,
    amount_authorized_cents: params.amountAuthorizedCents,
  });
  if (error && error.code !== '23505') throw error;
}

// Most recent still-open authorization for a seeker — 'authorized' (fresh) or
// 'partially_captured' (a no-match/inconclusive retry in progress).
export async function findPendingAuthorization(
  seekerId: string
): Promise<BgCheckAuthorization | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('bg_check_authorizations')
    .select('*')
    .eq('seeker_id', seekerId)
    .in('status', ['authorized', 'partially_captured'])
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findByPaymentIntent(
  paymentIntentId: string
): Promise<BgCheckAuthorization | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('bg_check_authorizations')
    .select('*')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function markCaptured(id: string, amountCapturedCents: number): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('bg_check_authorizations')
    .update({
      status: 'captured',
      amount_captured_cents: amountCapturedCents,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function markPartiallyCaptured(id: string, amountCapturedCents: number): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('bg_check_authorizations')
    .update({ status: 'partially_captured', amount_captured_cents: amountCapturedCents })
    .eq('id', id);
  if (error) throw error;
}

// Close an authorization that already had its $35 captured (a prior
// no-match/inconclusive) when a later retry can't proceed — e.g. a technical
// failure. The PI is already 'succeeded', so it can't be canceled/voided; we
// keep the legitimately-captured fee and just stamp resolved_at so this row is
// no longer treated as an open, retryable authorization.
export async function markPartialCaptureResolved(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('bg_check_authorizations')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function markVoided(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('bg_check_authorizations')
    .update({ status: 'voided', resolved_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// 24h abandonment ("auto-refund within 24h if incomplete" — nothing was ever
// captured, so this releases the authorization hold, not a true refund). No
// scheduler is wired to this yet; callable on demand via
// /api/background/expire-stale until a real cron trigger is decided.
export async function voidStaleAuthorizations(): Promise<{ voided: number }> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: stale, error } = await admin
    .from('bg_check_authorizations')
    .select('id, stripe_payment_intent_id')
    .eq('status', 'authorized')
    .lt('created_at', cutoff);
  if (error) throw error;

  let voided = 0;
  for (const row of stale ?? []) {
    try {
      await stripe.paymentIntents.cancel(row.stripe_payment_intent_id);
      await markVoided(row.id);
      voided++;
    } catch (e) {
      // Most likely resolved concurrently by the normal flow — leave its
      // status alone rather than guessing.
      console.error('[background] stale-authorization cancel failed, skipping', row.id, e);
    }
  }
  return { voided };
}
