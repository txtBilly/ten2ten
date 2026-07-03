import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = user.id;

  const [
    { data: profile },
    { data: notificationPrefs },
    { data: credits },
    { data: listings },
    { data: chatsAsSeeker },
    { data: chatsAsLister },
    { data: messagesSent },
    { data: ratingsGiven },
    { data: ratingsReceived },
    { data: intakeRequests },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('notification_prefs').select('*').eq('user_id', id).single(),
    supabase.from('credit_ledger').select('*').eq('seeker_id', id).order('created_at'),
    supabase.from('listings').select('*, listing_photos(*)').eq('lister_id', id).order('created_at'),
    supabase.from('chats').select('*, messages(*)').eq('seeker_id', id).order('opened_at'),
    supabase.from('chats').select('*, messages(*)').eq('lister_id', id).order('opened_at'),
    supabase.from('messages').select('*').eq('sender_id', id).order('created_at'),
    supabase.from('ratings').select('*').eq('rater_id', id).order('created_at'),
    supabase.from('ratings').select('*').eq('ratee_id', id).order('created_at'),
    supabase.from('intake_requests').select('*').eq('profile_id', id).order('created_at'),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    profile,
    notification_prefs: notificationPrefs,
    credits,
    listings,
    chats_as_seeker: chatsAsSeeker,
    chats_as_lister: chatsAsLister,
    messages_sent: messagesSent,
    ratings_given: ratingsGiven,
    ratings_received: ratingsReceived,
    intake_requests: intakeRequests,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="ten2ten-data-export.json"',
    },
  });
}
