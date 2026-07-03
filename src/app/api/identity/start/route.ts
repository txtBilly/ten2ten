import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getIdentityProvider } from '@/lib/identity';
import { MockIdentityProvider } from '@/lib/identity/mock';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('verification_status')
    .eq('id', user.id)
    .single();

  if (profile?.verification_status === 'verified') {
    return NextResponse.json({ error: 'Already verified' }, { status: 400 });
  }

  // Dev: allow ?mock=success|fail|underage to override outcome
  const mockOverride = req.nextUrl.searchParams.get('mock');

  let provider = await getIdentityProvider();
  if (mockOverride && process.env.NODE_ENV === 'development') {
    // Temporarily override the env for this request by creating a mock
    // provider that uses the query param as the outcome.
    const mock = new MockIdentityProvider();
    // Encode the override into the vendorRef prefix
    const vendorRef = `mock_${mockOverride}_${user.id.slice(0, 8)}_${Date.now()}`;
    await admin
      .from('profiles')
      .update({ verification_status: 'pending', kyc_vendor_ref: vendorRef })
      .eq('id', user.id);
    const result = await mock.processResult(vendorRef);
    const updates: Record<string, unknown> = {
      verification_status: result.status,
      kyc_vendor_ref: result.vendorRef,
    };
    if (result.status === 'verified') {
      updates.age = result.age;
      updates.identity_verified_at = new Date().toISOString();
    }
    await admin.from('profiles').update(updates).eq('id', user.id);
    return NextResponse.json({ status: result.status, failureReason: result.failureReason });
  }

  const { vendorRef } = await provider.startVerification(user.id);

  await admin
    .from('profiles')
    .update({ verification_status: 'pending', kyc_vendor_ref: vendorRef })
    .eq('id', user.id);

  // Mock mode: process immediately (no real async webhook)
  if ((process.env.IDENTITY_PROVIDER ?? 'mock') === 'mock') {
    const result = await provider.processResult(vendorRef);
    const updates: Record<string, unknown> = {
      verification_status: result.status,
      kyc_vendor_ref: result.vendorRef,
    };
    if (result.status === 'verified') {
      updates.age = result.age;
      updates.identity_verified_at = new Date().toISOString();
    }
    await admin.from('profiles').update(updates).eq('id', user.id);
    return NextResponse.json({ status: result.status, failureReason: result.failureReason });
  }

  return NextResponse.json({ status: 'pending' });
}
