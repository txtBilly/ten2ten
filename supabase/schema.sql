-- ============================================================================
-- Ten2Ten — Database Schema
-- Postgres (Supabase). Run this in the Supabase SQL editor or via migration.
-- Market: NYC / US. Languages: en, es.
-- ============================================================================

-- Extensions ------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";        -- geo search for listings

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type user_role          as enum ('seeker', 'lister');           -- a person can be both; role is per-context
create type verification_status as enum ('unverified', 'pending', 'verified', 'failed');
create type listing_status     as enum ('draft', 'active', 'negotiating', 'closed', 'suspended', 'removed');
create type listing_type       as enum ('studio', '1br', '2br', '3br_plus');
create type chat_status        as enum ('active', 'closed_didnt_work', 'closed_success', 'closed_reported');
create type credit_event       as enum ('purchase', 'consume', 'refund_report', 'refund_admin');
create type report_reason      as enum ('unresponsive', 'unavailable', 'inaccurate', 'fraudulent', 'incomplete');
create type report_status      as enum ('open', 'confirmed', 'dismissed');
create type strike_status      as enum ('active', 'expired', 'permanent');
create type notify_channel     as enum ('email', 'sms', 'push');
create type intake_status      as enum ('new', 'contacted', 'matched', 'closed');

-- ----------------------------------------------------------------------------
-- PROFILES  (1:1 with auth.users)
-- Sensitive identity (SSN, full DOB, raw background report) is NEVER stored here
-- in plaintext. SSN is tokenized by the KYC/background vendor; we keep only a
-- vendor reference + derived fields (age, credit score band).
-- ----------------------------------------------------------------------------
create table profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  full_name           text not null,
  display_first_name  text not null,                 -- shown before a chat opens
  phone               text not null,                 -- E.164, e.g. +19175550142
  email               text not null,
  preferred_locale    text not null default 'en' check (preferred_locale in ('en','es')),
  -- languages the lister can communicate in (shown on their listings)
  spoken_languages    text[] not null default '{en}',

  -- Identity / KYC (vendor-backed) -------------------------------------------
  verification_status verification_status not null default 'unverified',
  kyc_vendor_ref      text,                          -- Persona / Stripe Identity inquiry id
  id_document_url     text,                          -- private storage path (passport/ID photo)
  age                 int,                            -- derived; full DOB never exposed
  identity_verified_at timestamptz,

  -- Background check (US — TransUnion SmartMove) -----------------------------
  bg_check_vendor_ref text,                          -- SmartMove screening id
  bg_check_completed_at timestamptz,
  bg_check_expires_at timestamptz,                   -- 30-day validity
  has_criminal_record boolean,
  has_eviction_history boolean,
  credit_score        int,                           -- numeric; band shown to others
  bg_report_share_url text,                          -- shareable link for landlords

  -- Standing ------------------------------------------------------------------
  is_shadow_banned    boolean not null default false,
  rating_avg          numeric(2,1),                  -- 0.0–5.0
  rating_count        int not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- CONTACT CREDITS LEDGER
-- $100 purchase => +3 credits. Opening a chat => -1 (consume).
-- "Didn't work out" => credit is consumed (not refunded).
-- Confirmed report against lister => +1 (refund_report).
-- Available balance = sum(amount). Unused credits NEVER expire.
-- ----------------------------------------------------------------------------
create table credit_ledger (
  id              uuid primary key default uuid_generate_v4(),
  seeker_id       uuid not null references profiles(id) on delete cascade,
  event           credit_event not null,
  amount          int not null,                      -- +3 on purchase, -1 on consume, +1 on refund
  stripe_payment_intent text,                        -- set on 'purchase'
  related_chat_id uuid,                              -- set on consume / refund
  note            text,
  created_at      timestamptz not null default now()
);
create index on credit_ledger (seeker_id);

-- Convenience view: current available balance per seeker
create view seeker_credit_balance as
  select seeker_id, coalesce(sum(amount), 0) as available
  from credit_ledger
  group by seeker_id;

-- ----------------------------------------------------------------------------
-- LISTINGS
-- A lister may have only 1 ACTIVE/NEGOTIATING listing at a time, max 3 per
-- rolling year. Unlimited drafts. Enforced in application logic + trigger below.
-- ----------------------------------------------------------------------------
create table listings (
  id                uuid primary key default uuid_generate_v4(),
  lister_id         uuid not null references profiles(id) on delete cascade,
  status            listing_status not null default 'draft',

  -- Location: street number is NEVER shown until a chat opens.
  neighborhood      text,                            -- "Williamsburg, Brooklyn"
  cross_streets     text,                            -- "Graham Ave & N 1st St"
  full_address      text,                            -- revealed only in active chat
  zip               text,
  geo               geography(point, 4326),          -- approximate pin for browse

  type              listing_type,
  monthly_rent      int,                             -- USD
  sqft              int,
  floor             text,
  available_from    date,
  move_out_window_start date,
  move_out_window_end   date,

  -- Highlights
  pets_ok           boolean default false,
  laundry           boolean default false,
  doorman           boolean default false,
  elevator          boolean default false,
  outdoor           boolean default false,
  no_fee            boolean default true,

  -- Gratitude (off-platform thank-you; platform does NOT facilitate/verify)
  gratitude_amount  int,                             -- USD, lister-set, informational only

  -- Lister requirement gating the bid
  min_credit_score  int,                             -- e.g. 680

  -- Contact person for the apartment (the building manager / owner)
  contact_name      text,
  contact_phone     text,
  contact_confirmed boolean not null default false,  -- "I have contacted this person..."

  -- Photos (bedroom, kitchen, bathroom required) — stored in `listing_photos`
  published_at      timestamptz,
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on listings (status);
create index on listings (lister_id);
create index on listings using gist (geo);

create table listing_photos (
  id          uuid primary key default uuid_generate_v4(),
  listing_id  uuid not null references listings(id) on delete cascade,
  storage_path text not null,                        -- supabase storage key
  slot        text not null check (slot in ('bedroom','kitchen','bathroom','extra')),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index on listing_photos (listing_id);

-- Seekers favouriting a listing (to be notified when it frees up)
create table favourites (
  seeker_id   uuid not null references profiles(id) on delete cascade,
  listing_id  uuid not null references listings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (seeker_id, listing_id)
);

-- ----------------------------------------------------------------------------
-- CHATS  (a "bid" that opened a conversation)
-- Opening consumes 1 credit, sets listing -> negotiating, locks it to others.
-- Only 1 ACTIVE chat per seeker at a time.
-- Closes: seeker "didn't work out" | success | 3-day lister-initiated | report.
-- Chats are NEVER deletable, even if listing/profile is removed.
-- ----------------------------------------------------------------------------
create table chats (
  id                uuid primary key default uuid_generate_v4(),
  listing_id        uuid not null references listings(id),
  seeker_id         uuid not null references profiles(id),
  lister_id         uuid not null references profiles(id),
  status            chat_status not null default 'active',

  credit_ledger_id  uuid references credit_ledger(id),   -- the consume event

  opened_at         timestamptz not null default now(),
  -- Seeker has 24h to send a first message to stay active
  first_message_deadline timestamptz not null default (now() + interval '24 hours'),
  -- Lister may initiate close after 3 days; needs seeker confirm within 24h or auto-frees
  lister_close_requested_at timestamptz,
  closed_at         timestamptz,
  closed_reason     text,

  -- Profile disclosure: identity revealed to each other only after explicit share
  seeker_shared_profile boolean not null default false,
  lister_shared_profile boolean not null default false
);
create index on chats (seeker_id);
create index on chats (lister_id);
create index on chats (listing_id);
-- Enforce: at most one active chat per seeker
create unique index one_active_chat_per_seeker
  on chats (seeker_id) where (status = 'active');
-- Enforce: a listing can have at most one active chat
create unique index one_active_chat_per_listing
  on chats (listing_id) where (status = 'active');

create table messages (
  id          uuid primary key default uuid_generate_v4(),
  chat_id     uuid not null references chats(id) on delete cascade,
  sender_id   uuid not null references profiles(id),
  body        text not null,                         -- non-editable
  created_at  timestamptz not null default now()
  -- no updated_at: messages are immutable by design
);
create index on messages (chat_id);

-- ----------------------------------------------------------------------------
-- RATINGS (post-chat, both directions). 2 confirmed bad ratings -> suppression.
-- ----------------------------------------------------------------------------
create table ratings (
  id          uuid primary key default uuid_generate_v4(),
  chat_id     uuid not null references chats(id),
  rater_id    uuid not null references profiles(id),
  ratee_id    uuid not null references profiles(id),
  stars       int not null check (stars between 1 and 5),
  body        text,
  created_at  timestamptz not null default now(),
  unique (chat_id, rater_id)
);
create index on ratings (ratee_id);

-- ----------------------------------------------------------------------------
-- REPORTS & STRIKES
-- 2 confirmed reports from different people -> shadow ban / permanent removal.
-- ----------------------------------------------------------------------------
create table reports (
  id            uuid primary key default uuid_generate_v4(),
  reporter_id   uuid not null references profiles(id),
  listing_id    uuid references listings(id),
  reported_user uuid references profiles(id),
  chat_id       uuid references chats(id),
  reason        report_reason not null,
  detail        text,
  status        report_status not null default 'open',
  reviewed_by   uuid references profiles(id),        -- support staff
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index on reports (status);

create table strikes (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,
  listing_id    uuid references listings(id),
  report_id     uuid references reports(id),
  number        int not null,                        -- 1 or 2
  status        strike_status not null default 'active',
  reactivates_at timestamptz,                        -- 7-day suspension
  created_at    timestamptz not null default now()
);
create index on strikes (user_id);

-- ----------------------------------------------------------------------------
-- NOTIFICATION PREFERENCES
-- ----------------------------------------------------------------------------
create table notification_prefs (
  user_id       uuid primary key references profiles(id) on delete cascade,
  bid_accepted  notify_channel[] not null default '{sms,email}',
  chat_message  notify_channel[] not null default '{push}',
  listing_freed notify_channel[] not null default '{push,email}',
  expiry_warn   notify_channel[] not null default '{sms,push}',
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- COLD-START INTAKE  (the launch mechanic)
-- Seekers describe what they want via SMS / web chat BEFORE browse exists.
-- We manually match against early lister signups. No "empty playground."
-- ----------------------------------------------------------------------------
create table intake_requests (
  id              uuid primary key default uuid_generate_v4(),
  -- May be anonymous (just a phone) before they create an account
  profile_id      uuid references profiles(id),
  source          text not null default 'web' check (source in ('web','sms')),
  phone           text,
  email           text,

  -- What they're looking for
  neighborhoods   text[],                            -- desired areas
  type            listing_type,
  budget_max      int,
  move_in_by      date,
  must_haves      text[],                            -- ['pets_ok','laundry']
  free_text       text,                              -- "I'm looking for ..."
  preferred_locale text not null default 'en',

  status          intake_status not null default 'new',
  matched_listing uuid references listings(id),
  notes           text,                              -- internal concierge notes
  created_at      timestamptz not null default now()
);
create index on intake_requests (status);

-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------

-- updated_at maintenance
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_profiles_touch before update on profiles
  for each row execute function touch_updated_at();
create trigger trg_listings_touch before update on listings
  for each row execute function touch_updated_at();

-- Enforce listing limits: max 1 active/negotiating, max 3 published per rolling year
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

  -- count publishes in the trailing 365 days when transitioning to active
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

create trigger trg_listing_limits before insert or update on listings
  for each row execute function enforce_listing_limits();

-- Recompute rating aggregates on profile when a rating lands
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

create trigger trg_recompute_rating after insert on ratings
  for each row execute function recompute_rating();
