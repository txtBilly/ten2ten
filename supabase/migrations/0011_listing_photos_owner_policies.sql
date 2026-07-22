-- ============================================================================
-- Session 3 — Listing photo storage: owner update/delete
-- Follow-up to 0010. That migration's `alter table storage.objects enable
-- row level security` line errors on some projects (Supabase owns that
-- table; RLS is already on) — if the runner aborts on error, later
-- statements in the same file may not have landed even though the bucket
-- and earlier policies did. This file re-asserts replace/remove access with
-- no RLS-toggle statement to trip over.
-- Safe to re-run: policies are dropped-then-recreated.
-- ============================================================================

drop policy if exists "owner deletes listing photos" on storage.objects;
create policy "owner deletes listing photos" on storage.objects for delete
  using (bucket_id = 'listing-photos' and auth.uid() = owner);

drop policy if exists "owner updates listing photos" on storage.objects;
create policy "owner updates listing photos" on storage.objects for update
  using (bucket_id = 'listing-photos' and auth.uid() = owner)
  with check (bucket_id = 'listing-photos' and auth.uid() = owner);
