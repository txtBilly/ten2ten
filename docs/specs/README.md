# Ten2Ten — Build Specs (Sessions 3–6)

Handoff specs for Claude Code, written against the **live Session 1–2 build** and the
**approved wireframe (v2)**. Sessions 1–2 (auth, identity, profile, account) are done.

## Order

1. **[Session 3 — Listings & Browse](session-3-listings-and-browse.md)** — create/edit/publish listings, browse with search + filters + favourites, listing detail, and the signup/onboarding merge. Migration: `0006_listings.sql`.
2. **[Session 4 — Connect, Credits & Chat](session-4-connect-credits-chat.md)** — $100→3 credits, the $35 / 60-day background check, atomic Connect (auto-disclosure), real-time chat, close flow. Migration: `0007_connect_chat.sql`.
3. **[Session 5 — Reports, Ratings & Notifications](session-5-reports-ratings-notifications.md)** — reporting, strikes/shadow-ban, verified-report credit refunds, ratings, notification dispatch. Migration: `0008_reports_ratings.sql`.
4. **[Session 6 — Marketing & Admin](session-6-marketing-and-admin.md)** — public marketing site, internal admin dashboard, production deploy to `ten2ten.app`. Migration: `0009_admin.sql`.

## Locked business rules (apply across all sessions)

- **Credits**: $100 → 3 credits, one active chat at a time, "didn't work out" consumes the credit, unused credits never expire.
- **Refund**: a credit returns **only** when a report is filed **and support confirms it** (`refund_report`). Not automatic on close.
- **Verification is role-based**: **listers** verify with a government ID (no selfie, no SSN, no credit check) before publishing a listing; **seekers** are verified at Connect via the background + credit check (name, DOB, SSN, credit). No seeker ID step at signup. Selfie removed everywhere.
- **Background check**: $35 one-time (first connection → $135 total; later → $100), third-party vendor, **SSN never stored raw**, report **valid 60 days**.
- **Credit-score minimum is a hard block**: a seeker below a listing's `min_credit_score` cannot connect to that listing (listing-specific; credits + check stay valid elsewhere; no credit consumed on a blocked attempt).
- **Signup consent**: a required checkbox gates the Continue button; the consent version + timestamp are recorded.
- **Automatic disclosure on Connect**: tapping Connect shares the seeker's verified full name + credit band + bg status with the lister — no separate share step. Copy states SSN and the full credit report are never shared. Both parties see full names; seeker sees exact address once the chat is open.
- **Listing limits**: 1 active at a time, 3 per rolling year, unlimited drafts.
- **`listing_type`**: dropdown of Room / Studio / 1BR / 2BR / 3+BR; also the browse filter.
- **Dates**: no past dates anywhere (min = today).
- **Immutability**: messages and chats are never edited or deleted, and survive account deletion.

## Migrations

Run in order from `supabase/migrations/`: `0006` → `0007` → `0008` → `0009` (live DB already has 0001–0005).
If a `alter type ... add value` fails inside a transaction, run that statement alone first.

## Still open (non-blocking unless noted)

- "Two confirmed bad ratings": auto-count (≤2★) vs. support-confirmed. Recommend ratings advisory, reports carry hard consequences.
- Scheduled deadline job host (Supabase cron vs. external).
- **Legal sign-off on Terms/Privacy/Consent/Safety before taking real payments — the launch blocker, independent of code.**
