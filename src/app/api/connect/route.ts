import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Atomic Connect: opens a chat by calling the open_connect_chat DB function,
// which consumes a credit, locks the listing, and snapshots the disclosed
// identity — all in one transaction. Called with the seeker's auth context so
// auth.uid() inside the function is the caller.
const KNOWN_ERRORS = new Set([
  'not_authenticated',
  'not_verified',
  'listing_not_found',
  'listing_unavailable',
  'own_listing',
  'below_min_score',
  'no_credits',
  'active_chat_exists',
]);

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
  const listingId = (body as { listingId?: unknown })?.listingId;
  if (typeof listingId !== 'string' || !listingId) {
    return NextResponse.json({ error: 'missing_listing_id' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('open_connect_chat', { p_listing_id: listingId });

  if (error) {
    // The function raises named exceptions (e.g. 'no_credits'); surface the
    // known ones as a clean 409 so the client can message them, and treat
    // anything unexpected as a 500.
    const code = KNOWN_ERRORS.has(error.message) ? error.message : 'connect_failed';
    const status = code === 'connect_failed' ? 500 : 409;
    if (status === 500) console.error('[connect] open_connect_chat failed', error);
    return NextResponse.json({ error: code }, { status });
  }

  return NextResponse.json({ chatId: data });
}
