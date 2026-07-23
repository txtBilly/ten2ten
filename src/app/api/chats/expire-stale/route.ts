import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Sweeps chat deadlines via the sweep_chat_deadlines() DB function (service
// role): auto-frees chats where the seeker never sent a first message within
// 24h, and chats whose lister close request went unconfirmed for 24h.
//
// Not wired to a scheduler yet. To run it automatically, either:
//   - Supabase pg_cron:  select cron.schedule('chat-deadlines', '*/15 * * * *',
//       $$ select sweep_chat_deadlines(); $$);  (runs the function directly, no
//       need for this route), or
//   - an external scheduler (Vercel Cron / GitHub Actions) hitting this route.
// This mirrors the still-unwired background-check expire-stale sweep; both
// should be put on the same schedule before launch.
export async function POST() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('sweep_chat_deadlines');
    if (error) {
      console.error('[chats] sweep_chat_deadlines failed', error);
      return NextResponse.json({ error: 'sweep_failed' }, { status: 500 });
    }
    return NextResponse.json({ closed: data ?? 0 });
  } catch (e) {
    console.error('[chats] expire-stale sweep failed', e);
    return NextResponse.json({ error: 'sweep_failed' }, { status: 500 });
  }
}
