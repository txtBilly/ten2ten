-- Background check payment lifecycle: first-purchase Checkout Sessions now
-- authorize $135 (manual capture) instead of auto-charging it. This table
-- tracks that authorization until the vendor result decides what gets
-- captured (full $135 on pass, $35-only on no-match/inconclusive, or voided
-- on technical failure / 24h abandonment).
create table if not exists bg_check_authorizations (
  id                        uuid primary key default uuid_generate_v4(),
  seeker_id                 uuid not null references profiles(id) on delete cascade,
  stripe_checkout_session_id text not null,
  stripe_payment_intent_id  text not null unique,
  amount_authorized_cents   int not null,
  amount_captured_cents     int not null default 0,
  status                    text not null default 'authorized'
    check (status in ('authorized', 'captured', 'partially_captured', 'voided')),
  created_at                timestamptz not null default now(),
  resolved_at               timestamptz
);
create index if not exists bg_check_authorizations_seeker_id_status_idx
  on bg_check_authorizations (seeker_id, status);

-- Guard the columns the background-check + credit-gate code reads/writes. These
-- were introduced in the Session 1-3 profile/listing schema (migrations
-- 0001-0003, not carried in this repo), so on the live DB they most likely
-- already exist and these statements are no-ops. Adding them idempotently here
-- makes 0013 self-sufficient: /api/background/start's profile update and the
-- min-credit-score gate can't 500 on a missing column, even on a fresh DB.
-- Locked scope: identity + credit score only. has_criminal_record /
-- has_eviction_history are retained for schema stability but nothing in the app
-- reads or writes them.
alter table profiles add column if not exists credit_score          int;
alter table profiles add column if not exists bg_check_vendor_ref    text;
alter table profiles add column if not exists bg_check_completed_at  timestamptz;
alter table profiles add column if not exists bg_check_expires_at    timestamptz;
alter table profiles add column if not exists has_criminal_record    boolean;
alter table profiles add column if not exists has_eviction_history   boolean;

-- Listing-specific hard block: a seeker below this score cannot connect to this
-- listing. Nullable — a listing may set no minimum.
alter table listings add column if not exists min_credit_score int;

-- Self-contained: don't assume 0007_connect_chat.sql actually ran live (it
-- apparently didn't — disclosed_bg_status was missing entirely). Add the
-- disclosed_* snapshot columns here too, idempotently, before constraining.
alter table chats add column if not exists disclosed_seeker_name text;
alter table chats add column if not exists disclosed_credit_score int;
alter table chats add column if not exists disclosed_bg_status text;

-- Locked decision: background check screens identity + credit score only.
-- disclosed_bg_status simplifies from ('pass','review','none') to a plain
-- ('verified','none') — drop any existing check constraint dynamically since
-- its auto-generated name was never confirmed live, then re-add.
do $$
declare
  con text;
begin
  select conname into con
  from pg_constraint
  where conrelid = 'chats'::regclass
    and pg_get_constraintdef(oid) ilike '%disclosed_bg_status%';
  if con is not null then
    execute format('alter table chats drop constraint %I', con);
  end if;
end $$;

alter table chats drop constraint if exists chats_disclosed_bg_status_check;
alter table chats add constraint chats_disclosed_bg_status_check
  check (disclosed_bg_status in ('verified', 'none'));
