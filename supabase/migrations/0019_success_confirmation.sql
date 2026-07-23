-- Seeker "Got the place" no longer delists a listing unilaterally. It records a
-- pending success; the lister then confirms (→ listing off-market) or declines
-- (→ report cleared, chat continues). If the lister stays silent for 24h, the
-- success auto-confirms and the listing goes off-market.

alter table chats add column if not exists seeker_success_at timestamptz;

-- Seeker reports success (pending lister confirmation).
create or replace function report_success(p_chat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_chat record;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select id, seeker_id, status, seeker_success_at into v_chat from chats where id = p_chat_id for update;
  if v_chat.id is null then raise exception 'chat_not_found'; end if;
  if v_user <> v_chat.seeker_id then raise exception 'forbidden'; end if;
  if v_chat.status <> 'active' then raise exception 'chat_not_active'; end if;
  if v_chat.seeker_success_at is not null then raise exception 'already_reported'; end if;
  update chats set seeker_success_at = now() where id = p_chat_id;
end; $$;
grant execute on function report_success(uuid) to authenticated;

-- Lister confirms → close success + take the listing off-market.
create or replace function confirm_success(p_chat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_chat record;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select id, lister_id, listing_id, status, seeker_success_at into v_chat from chats where id = p_chat_id for update;
  if v_chat.id is null then raise exception 'chat_not_found'; end if;
  if v_user <> v_chat.lister_id then raise exception 'forbidden'; end if;
  if v_chat.status <> 'active' then raise exception 'chat_not_active'; end if;
  if v_chat.seeker_success_at is null then raise exception 'no_success_report'; end if;
  update chats set status = 'closed_success', closed_at = now(), closed_reason = 'closed_success' where id = p_chat_id;
  update listings set status = 'closed' where id = v_chat.listing_id;
end; $$;
grant execute on function confirm_success(uuid) to authenticated;

-- Lister declines → clear the report; the chat stays active.
create or replace function decline_success(p_chat_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_chat record;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select id, lister_id, status, seeker_success_at into v_chat from chats where id = p_chat_id for update;
  if v_chat.id is null then raise exception 'chat_not_found'; end if;
  if v_user <> v_chat.lister_id then raise exception 'forbidden'; end if;
  if v_chat.status <> 'active' then raise exception 'chat_not_active'; end if;
  if v_chat.seeker_success_at is null then raise exception 'no_success_report'; end if;
  update chats set seeker_success_at = null where id = p_chat_id;
end; $$;
grant execute on function decline_success(uuid) to authenticated;

-- Deadline sweep: (a) first-message no-show and (b) lister-close-request 24h
-- timeout auto-FREE (listing → active); (c) pending success unconfirmed for 24h
-- auto-CONFIRM (listing → closed). Chats with a pending success are excluded
-- from (a)/(b) so they resolve through (c).
create or replace function sweep_chat_deadlines()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_count int := 0;
begin
  for r in
    select c.id, c.listing_id from chats c
    where c.status = 'active'
      and c.seeker_success_at is null
      and (
        (c.first_message_deadline < now()
         and not exists (select 1 from messages m where m.chat_id = c.id and m.sender_id = c.seeker_id))
        or (c.lister_close_requested_at is not null and c.lister_close_requested_at < now() - interval '24 hours')
      )
  loop
    update chats set status = 'closed_didnt_work', closed_at = now(), closed_reason = 'auto_freed' where id = r.id;
    update listings set status = 'active' where id = r.listing_id;
    v_count := v_count + 1;
  end loop;

  for r in
    select c.id, c.listing_id from chats c
    where c.status = 'active'
      and c.seeker_success_at is not null
      and c.seeker_success_at < now() - interval '24 hours'
  loop
    update chats set status = 'closed_success', closed_at = now(), closed_reason = 'auto_confirmed' where id = r.id;
    update listings set status = 'closed' where id = r.listing_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end; $$;
