-- Ten2Ten RLS Policies (Session 2)
-- Run this after the main schema is applied.

-- PROFILES
alter table profiles enable row level security;
create policy "insert own profile"
  on profiles for insert with check (auth.uid() = id);
create policy "select own profile"
  on profiles for select using (auth.uid() = id);
create policy "update own profile"
  on profiles for update using (auth.uid() = id);

-- NOTIFICATION_PREFS
alter table notification_prefs enable row level security;
create policy "insert own prefs"
  on notification_prefs for insert with check (auth.uid() = user_id);
create policy "select own prefs"
  on notification_prefs for select using (auth.uid() = user_id);
create policy "update own prefs"
  on notification_prefs for update using (auth.uid() = user_id);

-- CREDIT_LEDGER (read own; writes via service role)
alter table credit_ledger enable row level security;
create policy "select own credits"
  on credit_ledger for select using (auth.uid() = seeker_id);

-- LISTINGS (public reads for active/negotiating; lister writes own)
alter table listings enable row level security;
create policy "public reads active listings"
  on listings for select using (status in ('active','negotiating','closed'));
create policy "lister reads own listings"
  on listings for select using (auth.uid() = lister_id);
create policy "lister inserts own listings"
  on listings for insert with check (auth.uid() = lister_id);
create policy "lister updates own listings"
  on listings for update using (auth.uid() = lister_id);

-- LISTING_PHOTOS
alter table listing_photos enable row level security;
create policy "public reads photos"
  on listing_photos for select using (true);
create policy "lister manages own photos"
  on listing_photos for all
  using (exists (select 1 from listings l where l.id = listing_id and l.lister_id = auth.uid()));

-- FAVOURITES
alter table favourites enable row level security;
create policy "manage own favourites"
  on favourites for all using (auth.uid() = seeker_id);

-- CHATS (seeker or lister)
alter table chats enable row level security;
create policy "read own chats"
  on chats for select
  using (auth.uid() = seeker_id or auth.uid() = lister_id);

-- MESSAGES (immutable — no update/delete policy)
alter table messages enable row level security;
create policy "read messages in own chats"
  on messages for select
  using (exists (
    select 1 from chats c where c.id = chat_id
      and (c.seeker_id = auth.uid() or c.lister_id = auth.uid())
  ));
create policy "send messages in active chats"
  on messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from chats c where c.id = chat_id and c.status = 'active'
        and (c.seeker_id = auth.uid() or c.lister_id = auth.uid())
    )
  );

-- RATINGS
alter table ratings enable row level security;
create policy "read all ratings"
  on ratings for select using (true);
create policy "insert own ratings"
  on ratings for insert with check (auth.uid() = rater_id);

-- REPORTS
alter table reports enable row level security;
create policy "file own reports"
  on reports for insert with check (auth.uid() = reporter_id);
create policy "read own reports"
  on reports for select using (auth.uid() = reporter_id);

-- STRIKES
alter table strikes enable row level security;
create policy "read own strikes"
  on strikes for select using (auth.uid() = user_id);

-- INTAKE_REQUESTS (service role only — no public policies)
alter table intake_requests enable row level security;
