-- Lister declining a "got the place" claim now frees the listing immediately:
-- the chat closes as "didn't work out" and the listing goes back on the market
-- (no grace period, no re-engage).
create or replace function decline_success(p_chat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_chat record;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select id, lister_id, listing_id, status, seeker_success_at into v_chat from chats where id = p_chat_id for update;
  if v_chat.id is null then raise exception 'chat_not_found'; end if;
  if v_user <> v_chat.lister_id then raise exception 'forbidden'; end if;
  if v_chat.status <> 'active' then raise exception 'chat_not_active'; end if;
  if v_chat.seeker_success_at is null then raise exception 'no_success_report'; end if;
  update chats
    set status = 'closed_didnt_work', closed_at = now(),
        closed_reason = 'success_declined', seeker_success_at = null
  where id = p_chat_id;
  update listings set status = 'active' where id = v_chat.listing_id;
end; $$;
grant execute on function decline_success(uuid) to authenticated;
