-- Fix: close_chat's listing update used a CASE expression (text) against
-- listings.status (listing_status enum), which Postgres won't implicitly cast
-- ("column status is of type listing_status but expression is of type text").
-- Cast the CASE result to listing_status explicitly. (A bare literal like
-- 'active' works because it's typed 'unknown'; a CASE is typed text.)
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
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_reason not in ('closed_success', 'closed_didnt_work') then
    raise exception 'invalid_reason';
  end if;

  select id, seeker_id, lister_id, listing_id, status
    into v_chat
  from chats where id = p_chat_id for update;

  if v_chat.id is null then raise exception 'chat_not_found'; end if;
  if v_user <> v_chat.seeker_id then raise exception 'forbidden'; end if;
  if v_chat.status <> 'active' then raise exception 'chat_not_active'; end if;

  update chats
    set status = p_reason::chat_status, closed_at = now(), closed_reason = p_reason
  where id = p_chat_id;

  update listings
    set status = (case when p_reason = 'closed_success' then 'closed' else 'active' end)::listing_status
  where id = v_chat.listing_id;
end;
$$;

grant execute on function close_chat(uuid, text) to authenticated;
