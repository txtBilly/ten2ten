-- ============================================================================
-- Session 3 — Listings & Browse
-- Reconciled against the LIVE schema (2026-07-03). Only genuine gaps included.
-- ============================================================================

-- 1. Add 'room' to the listing_type enum (live enum has studio|1br|2br|3br_plus).
--    Run this statement on its own if Postgres rejects enum changes in a txn block.
alter type listing_type add value if not exists 'room' before 'studio';

-- 2. Listing fields the live table is missing.
alter table listings add column if not exists description text;
alter table listings add column if not exists walk_up boolean not null default false;

-- 3. Consent record captured at signup (checkbox gate). intent + deleted_at
--    ALREADY EXIST live (from 0004_session2_auth.sql) — do NOT re-add.
alter table profiles add column if not exists consent_version text;
alter table profiles add column if not exists consented_at timestamptz;

-- NOTE: Do NOT touch public_profile_summary. The live view (from
-- 0004_session2_auth.sql) already filters deleted_at is null AND
-- is_shadow_banned = false, and exposes more columns than the scaffold version.
-- Rewriting it here would drop preferred_locale / spoken_languages / created_at
-- / is_verified. Leave it as-is.
