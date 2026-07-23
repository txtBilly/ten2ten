-- Step 4: realtime chat + close flow.

-- 1) Publish public.messages for Supabase Realtime (postgres_changes). Guarded
-- so re-running is safe.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
end $$;

-- 2) Close a chat atomically. Either participant may close an active chat via
-- the "How did it go?" flow. The consumed credit is NOT refunded here (a refund
-- only comes from a support-confirmed report, Session 5). Closing frees the
-- listing back to the market unless the deal succeeded, in which case it goes
-- off-market ('closed').
create or replace function close_chat(p_chat_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_chat record;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if p_reason not in ('closed_success', 'closed_didnt_work') then
    raise exception 'invalid_reason';
  end if;

  select id, seeker_id, lister_id, listing_id, status
    into v_chat
  from chats where id = p_chat_id
  for update;

  if v_chat.id is null then
    raise exception 'chat_not_found';
  end if;
  if v_user <> v_chat.seeker_id and v_user <> v_chat.lister_id then
    raise exception 'forbidden';
  end if;
  if v_chat.status <> 'active' then
    raise exception 'chat_not_active';
  end if;

  update chats
    set status = p_reason::chat_status,
        closed_at = now(),
        closed_reason = p_reason
  where id = p_chat_id;

  update listings
    set status = case when p_reason = 'closed_success' then 'closed' else 'active' end
  where id = v_chat.listing_id;
end;
$$;

grant execute on function close_chat(uuid, text) to authenticated;
