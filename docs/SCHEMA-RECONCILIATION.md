# Schema Reconciliation — Specs vs. Live Database (2026-07-03)

The live Supabase database was introspected directly. Good news: it matches the
**scaffold schema** the specs were written against — NOT the stale draft migration
files (`0001`–`0003`) sitting on disk, which use different names (`unit_type`,
`intersection`, `listing_saves`) and were never applied. Those stale files should
be ignored / deleted; the live DB is the truth.

## Live schema confirms the spec's names are correct
`listing_type`, `cross_streets`, `favourites`, `chats`, `credit_ledger`, `ratings`
(with `ratee_id` + `stars`), `reports` (with `reason` + `status` open|confirmed|dismissed),
`strikes` (`user_id`), `notification_prefs`, `intake_requests`, and the amenity
booleans (`pets_ok`, `laundry`, `doorman`, `elevator`, `outdoor`, `no_fee`) all
exist live exactly as the specs assume.

## Genuine gaps the migrations correctly address
- `0003`: add `room` to `listing_type`; add `listings.description`, `listings.walk_up`; add `profiles.consent_version`, `profiles.consented_at`.
- `0004`: drop `chats.seeker_shared_profile` / `lister_shared_profile`; add `disclosed_*` snapshot cols.
- `0005`: rename `report_reason` `incomplete` → `something_else`; add `reports.refund_issued`, `profiles.is_suppressed`.
- `0006`: add `profiles.is_staff`; add two indexes.

## Corrections applied to the migrations (vs. what was in the earlier bundle)
1. **`0003` no longer rewrites `public_profile_summary`.** The live view (from
   `0004_session2_auth.sql`) is richer than the scaffold version and already filters
   `deleted_at is null AND is_shadow_banned = false`. Rewriting it would drop
   `preferred_locale`, `spoken_languages`, `created_at`, `is_verified`. Left untouched.
2. **`0003` no longer re-adds `intent` / `deleted_at`.** They already exist live.

## Two things to VERIFY before building (not assumptions)
1. **Money units.** Live `listings.monthly_rent` and `gratitude_amount` are plain
   `integer`. Confirm whether they hold **dollars or cents** by checking existing
   rows / the create-listing code in `src/`. The specs/UI assume dollars ($2,800).
   If the live data is cents, the UI must divide by 100. **Decide before writing the
   listing form.** (Credits `amount` is a signed count, unrelated.)
2. **Triggers & RPCs are unconfirmed.** Introspection couldn't see triggers or
   plpgsql functions. The Session 3 spec says "DB trigger `enforce_listing_limits`
   already present — surface errors." This is NOT confirmed. Before relying on it,
   check whether the trigger + the `open_contact` / `close_contact` / `grant_credits`
   functions actually exist live. If they don't, the listing-limit enforcement and
   credit logic must be implemented (in the DB or the app) as part of Sessions 3–4,
   not assumed present.

## Stale files to remove
`supabase/migrations/0001_initial_schema.sql`, `0002_business_logic.sql`,
`0003_rls_policies.sql` — these describe a superseded schema and conflict with the
live DB. Confirm nothing depends on them, then delete to avoid future confusion.
(Note: this makes the Session-3 migration numbering collide — rename the new
Session 3–6 migrations to follow the live `0004_session2_auth` / `0005_rls_session2`,
i.e. start at `0006` and go up, OR use a clear naming like `sess3_listings.sql`.)
