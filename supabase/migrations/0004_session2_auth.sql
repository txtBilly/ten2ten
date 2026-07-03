-- Session 2: add intent + deleted_at to profiles, update public_profile_summary
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).

-- 1. New columns on profiles
alter table profiles
  add column if not exists intent text
    check (intent in ('looking', 'offering', 'both')),
  add column if not exists deleted_at timestamptz;

-- 2. Public summary view — excludes soft-deleted profiles
-- The base schema did not define this view yet; create it here.
create or replace view public_profile_summary as
select
  p.id,
  p.display_first_name,
  p.preferred_locale,
  p.spoken_languages,
  p.verification_status,
  (p.verification_status = 'verified') as is_verified,
  p.rating_avg,
  p.rating_count,
  p.created_at
from profiles p
where p.deleted_at is null
  and p.is_shadow_banned = false;
