-- ============================================================================
-- Ten2Ten — Initial schema
-- Market: US / NYC.  Languages: en, es.
-- Model: $100 = 3 contact credits, spent one chat at a time.
--        Unused credits never expire. "Didn't work out" consumes the credit.
--        Confirmed report refunds the credit.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type user_role          as enum ('seeker', 'lister', 'both');
create type pref_language       as enum ('en', 'es');
create type bg_check_status     as enum ('none', 'pending', 'clear', 'failed');
create type listing_status      as enum ('draft', 'active', 'negotiating', 'closed', 'suspended', 'removed');
create type unit_type           as enum ('studio', '1br', '2br', '3br_plus');
create type photo_category      as enum ('bedroom', 'kitchen', 'bathroom', 'other');
create type payment_status      as enum ('pending', 'succeeded', 'failed', 'refunded');
create type contact_status      as enum ('active', 'closed_seeker', 'closed_lister', 'expired', 'reported_refunded');
create type report_category     as enum ('unresponsive', 'unavailable', 'inaccurate', 'fraud', 'incomplete');
create type report_status       as enum ('pending', 'confirmed', 'dismissed');
create type intake_source       as enum ('web', 'sms');

-- ----------------------------------------------------------------------------
-- PROFILES  (extends Supabase auth.users)
-- ----------------------------------------------------------------------------
create table profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  role                     user_role     not null default 'seeker',
  full_name                text,
  phone                    text,
  email                    text,
  date_of_birth            date,
  -- US registration data. SSN is NEVER stored raw; only a verification result.
  street_address           text,
  city                     text,
  state                    text,
  zip                      text,

  -- Identity (KYC) via Stripe Identity / Persona
  identity_verified        boolean       not null default false,
  identity_verified_at     timestamptz,

  -- Background check (TransUnion SmartMove). One-time, valid 30 days.
  bg_check_status          bg_check_status not null default 'none',
  bg_check_at              timestamptz,
  bg_check_expires_at      timestamptz,
  bg_report_share_token    uuid,                       -- shareable link for landlords
  credit_score             int,
  criminal_clear           boolean,
  eviction_clear           boolean,

  -- Contact credits: how many unused chat credits the seeker holds. Never expire.
  contact_credits          int           not null default 0,

  -- Reputation
  rating_avg               numeric(2,1)  not null default 0,
  rating_count             int           not null default 0,
  shadow_banned            boolean       not null default false,
  shadow_ban_reason        text,

  -- Languages spoken (shown on listings). preferred_language drives the UI.
  languages                text[]        not null default array['en'],
  preferred_language       pref_language not null default 'en',

  -- Per-event notification routing: { "bid_accepted": ["sms","push"], ... }
  notification_prefs       jsonb         not null default '{}'::jsonb,

  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now()
);

-- ----------------------------------------------------------------------------
-- LISTINGS
-- A lister may have only 1 ACTIVE/NEGOTIATING listing, max 3 published per year.
-- Drafts are unlimited (enforced: drafts excluded from the cap).
-- ----------------------------------------------------------------------------
create table listings (
  id                       uuid primary key default gen_random_uuid(),
  lister_id                uuid          not null references profiles(id) on delete cascade,
  status                   listing_status not null default 'draft',

  neighborhood             text,
  intersection             text,                       -- shown publicly
  zip                      text,
  unit_type                unit_type,
  monthly_rent_cents       int,
  move_out_start           date,
  move_out_end             date,
  highlights               text[]        not null default '{}',   -- laundry, pets_ok, doorman, elevator, outdoor
  min_credit_score         int,                        -- lister's requirement to bid
  gratitude_cents          int           not null default 0,      -- off-platform thank-you (NOT a commission)

  -- Revealed to the seeker only after a contact (bid) opens.
  full_address             text,
  contact_person_name      text,
  contact_person_phone     text,
  contact_confirmed        boolean       not null default false,

  lister_languages         text[]        not null default array['en'],

  published_at             timestamptz,
  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now()
);

create index idx_listings_status      on listings(status);
create index idx_listings_lister      on listings(lister_id);
create index idx_listings_zip         on listings(zip);
create index idx_listings_rent        on listings(monthly_rent_cents);

-- ----------------------------------------------------------------------------
-- LISTING PHOTOS  (bedroom, kitchen, bathroom required at publish)
-- ----------------------------------------------------------------------------
create table listing_photos (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references listings(id) on delete cascade,
  url          text not null,
  category     photo_category not null,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index idx_photos_listing on listing_photos(listing_id);

-- ----------------------------------------------------------------------------
-- PAYMENTS  ($100 -> 3 contact credits; first time may bundle bg-check fee)
-- ----------------------------------------------------------------------------
create table payments (
  id                        uuid primary key default gen_random_uuid(),
  seeker_id                 uuid not null references profiles(id) on delete cascade,
  stripe_payment_intent_id  text unique,
  amount_cents              int  not null,             -- 10000 = $100
  bg_check_fee_cents        int  not null default 0,   -- e.g. 3500 the first time
  credits_granted           int  not null default 3,
  status                    payment_status not null default 'pending',
  created_at                timestamptz not null default now()
);
create index idx_payments_seeker on payments(seeker_id);

-- ----------------------------------------------------------------------------
-- CONTACTS  (a "bid" — spending one credit to open a chat with a listing)
-- One ACTIVE contact per seeker at a time. Listing becomes 'negotiating'.
-- ----------------------------------------------------------------------------
create table contacts (
  id              uuid primary key default gen_random_uuid(),
  seeker_id       uuid not null references profiles(id) on delete cascade,
  listing_id      uuid not null references listings(id) on delete cascade,
  status          contact_status not null default 'active',

  opened_at       timestamptz not null default now(),
  -- Seeker has 24h to send the first message to keep it active.
  first_msg_due   timestamptz not null default (now() + interval '24 hours'),
  -- Lister may initiate close after 3 days; needs seeker confirm within 24h, else auto-frees.
  lister_close_eligible_at timestamptz not null default (now() + interval '3 days'),
  closed_at       timestamptz,
  close_reason    text,
  credit_refunded boolean not null default false,

  created_at      timestamptz not null default now()
);
create index idx_contacts_seeker  on contacts(seeker_id);
create index idx_contacts_listing on contacts(listing_id);
create index idx_contacts_status  on contacts(status);

-- A seeker can hold only one active contact at a time.
create unique index idx_one_active_contact_per_seeker
  on contacts(seeker_id) where status = 'active';

-- A listing can have only one active contact at a time.
create unique index idx_one_active_contact_per_listing
  on contacts(listing_id) where status = 'active';

-- ----------------------------------------------------------------------------
-- SAVES  (favourite a negotiating listing; notify when it frees up)
-- ----------------------------------------------------------------------------
create table listing_saves (
  seeker_id     uuid not null references profiles(id) on delete cascade,
  listing_id    uuid not null references listings(id) on delete cascade,
  notify_on_free boolean not null default true,
  created_at    timestamptz not null default now(),
  primary key (seeker_id, listing_id)
);

-- ----------------------------------------------------------------------------
-- MESSAGES  (non-deletable, non-editable — enforced by RLS: no UPDATE/DELETE)
-- ----------------------------------------------------------------------------
create table messages (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id) on delete cascade,
  sender_id   uuid not null references profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);
create index idx_messages_contact on messages(contact_id, created_at);

-- ----------------------------------------------------------------------------
-- REPORTS  (2 confirmed from different people -> shadow ban)
-- ----------------------------------------------------------------------------
create table reports (
  id                 uuid primary key default gen_random_uuid(),
  reporter_id        uuid not null references profiles(id) on delete cascade,
  reported_user_id   uuid references profiles(id) on delete cascade,
  listing_id         uuid references listings(id) on delete set null,
  contact_id         uuid references contacts(id) on delete set null,
  category           report_category not null,
  detail             text,
  status             report_status not null default 'pending',
  reviewed_by        uuid references profiles(id),
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index idx_reports_status on reports(status);
create index idx_reports_listing on reports(listing_id);

-- ----------------------------------------------------------------------------
-- REVIEWS / RATINGS  (both sides rate after a contact closes)
-- ----------------------------------------------------------------------------
create table reviews (
  id          uuid primary key default gen_random_uuid(),
  contact_id  uuid not null references contacts(id) on delete cascade,
  rater_id    uuid not null references profiles(id) on delete cascade,
  rated_id    uuid not null references profiles(id) on delete cascade,
  rating      int  not null check (rating between 1 and 5),
  body        text,
  created_at  timestamptz not null default now(),
  unique (contact_id, rater_id)
);
create index idx_reviews_rated on reviews(rated_id);

-- ----------------------------------------------------------------------------
-- STRIKES  (listing suspensions; 2nd strike = permanent removal)
-- ----------------------------------------------------------------------------
create table strikes (
  id              uuid primary key default gen_random_uuid(),
  lister_id       uuid not null references profiles(id) on delete cascade,
  listing_id      uuid references listings(id) on delete set null,
  report_id       uuid references reports(id) on delete set null,
  strike_number   int  not null check (strike_number in (1,2)),
  suspended_until timestamptz,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- INTAKE REQUESTS  (cold-start: "tell us what you're looking for")
-- ----------------------------------------------------------------------------
create table intake_requests (
  id                 uuid primary key default gen_random_uuid(),
  phone              text,
  email              text,
  neighborhoods      text[] not null default '{}',
  budget_max_cents   int,
  unit_type          unit_type,
  move_in_date       date,
  notes              text,
  source             intake_source not null default 'web',
  matched            boolean not null default false,
  created_at         timestamptz not null default now()
);
create index idx_intake_matched on intake_requests(matched);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS  (queue + log across push/email/sms)
-- ----------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  type        text not null,                  -- bid_accepted, listing_freed, strike_1, ...
  channel     text not null,                  -- push | email | sms
  payload     jsonb not null default '{}'::jsonb,
  sent_at     timestamptz,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index idx_notifications_user on notifications(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_profiles_updated  before update on profiles for each row execute function set_updated_at();
create trigger trg_listings_updated  before update on listings for each row execute function set_updated_at();
