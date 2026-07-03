import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = user.id;

  // Guard: active chats (as seeker or lister)
  const { data: activeChats } = await supabase
    .from('chats')
    .select('id')
    .or(`seeker_id.eq.${id},lister_id.eq.${id}`)
    .eq('status', 'active')
    .limit(1);

  if (activeChats && activeChats.length > 0) {
    return NextResponse.json({ error: 'active_chat' }, { status: 409 });
  }

  // Guard: active or negotiating listings (as lister)
  const { data: activeListings } = await supabase
    .from('listings')
    .select('id')
    .eq('lister_id', id)
    .in('status', ['active', 'negotiating'])
    .limit(1);

  if (activeListings && activeListings.length > 0) {
    return NextResponse.json({ error: 'active_listing' }, { status: 409 });
  }

  // Soft-delete: anonymize PII and mark deleted
  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      full_name: 'Deleted User',
      display_first_name: 'Deleted',
      phone: '',
      email: '',
      deleted_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (profileError) {
    console.error('profile anonymize error', profileError);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  // Hard-delete auth user — cascades any remaining rows linked via FK
  const { error: deleteError } = await admin.auth.admin.deleteUser(id);
  if (deleteError) {
    console.error('auth delete error', deleteError);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
