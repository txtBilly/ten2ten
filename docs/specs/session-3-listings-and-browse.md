# Ten2Ten — Session 3 Spec: Listings & Browse

> Hand to Claude Code. Builds on the live Session 1–2 app (Next.js 14, `src/` dir,
> Supabase auth + `profiles`, the unchanged scaffold schema in `supabase/schema.sql`).
> Run `npm run build` first to confirm green. This session replaces the `browse` and
> `list` placeholders with the real listing lifecycle, and cleans up the signup flow.
>
> Screens referenced here match the approved wireframe (v2). Business rules are the
> user's locked decisions — where the old netlify prototype disagrees, these win.

---

## Problem statement

Session 1–2 gave us accounts, identity, and a cold-start intake form. But there are
no listings yet — `browse` and `list` are placeholders. This session builds the
supply and discovery halves of the marketplace: a lister can post a fully-described
apartment, and a seeker can find it through search, filters, and favourites. This is
the inventory the paid Connect flow (Session 4) sits on top of.

## Goals

1. A lister can create, draft, publish, and manage a listing with all fields the browse filters can filter on.
2. A seeker can browse, search, and filter active listings, and favourite ones to be notified when they free up.
3. A seeker can open a listing detail that shows everything except the exact street address (revealed only in an open chat).
4. Signup and onboarding are merged into one screen (cleanup of the Session 2 two-step).
5. Everything is bilingual (EN/ES) and meets the accessibility floor.

## Non-goals

- The Connect/pay flow, credits, chat — **Session 4**.
- Reports, ratings, strikes — **Session 5**.
- Map-based browse — post-MVP (we store `geo` but list-view only for now).
- Admin moderation of listings — **Session 6**.

---

## Locked decisions (from user review)

- **`listing_type` is kept** and rendered as a **dropdown** on the create screen with five values: **Room, Studio, 1BR, 2BR, 3+BR**. It also drives the browse filter chips. (Migration adds `room` to the enum.)
- **A `description` free-text field** is added to listings.
- **Create-listing is grouped into sections**: Photos → Location → The apartment → Amenities → Terms → Contact. Not one flat list.
- **All amenities that Browse can filter on must be capturable on create**: laundry, pets_ok, elevator, walk-up, doorman, outdoor, no_fee (plus sqft, floor, zip, bedrooms-via-type, available date). No filter without a matching input.
- **Two required contact confirmations** before publish: "I have contacted this person and confirmed the apartment is available" and "I understand inaccurate details may get my listing removed."
- **Date pickers never allow past dates** (global rule): any date input (`available_from`, move-in filters, intake) has `min = today`.
- **Listing limits** (unchanged, already enforced by DB trigger): 1 active/negotiating at a time, max 3 published per rolling year, unlimited drafts.
- **Address privacy**: `neighborhood` + `cross_streets` + `zip` are public; `full_address` is revealed only inside an open chat (Session 4). Browse/detail must never render `full_address`.
- **Signup + onboarding merge**: one "Create your account" screen collects email, password, intent (looking/offering/both), full name, public first name, mobile, languages. The standalone `onboarding/page.tsx` is removed. **A required consent checkbox gates the Continue button** — Continue is disabled until the user checks "I agree to the Terms, Privacy Policy, and identity verification consent," and the consent (version + timestamp) is recorded.
- **Verification is role-based (changed from Session 2's assumption).** Identity verification is **lister-only**: a lister must pass a **government-ID check** (no selfie, no SSN, no credit check — a lister's credit score is irrelevant) before their first listing can publish. **Seekers do NOT verify at signup** — they are verified later, at Connect, via the background + credit check (Session 4). So after signup, a seeker lands on `/browse`; a lister is sent through the ID gate when they first go to list.
- **Selfie removed** everywhere — identity verification is government ID only.

---

## Migration — `supabase/migrations/0006_listings.sql`

```sql
-- Add "room" as the smallest listing type (single room rental)
alter type listing_type add value if not exists 'room' before 'studio';

-- Free-text description on listings
alter table listings add column if not exists description text;

-- Intent + soft-delete on profiles (from Session 2 spec; add if not present)
alter table profiles add column if not exists intent text
  check (intent in ('looking','offering','both'));
alter table profiles add column if not exists deleted_at timestamptz;

-- Consent record captured at signup (checkbox gate)
alter table profiles add column if not exists consent_version text;
alter table profiles add column if not exists consented_at timestamptz;

-- Keep the public summary free of soft-deleted rows
create or replace view public_profile_summary as
  select id, display_first_name, verification_status, rating_avg, rating_count, is_shadow_banned
  from profiles
  where deleted_at is null;
```

> Note: `alter type ... add value` cannot run inside a transaction block with other
> statements in some Postgres versions. If the migration fails, split the enum change
> into its own migration file run first.

---

## Screens (approved wireframe)

| Screen | Route | Notes |
|---|---|---|
| Create your account (merged) | `/signup` | Replaces signup + onboarding. Removes `/onboarding`. |
| Browse & search | `/browse` | Replaces placeholder. Search + type chips + Filters sheet + cards. |
| Listing detail | `/browse/[id]` | Photos, full description, everything but street address. Connect CTA (routes to Session 4). |
| Create / edit listing | `/list` | Grouped multi-section form. Draft autosave. Publish. |
| My listings | `/list/mine` | Active listing (status), drafts, per-year counter. |

---

## Requirements

### Must-have (P0)

**Signup/onboarding merge**
- [ ] `/signup` collects: email, password, intent (looking/offering/both), full_name, display_first_name, phone, spoken_languages. One submit.
- [ ] A **consent checkbox** ("I agree to the Terms, Privacy Policy, and identity verification consent," with links) gates submit: the Continue button is disabled until checked. On submit, record the consent version + timestamp on the profile (add `consent_version text`, `consented_at timestamptz` — include in the migration).
- [ ] On submit: create auth user + `profiles` row + `notification_prefs` defaults, set `intent`, route to **`/browse`** (seekers are not verified at signup).
- [ ] Delete `src/app/[locale]/onboarding/` and any links to it.
- [ ] Works with email confirmation OFF (already set in Supabase).

**Lister ID-verification gate**
- [ ] The existing `/verify` screen becomes **lister-only** and is reframed as "Verify your identity to list." Government ID only — remove the selfie step.
- [ ] A lister cannot **publish** a listing until `verification_status = 'verified'`. Entering the listing flow (`/list`) when unverified routes through `/verify` first; on success, continue to the listing form.
- [ ] Verified badge shows on the lister's listings.
- [ ] Do NOT collect SSN or run a credit check here — a lister's credit score is irrelevant. (SSN + credit is the seeker's Connect-time check, Session 4.)

**Create / edit listing (`/list`)**
- [ ] Sections in order: Photos, Location, The apartment, Amenities, Terms, Contact.
- [ ] Photos: upload to Supabase Storage → `listing_photos` (slots: bedroom, kitchen, bathroom required; extra optional). Block publish if the 3 required slots aren't filled.
- [ ] Location: `neighborhood`, `cross_streets`, `full_address` (labelled "shown only in chat"), `zip`. Derive/geocode `geo` from zip+cross streets if feasible; otherwise store null (list-view doesn't need it yet).
- [ ] The apartment: **type dropdown** (Room/Studio/1BR/2BR/3+BR → `listing_type`), `monthly_rent`, `floor`, `sqft`, `description` (textarea), `available_from` (date, min today).
- [ ] Amenities: toggles for `laundry`, `pets_ok`, `elevator`, walk-up, `doorman`, `outdoor`, `no_fee`. (Walk-up has no column yet — add `walk_up boolean default false` in this migration, or store in a `features text[]`. Add the column.)
- [ ] Terms: `min_credit_score`, `gratitude_amount` (labelled off-platform).
- [ ] Contact: `contact_name`, `contact_phone`, the two required confirmation checkboxes → `contact_confirmed = true` only when both checked.
- [ ] Draft autosave: save partial state to a `draft` listing continuously; unlimited drafts.
- [ ] Publish: transitions `draft → active`, sets `published_at`; the DB trigger enforces the 1-active / 3-per-year limits — surface those errors as friendly UI messages.
- [ ] Enforce the one-active rule in UI *before* the DB rejects it (show "You already have an active listing" state).

**Browse & search (`/browse`)**
- [ ] Lists `active` (and `negotiating`, shown as "in conversation") listings, newest first.
- [ ] Text search over neighborhood / zip / cross streets.
- [ ] Type filter chips: All, Room, Studio, 1BR, 2BR, 3+BR.
- [ ] **Filters sheet**: rent range, zip, amenities (the toggles above), move-in-by date (min today), pets. Applied server-side.
- [ ] Each card shows: photo, neighborhood, cross streets, rent, type, amenity icons (laundry, pets, move-in date), min credit score, verified badge, and a **favourite heart**.
- [ ] Card never shows `full_address`.
- [ ] Favourite heart toggles a `favourites` row (requires auth; prompt sign-in if not).

**Listing detail (`/browse/[id]`)**
- [ ] Shows photos, neighborhood + cross streets + zip, rent, type, floor, sqft, amenities, full `description`, available date, min credit score, gratitude (labelled off-platform), lister summary (first name, verified badge, rating, languages).
- [ ] Never shows `full_address`.
- [ ] "Connect — uses 1 credit" CTA → routes into the Session 4 flow (stub the target route for now).
- [ ] Favourite toggle here too.

**My listings (`/list/mine`)**
- [ ] Shows the active/negotiating listing with status + a link to its chat (Session 4 stub), draft listings (editable), and an "X of 3 this year" counter.

**Global**
- [ ] All date inputs floored to today (`min` attribute + server validation).
- [ ] New/changed strings added to `en.json` and `es.json`.
- [ ] Labels, focus-visible, `role="alert"` on errors.

### Nice-to-have (P1)
- [ ] Map toggle on browse (we already store `geo`).
- [ ] Photo reordering / captions.
- [ ] "Notify me" explicit opt-in on favourite (vs. implicit).

### Future (P2)
- [ ] Saved searches.
- [ ] Listing analytics for listers (views, favourites).

---

## Acceptance criteria

- Given a lister with no active listing, when they complete all sections (incl. 3 photos + both confirmations) and publish, then the listing becomes `active`, `published_at` is set, and it appears in browse.
- Given a lister who already has an active listing, when they try to publish a second, then the UI blocks it with a clear message and the DB trigger is never hit.
- Given a seeker on browse, when they set rent ≤ $2,500 + pets + Astoria, then only matching active listings show, and none display a street address.
- Given a seeker, when they tap the heart on a listing, then a `favourites` row is created and the heart reflects state on reload.
- Given any date field, when the user opens the picker, then dates before today are not selectable.
- Given a new user, when they finish the merged `/signup`, then a profile + notification_prefs exist and they land on `/browse` (no onboarding step, and seekers are not verified here).
- Given the signup screen, when the consent checkbox is unchecked, then Continue is disabled; when checked, Continue is enabled and submitting records `consent_version` + `consented_at`.
- Given an unverified lister, when they try to publish a listing, then they are routed through the government-ID `/verify` gate first and can only publish once `verification_status = 'verified'`.

---

## Data touchpoints

- `listings` — add `description`, `walk_up`. `type` now includes `room`.
- `listing_photos` — required-slot enforcement.
- `favourites` — heart toggles.
- `profiles` — `intent`, `deleted_at` added; merged signup writes the row.
- `public_profile_summary` — excludes soft-deleted.
- DB triggers `enforce_listing_limits` — already present; surface errors.

## Suggested files
```
src/app/[locale]/
  signup/page.tsx            # rebuilt: merged create-account
  onboarding/                # DELETE
  browse/page.tsx            # rebuilt: search + filters + cards
  browse/[id]/page.tsx       # new: listing detail
  list/page.tsx              # rebuilt: grouped create/edit form
  list/mine/page.tsx         # new: my listings
  api/listings/route.ts      # create/update/publish
  api/listings/[id]/route.ts # fetch/edit
  api/favourites/route.ts    # toggle
src/components/
  ListingCard.tsx  FiltersSheet.tsx  ListingForm/*  PhotoUploader.tsx
src/lib/listings.ts          # query helpers, filter builder
```

## Open questions
- **[product]** Geocoding on create — worth wiring now (for future map) or defer? Non-blocking; store null if deferred.
- **[product]** When a favourited listing goes `negotiating`, does it stay visible ("in conversation") or hide? Assume visible-but-locked. Confirm.

## Build order
1. Migration (enum + columns + consent columns + view). Run and verify.
2. Merged signup with consent-checkbox gate; delete onboarding; seekers route to `/browse`.
3. Reframe `/verify` as the lister-only government-ID gate (remove selfie); block publish until verified.
4. Create/edit listing form + photo upload + draft save + publish (with limit handling + verification gate).
5. Browse: cards + search + type chips, then the Filters sheet.
6. Listing detail + favourite toggle (both surfaces).
7. My listings.
8. i18n + a11y pass; `npm run build` green.
