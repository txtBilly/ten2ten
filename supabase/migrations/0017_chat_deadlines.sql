-- Step 4b: chat deadlines + lister-initiated close.
--
-- Rules (locked with product): the seeker may close anytime ("How did it go?").
-- The lister cannot close directly — they may REQUEST close only after the
-- seeker has been silent for 24h (measured by the seeker's last message, or the
-- chat open time if they never messaged). The seeker then has 24h to confirm,
-- or a new seeker message re-engages and cancels the request, otherwise the
-- chat auto-frees. A separate 24h first-message deadline auto-frees chats the
-- seeker never opened.

-- 1) Lock the seeker-close function down to the seeker only.
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
  if v_user <> v_chat.seeker_id then raise exception 'forbidden'; end if;  -- seeker only
  if v_chat.status <> 'active' then raise exception 'chat_not_active'; end if;

  update chats
    set status = p_reason::chat_status, closed_at = now(), closed_reason = p_reason
  where id = p_chat_id;

  update listings
    set status = case when p_reason = 'closed_success' then 'closed' else 'active' end
  where id = v_chat.listing_id;
end;
$$;

grant execute on function close_chat(uuid, text) to authenticated;

-- 2) Lister requests close (only after 24h of seeker silence).
create or replace function request_close_chat(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_chat record;
  v_seeker_last timestamptz;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;

  select id, seeker_id, lister_id, status, opened_at, lister_close_requested_at
    into v_chat
  from chats where id = p_chat_id for update;

  if v_chat.id is null then raise exception 'chat_not_found'; end if;
  if v_user <> v_chat.lister_id then raise exception 'forbidden'; end if;  -- lister only
  if v_chat.status <> 'active' then raise exception 'chat_not_active'; end if;
  if v_chat.lister_close_requested_at is not null then raise exception 'already_requested'; end if;

  select max(created_at) into v_seeker_last
  from messages where chat_id = p_chat_id and sender_id = v_chat.seeker_id;

  if coalesce(v_seeker_last, v_chat.opened_at) > now() - interval '24 hours' then
    raise exception 'seeker_recently_active';
  end if;

  update chats set lister_close_requested_at = now() where id = p_chat_id;
end;
$$;

grant execute on function request_close_chat(uuid) to authenticated;

-- 3) Seeker confirms a pending lister close request.
create or replace function confirm_close_chat(p_chat_id uuid)
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

  select id, seeker_id, listing_id, status, lister_close_requested_at
    into v_chat
  from chats where id = p_chat_id for update;

  if v_chat.id is null then raise exception 'chat_not_found'; end if;
  if v_user <> v_chat.seeker_id then raise exception 'forbidden'; end if;
  if v_chat.status <> 'active' then raise exception 'chat_not_active'; end if;
  if v_chat.lister_close_requested_at is null then raise exception 'no_close_request'; end if;

  update chats
    set status = 'closed_didnt_work', closed_at = now(), closed_reason = 'lister_requested'
  where id = p_chat_id;
  update listings set status = 'active' where id = v_chat.listing_id;
end;
$$;

grant execute on function confirm_close_chat(uuid) to authenticated;

-- 4) A new seeker message re-engages the chat and cancels any pending request.
create or replace function clear_close_request_on_seeker_msg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update chats
    set lister_close_requested_at = null
  where id = new.chat_id
    and lister_close_requested_at is not null
    and seeker_id = new.sender_id;
  return new;
end;
$$;

drop trigger if exists trg_clear_close_request on messages;
create trigger trg_clear_close_request
  after insert on messages
  for each row execute function clear_close_request_on_seeker_msg();

-- 5) Deadline sweep (run on a schedule; also callable). Auto-frees:
--    (a) chats past first_message_deadline where the seeker never messaged, and
--    (b) chats whose lister close request has gone unconfirmed for 24h.
create or replace function sweep_chat_deadlines()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select c.id, c.listing_id
    from chats c
    where c.status = 'active'
      and (
        (c.first_message_deadline < now()
         and not exists (
           select 1 from messages m where m.chat_id = c.id and m.sender_id = c.seeker_id
         ))
        or
        (c.lister_close_requested_at is not null
         and c.lister_close_requested_at < now() - interval '24 hours')
      )
  loop
    update chats
      set status = 'closed_didnt_work', closed_at = now(), closed_reason = 'auto_freed'
    where id = r.id;
    update listings set status = 'active' where id = r.listing_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
-- Not granted to authenticated: called by the service role from the sweep route.
