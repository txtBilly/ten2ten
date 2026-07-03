-- ============================================================================
-- Ten2Ten — Row Level Security
-- Default deny. Users see their own data; listings are public when active.
-- Messages can be inserted but NEVER updated or deleted (immutable chat).
-- ============================================================================

alter table profiles        enable row level security;
alter table listings        enable row level security;
alter table listing_photos  enable row level security;
alter table payments        enable row level security;
alter table contacts        enable row level security;
alter table listing_saves   enable row level security;
alter table messages        enable row level security;
alter table reports         enable row level security;
alter table reviews         enable row level security;
alter table strikes         enable row level security;
alter table notifications   enable row level security;
-- intake_requests handled server-side with the service role only.
alter table intake_requests enable row level security;

-- ---- PROFILES ----
create policy "read own profile"
  on profiles for select using (auth.uid() = id);
create policy "update own profile"
  on profiles for update using (auth.uid() = id);
-- Public, limited columns are exposed through a VIEW (see below), not the table.

-- ---- LISTINGS ----
create policy "anyone reads non-draft listings"
  on listings for select
  using (status in ('active','negotiating','closed','suspended'));
create policy "lister reads own listings"
  on listings for select using (auth.uid() = lister_id);
create policy "lister writes own listings"
  on listings for insert with check (auth.uid() = lister_id);
create policy "lister updates own listings"
  on listings for update using (auth.uid() = lister_id);

-- ---- LISTING PHOTOS ----
create policy "photos readable with listing"
  on listing_photos for select using (true);
create policy "lister manages own photos"
  on listing_photos for all
  using (exists (select 1 from listings l where l.id = listing_id and l.lister_id = auth.uid()));

-- ---- PAYMENTS ---- (read own; writes happen via service role webhook)
create policy "read own payments"
  on payments for select using (auth.uid() = seeker_id);

-- ---- CONTACTS ---- (seeker or the listing's lister)
create policy "read own contacts"
  on contacts for select
  using (
    auth.uid() = seeker_id
    or exists (select 1 from listings l where l.id = listing_id and l.lister_id = auth.uid())
  );
-- inserts/updates go through open_contact / close_contact (security definer)

-- ---- SAVES ----
create policy "manage own saves"
  on listing_saves for all using (auth.uid() = seeker_id);

-- ---- MESSAGES ---- insert only if you're a party to the contact; no update/delete
create policy "read messages in own contacts"
  on messages for select
  using (
    exists (
      select 1 from contacts c
      where c.id = contact_id
        and (c.seeker_id = auth.uid()
             or exists (select 1 from listings l where l.id = c.listing_id and l.lister_id = auth.uid()))
    )
  );
create policy "send messages in active own contacts"
  on messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from contacts c
      where c.id = contact_id and c.status = 'active'
        and (c.seeker_id = auth.uid()
             or exists (select 1 from listings l where l.id = c.listing_id and l.lister_id = auth.uid()))
    )
  );
-- NOTE: no UPDATE or DELETE policy on messages => immutable by design.

-- ---- REPORTS ----
create policy "file own reports"
  on reports for insert with check (auth.uid() = reporter_id);
create policy "read own reports"
  on reports for select using (auth.uid() = reporter_id);

-- ---- REVIEWS ----
create policy "read reviews"
  on reviews for select using (true);
create policy "write own reviews"
  on reviews for insert with check (auth.uid() = rater_id);

-- ---- STRIKES ---- (lister reads own)
create policy "read own strikes"
  on strikes for select using (auth.uid() = lister_id);

-- ---- NOTIFICATIONS ----
create policy "read own notifications"
  on notifications for select using (auth.uid() = user_id);
create policy "update own notifications"
  on notifications for update using (auth.uid() = user_id);

-- intake_requests: no public policies => service role only.

-- ============================================================================
-- PUBLIC LISTING VIEW — what seekers see before opening a contact.
-- Hides full_address, contact person, and street-level data.
-- ============================================================================
create view public_listings as
select
  l.id, l.neighborhood, l.intersection, l.zip, l.unit_type,
  l.monthly_rent_cents, l.move_out_start, l.move_out_end,
  l.highlights, l.min_credit_score, l.gratitude_cents,
  l.lister_languages, l.status, l.published_at,
  p.full_name        as lister_name,
  p.rating_avg       as lister_rating,
  p.rating_count     as lister_rating_count,
  p.identity_verified as lister_verified
from listings l
join profiles p on p.id = l.lister_id
where l.status in ('active','negotiating');

-- ============================================================================
-- PUBLIC PROFILE SHARE — verified summary shown in chat. No SSN, no full DOB.
-- ============================================================================
create view shared_profile_summary as
select
  id,
  full_name,
  date_part('year', age(date_of_birth))::int as age,
  credit_score,
  criminal_clear,
  eviction_clear,
  identity_verified
from profiles;
