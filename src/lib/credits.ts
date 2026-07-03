import { createAdminClient } from './supabase/server';

// ============================================================================
// Contact credit rules (locked):
//   - $100 purchase => +3 credits
//   - Opening a chat => -1 (consume). Only 1 active chat per seeker at a time.
//   - "Didn't work out" close => credit stays consumed (NOT refunded).
//   - Confirmed report against the lister => +1 (refund_report).
//   - Unused credits NEVER expire.
// All writes go through the service-role client (RLS-bypassing, server-only).
// ============================================================================

export const CREDITS_PER_PURCHASE = 3;

export async function getBalance(seekerId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('credit_ledger')
    .select('amount')
    .eq('seeker_id', seekerId);
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
}

// Called from the Stripe webhook after a successful $100 payment.
export async function grantPurchaseCredits(params: {
  seekerId: string;
  stripePaymentIntent: string;
}): Promise<void> {
  const admin = createAdminClient();

  // Idempotency: don't double-credit the same payment intent.
  const { data: existing } = await admin
    .from('credit_ledger')
    .select('id')
    .eq('stripe_payment_intent', params.stripePaymentIntent)
    .maybeSingle();
  if (existing) return;

  const { error } = await admin.from('credit_ledger').insert({
    seeker_id: params.seekerId,
    event: 'purchase',
    amount: CREDITS_PER_PURCHASE,
    stripe_payment_intent: params.stripePaymentIntent,
    note: `Purchased ${CREDITS_PER_PURCHASE} contact credits`,
  });
  if (error) throw error;
}

// Consume one credit to open a chat. Returns the ledger row id so the chat
// can reference it. Throws if the seeker has no available credits.
// NOTE: opening the chat itself (and the "one active chat" guard) is handled
// in the chat-open server action; this only moves the ledger.
export async function consumeCredit(params: {
  seekerId: string;
  chatId: string;
}): Promise<string> {
  const admin = createAdminClient();
  const balance = await getBalance(params.seekerId);
  if (balance < 1) {
    throw new Error('NO_CREDITS');
  }
  const { data, error } = await admin
    .from('credit_ledger')
    .insert({
      seeker_id: params.seekerId,
      event: 'consume',
      amount: -1,
      related_chat_id: params.chatId,
      note: 'Opened a chat',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

// Refund a credit when a report against the lister is confirmed by support.
export async function refundCreditForReport(params: {
  seekerId: string;
  chatId: string;
}): Promise<void> {
  const admin = createAdminClient();

  // Idempotency: one refund per chat.
  const { data: existing } = await admin
    .from('credit_ledger')
    .select('id')
    .eq('related_chat_id', params.chatId)
    .eq('event', 'refund_report')
    .maybeSingle();
  if (existing) return;

  const { error } = await admin.from('credit_ledger').insert({
    seeker_id: params.seekerId,
    event: 'refund_report',
    amount: 1,
    related_chat_id: params.chatId,
    note: 'Credit refunded — confirmed report against lister',
  });
  if (error) throw error;
}
