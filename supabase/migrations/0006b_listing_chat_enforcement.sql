-- ============================================================================
-- Session 3 — Enforcement (the missing triggers/indexes/RLS)
-- Confirmed live via direct RPC probing (2026-07-03): enforce_listing_limits,
-- open_contact, close_contact, grant_credits, confirm_report, recompute_rating,
-- and touch_updated_at do NOT exist in the live database in any form.
--
-- This migration mirrors supabase/schema.sql + supabase/rls-policies.sql
-- VERBATIM for the pieces Session 3 needs — those files are the canonical
-- design doc (the spec's own "unchanged scaffold schema in
-- supabase/schema.sql") and were sitting in this repo the whole time, unused.
-- Chat-open/close and credit-consume/refund logic (open_contact/close_contact/
-- grant_credits) stay out of scope here — that's Session 4.
--
-- Safe to re-run: functions use CREATE OR REPLACE, triggers and policies
-- are dropped-then-recreated, indexes use IF NOT EXISTS.
-- Run after 0006_listings.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- updated_at maintenance (supabase/schema.sql lines 303-311)
-- ----------------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_profiles_touch on profiles;
create trigger trg_profiles_touch before update on profiles
  for each row execute function touch_updated_at();

drop trigger if exists trg_listings_touch on listings;
create trigger trg_listings_touch before update on listings
  for each row execute function touch_updated_at();

-- ----------------------------------------------------------------------------
-- Enforce listing limits: max 1 active/negotiating, max 3 published per
-- rolling year (supabase/schema.sql lines 313-347)
-- ----------------------------------------------------------------------------
create or replace function enforce_listing_limits() returns trigger as $$
declare
  active_count int;
  yearly_count int;
begin
  if new.status in ('active','negotiating') then
    select count(*) into active_count
      from listings
      where lister_id = new.lister_id
        and status in ('active','negotiating')
        and id <> new.id;
    if active_count >= 1 then
      raise exception 'A lister may have only one active listing at a time';
    end if;
  end if;

  if new.status = 'active' and (old.status is null or old.status <> 'active') then
    select count(*) into yearly_count
      from listings
      where lister_id = new.lister_id
        and published_at > now() - interval '365 days';
    if yearly_count >= 3 then
      raise exception 'Listing limit reached: max 3 per year';
    end if;
    new.published_at = coalesce(new.published_at, now());
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_listing_limits on listings;
create trigger trg_listing_limits before insert or update on listings
  for each row execute function enforce_listing_limits();

-- ----------------------------------------------------------------------------
-- Recompute rating aggregates on profile when a rating lands
-- (supabase/schema.sql lines 349-364)
-- ----------------------------------------------------------------------------
create or replace function recompute_rating() returns trigger as $$
begin
  update profiles p set
    rating_avg = sub.avg, rating_count = sub.cnt
  from (
    select ratee_id, round(avg(stars)::numeric, 1) as avg, count(*) as cnt
    from ratings where ratee_id = new.ratee_id group by ratee_id
  ) sub
  where p.id = sub.ratee_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_recompute_rating on ratings;
create trigger trg_recompute_rating after insert on ratings
  for each row execute function recompute_rating();

-- ----------------------------------------------------------------------------
-- One active chat per seeker, and per listing (supabase/schema.sql lines 195-200)
-- ----------------------------------------------------------------------------
create unique index if not exists one_active_chat_per_seeker
  on chats (seeker_id) where (status = 'active');

create unique index if not exists one_active_chat_per_listing
  on chats (listing_id) where (status = 'active');

-- ----------------------------------------------------------------------------
-- Messages immutability. These policies ALREADY EXIST live, applied by
-- 0005_rls_session2.sql before any Session 3 work: "read messages in own
-- chats" (select) and "send messages in active chats" (insert) — same
-- logic as supabase/rls-policies.sql's "participants read messages" /
-- "participant sends message", just named differently. Do NOT recreate
-- under the rls-policies.sql names here — that produced a duplicate,
-- functionally-redundant pair the first time this migration ran live
-- (caught and cleaned up manually 2026-07-21). This block only re-asserts
-- the names that are actually live, so a re-run stays idempotent.
-- No delete policy anywhere => messages cannot be removed (immutable by design).
-- ----------------------------------------------------------------------------
alter table messages enable row level security;

drop policy if exists "read messages in own chats" on messages;
create policy "read messages in own chats" on messages for select
  using (exists (
    select 1 from chats c where c.id = chat_id
    and (c.seeker_id = auth.uid() or c.lister_id = auth.uid())
  ));

drop policy if exists "send messages in active chats" on messages;
create policy "send messages in active chats" on messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from chats c where c.id = chat_id
      and c.status = 'active'
      and (c.seeker_id = auth.uid() or c.lister_id = auth.uid())
    )
  );
