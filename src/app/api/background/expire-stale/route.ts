import { NextResponse } from 'next/server';
import { voidStaleAuthorizations } from '@/lib/backgroundCheckPayments';

// Voids any bg_check_authorizations still 'authorized' >24h after creation —
// the seeker never submitted the verify form, so nothing was ever captured.
// Not wired to a scheduler yet (no cron infra exists in this repo); callable
// on demand for now. Wiring a real trigger (Vercel Cron / Supabase pg_cron)
// is a follow-up decision.
export async function POST() {
  try {
    const result = await voidStaleAuthorizations();
    return NextResponse.json(result);
  } catch (e) {
    console.error('[background] expire-stale sweep failed', e);
    return NextResponse.json({ error: 'sweep_failed' }, { status: 500 });
  }
}
