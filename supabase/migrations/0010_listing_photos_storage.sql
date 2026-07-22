-- ============================================================================
-- Session 3 — Listing photo storage
-- Creates the public `listing-photos` bucket the create-listing form uploads
-- to, plus the storage.objects RLS to read/write it. Photo rows themselves
-- live in `listing_photos` (already RLS'd by 0005_rls_session2.sql); this
-- migration only covers the underlying file objects.
-- Safe to re-run: bucket insert is ON CONFLICT DO NOTHING, policies are
-- dropped-then-recreated. Does NOT toggle RLS on storage.objects — Supabase
-- owns that table and RLS is already on there; altering it errors on some
-- projects. Owner update/delete policies live in 0011, split out so a
-- failure on this file doesn't take them down with it.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do nothing;

drop policy if exists "public read listing photos" on storage.objects;
create policy "public read listing photos" on storage.objects for select
  using (bucket_id = 'listing-photos');

drop policy if exists "owner uploads listing photos" on storage.objects;
create policy "owner uploads listing photos" on storage.objects for insert
  with check (bucket_id = 'listing-photos' and auth.uid() = owner);
