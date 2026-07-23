-- Atomic Connect.
--
-- Tapping Connect (for a verified seeker with a credit who meets the listing's
-- minimum) must, in one transaction: open exactly one active chat, consume one
-- credit, lock the listing (active → negotiating), and snapshot the disclosed
-- identity onto the chat. Doing this in a single SECURITY DEFINER function makes
-- it truly atomic — any failed check rolls the whole thing back, so we never
-- burn a credit or leave a half-open chat. Every gate is re-checked here (not
-- just in the UI/checkout) since this function is the real enforcement point.
--
-- The partial-unique indexes from 0006b (one active chat per seeker, one per
-- listing) are the backstop; the FOR UPDATE lock on the listing serialises
-- concurrent connects to the same listing.

create or replace function open_connect_chat(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seeker    uuid := auth.uid();
  v_profile   record;
  v_listing   record;
  v_balance   int;
  v_chat_id   uuid;
  v_ledger_id uuid;
begin
  if v_seeker is null then
    raise exception 'not_authenticated';
  end if;

  select full_name, credit_score, bg_check_completed_at, bg_check_expires_at
    into v_profile
  from profiles
  where id = v_seeker;

  -- Must hold a valid, unexpired background check.
  if v_profile.bg_check_completed_at is null
     or v_profile.bg_check_expires_at is null
     or v_profile.bg_check_expires_at <= now() then
    raise exception 'not_verified';
  end if;

  select id, lister_id, min_credit_score, status
    into v_listing
  from listings
  where id = p_listing_id
  for update;

  if v_listing.id is null then
    raise exception 'listing_not_found';
  end if;
  if v_listing.status <> 'active' then
    raise exception 'listing_unavailable';
  end if;
  if v_listing.lister_id = v_seeker then
    raise exception 'own_listing';
  end if;

  -- Listing-specific hard block.
  if v_listing.min_credit_score is not null
     and (v_profile.credit_score is null or v_profile.credit_score < v_listing.min_credit_score) then
    raise exception 'below_min_score';
  end if;

  -- Must have an available credit.
  select coalesce(sum(amount), 0) into v_balance
  from credit_ledger
  where seeker_id = v_seeker;
  if v_balance < 1 then
    raise exception 'no_credits';
  end if;

  -- One active chat per seeker (index is the backstop; this gives a clean error).
  if exists (select 1 from chats where seeker_id = v_seeker and status = 'active') then
    raise exception 'active_chat_exists';
  end if;

  -- Open the chat with the disclosed-identity snapshot. first_message_deadline
  -- defaults to now() + 24h at the table level.
  insert into chats (
    listing_id, seeker_id, lister_id, status,
    disclosed_seeker_name, disclosed_credit_score, disclosed_bg_status
  )
  values (
    p_listing_id, v_seeker, v_listing.lister_id, 'active',
    v_profile.full_name, v_profile.credit_score, 'verified'
  )
  returning id into v_chat_id;

  -- Consume one credit, linked to the chat.
  insert into credit_ledger (seeker_id, event, amount, related_chat_id, note)
  values (v_seeker, 'consume', -1, v_chat_id, 'Opened a chat')
  returning id into v_ledger_id;

  update chats set credit_ledger_id = v_ledger_id where id = v_chat_id;

  -- Lock the listing so no one else can connect to it.
  update listings set status = 'negotiating' where id = p_listing_id;

  return v_chat_id;
end;
$$;

grant execute on function open_connect_chat(uuid) to authenticated;
