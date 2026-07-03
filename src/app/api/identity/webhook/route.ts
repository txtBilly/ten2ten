// Real provider webhook handler (e.g. Stripe Identity).
// Called by the KYC provider when verification completes.
// For mock mode this is never called — the start route handles it inline.
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getIdentityProvider } from '@/lib/identity';

export async function POST(req: NextRequest) {
  // TODO: verify webhook signature for production providers.
  const body = await req.json();
  const { vendor_ref: vendorRef } = body;

  if (!vendorRef) {
    return NextResponse.json({ error: 'Missing vendor_ref' }, { status: 400 });
  }

  const provider = await getIdentityProvider();
  const result = await provider.processResult(vendorRef);

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {
    verification_status: result.status,
    kyc_vendor_ref: vendorRef,
  };
  if (result.status === 'verified') {
    // Enforce 18+ — provider should catch this, but double-check here
    if (result.age !== undefined && result.age < 18) {
      updates.verification_status = 'failed';
      updates.kyc_vendor_ref = vendorRef;
    } else {
      updates.age = result.age;
      updates.identity_verified_at = new Date().toISOString();
    }
  }

  const { error } = await admin
    .from('profiles')
    .update(updates)
    .eq('kyc_vendor_ref', vendorRef);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
