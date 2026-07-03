-- ============================================================================
-- Ten2Ten — Row Level Security (RLS) Policies
-- Run AFTER schema.sql. These enforce who can read/write what.
-- The service-role key (server-side only) bypasses RLS for admin/webhook work.
-- ============================================================================

alter table profiles            enable row level security;
alter table credit_ledger       enable row level security;
alter table listings            enable row level security;
alter table listing_photos      enable row level security;
alter table favourites          enable row level security;
alter table chats               enable row level security;
alter table messages            enable row level security;
alter table ratings             enable row level security;
alter table reports             enable row level security;
alter table strikes             enable row level security;
alter table notification_prefs  enable row level security;
alter table intake_requests     enable row level security;

-- ----------------------------------------------------------------------------
-- PROFILES
-- A user can read & update only their own full profile. Public-facing summary
-- fields (display_first_name, rating, verified badge) are exposed via a
-- separate VIEW so we never leak SSN/credit/DOB through the table itself.
-- ----------------------------------------------------------------------------
create policy "own profile read"   on profiles for select using (auth.uid() = id);
create policy "own profile update" on profiles for update using (auth.uid() = id);
create policy "own profile insert" on profiles for insert with check (auth.uid() = id);

-- Public summary view (safe subset). Identity details are NEVER included here.
create or replace view public_profile_summary as
  select
    id,
    display_first_name,
    verification_status,
    rating_avg,
    rating_count,
    is_shadow_banned
  from profiles;
grant select on public_profile_summary to authenticated, anon;

-- ----------------------------------------------------------------------------
-- CREDIT LEDGER — read your own only. Writes happen server-side (service role).
-- ----------------------------------------------------------------------------
create policy "own credits read" on credit_ledger for select using (auth.uid() = seeker_id);

-- ----------------------------------------------------------------------------
-- LISTINGS
-- Anyone (incl. anon) can read active/negotiating listings (street number is
-- a column we omit client-side until a chat opens). Listers manage their own,
-- including drafts. Suspended listings are visible only to people who favourited.
-- ----------------------------------------------------------------------------
create policy "public read active listings" on listings for select
  using (status in ('active','negotiating'));

create policy "lister reads own listings" on listings for select
  using (auth.uid() = lister_id);

create policy "favouriter reads suspended" on listings for select
  using (
    status = 'suspended'
    and exists (select 1 from favourites f where f.listing_id = listings.id and f.seeker_id = auth.uid())
  );

create policy "lister writes own listings" on listings for all
  using (auth.uid() = lister_id) with check (auth.uid() = lister_id);

-- ----------------------------------------------------------------------------
-- LISTING PHOTOS — readable if the parent listing is readable; writable by owner.
-- ----------------------------------------------------------------------------
create policy "photos follow listing read" on listing_photos for select
  using (exists (select 1 from listings l where l.id = listing_id));
create policy "owner writes photos" on listing_photos for all
  using (exists (select 1 from listings l where l.id = listing_id and l.lister_id = auth.uid()))
  with check (exists (select 1 from listings l where l.id = listing_id and l.lister_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- FAVOURITES — your own only.
-- ----------------------------------------------------------------------------
create policy "own favourites" on favourites for all
  using (auth.uid() = seeker_id) with check (auth.uid() = seeker_id);

-- ----------------------------------------------------------------------------
-- CHATS — only the two participants. Opening/closing handled server-side to
-- enforce credit consumption and listing locking atomically.
-- ----------------------------------------------------------------------------
create policy "participants read chat" on chats for select
  using (auth.uid() = seeker_id or auth.uid() = lister_id);
create policy "participants update share flag" on chats for update
  using (auth.uid() = seeker_id or auth.uid() = lister_id);

-- ----------------------------------------------------------------------------
-- MESSAGES — only chat participants can read; sender must be a participant.
-- No delete policy => messages cannot be removed (immutable by design).
-- ----------------------------------------------------------------------------
create policy "participants read messages" on messages for select
  using (exists (
    select 1 from chats c where c.id = chat_id
    and (c.seeker_id = auth.uid() or c.lister_id = auth.uid())
  ));
create policy "participant sends message" on messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from chats c where c.id = chat_id
      and c.status = 'active'
      and (c.seeker_id = auth.uid() or c.lister_id = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- RATINGS — readable by anyone (public reputation); writable by chat participant.
-- ----------------------------------------------------------------------------
create policy "public read ratings" on ratings for select using (true);
create policy "participant writes rating" on ratings for insert
  with check (
    rater_id = auth.uid()
    and exists (select 1 from chats c where c.id = chat_id
      and (c.seeker_id = auth.uid() or c.lister_id = auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- REPORTS — a user can file and read their own reports. Review is service-role.
-- ----------------------------------------------------------------------------
create policy "own reports read"  on reports for select using (auth.uid() = reporter_id);
create policy "file a report"     on reports for insert with check (auth.uid() = reporter_id);

-- ----------------------------------------------------------------------------
-- STRIKES — a user can read strikes against them. Writes are service-role only.
-- ----------------------------------------------------------------------------
create policy "own strikes read" on strikes for select using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- NOTIFICATION PREFS — your own only.
-- ----------------------------------------------------------------------------
create policy "own notif prefs" on notification_prefs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- INTAKE — a logged-in user reads their own; anonymous submissions are
-- insert-only from the server (service role). Authenticated users may insert
-- their own.
-- ----------------------------------------------------------------------------
create policy "own intake read"   on intake_requests for select using (auth.uid() = profile_id);
create policy "own intake insert" on intake_requests for insert
  with check (profile_id is null or profile_id = auth.uid());
