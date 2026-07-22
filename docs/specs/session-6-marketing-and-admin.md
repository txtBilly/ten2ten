# Ten2Ten — Session 6 Spec: Marketing Site & Admin Dashboard

> Hand to Claude Code. Final build session. Builds on Sessions 1–5. Two deliverables:
> the public marketing site (the front door for acquisition) and the internal admin
> dashboard (where support runs the trust-and-safety operations built in Session 5).
> Screens match the approved wireframe (v2).

---

## Problem statement

The product works end to end, but two things are missing for launch: a public
marketing site to acquire members (distinct from the app itself), and an internal
tool for support to actually review the reports, strikes, and bans whose backend
landed in Session 5. This session ships both and gets Ten2Ten launch-ready.

## Goals

1. A public, bilingual marketing site that explains the product, builds trust, and funnels visitors into signup / the cold-start intake.
2. An internal admin dashboard where authorized staff can work the report queue, moderate listings and members, issue refunds, and see the state of the platform.
3. The app is deployable to production on `ten2ten.app` with all env, webhooks, and domains wired.

## Non-goals
- The parked TikTok/glitch marketing visual treatment — **not in scope** (kept clean/white until the user revisits).
- Growth/referral mechanics beyond a basic waitlist — post-MVP.
- A full analytics suite — a minimal platform-stats panel only.

---

## Locked decisions
- **Marketing styling stays clean** (white, warm ink/gold), matching the app — the glitch direction is parked.
- **Cold-start intake remains the primary CTA** alongside signup — the marketing site funnels into both "find a place" (intake) and "list your apartment."
- **Admin is gated** to staff only (not a normal member surface).
- **Confirming a report from the admin UI uses the Session 5 moderation endpoint** (`/api/reports/[id]/review`) — this session is the UI, the logic already exists and is idempotent.

---

## Migration — `supabase/migrations/0009_admin.sql`

```sql
-- Minimal staff flag for admin access. (If you prefer Supabase custom claims /
-- a separate roles table, use that instead and skip this column.)
alter table profiles add column if not exists is_staff boolean not null default false;

-- Helpful indexes for the queues.
create index if not exists idx_reports_status_created on reports (status, created_at desc);
create index if not exists idx_listings_status_created on listings (status, created_at desc);
```

---

## Screens (approved wireframe)

| Screen | Route | Notes |
|---|---|---|
| Marketing landing | `/` (marketing) or a separate site | Hero ("Take your next apartment from the last person."), how-it-works (3 steps), trust section (background-checked), waitlist/early-access → intake, Join → signup. EN/ES. |
| Admin — report queue | `/admin` | Open reports with strike count; confirm+refund / dismiss / ban actions. |
| Admin — listings/users | `/admin/listings`, `/admin/users` | Moderate listings (hide/restore), look up users, manual ban, refund override. |

> Marketing routing: keep it under the same Next app for launch simplicity (a
> marketing group + the app). A separate marketing codebase is a post-launch option.

---

## Requirements

### Must-have (P0)

**Marketing site**
- [ ] Hero with the approved headline and a clear split CTA: "Find a place" (→ intake `/`) and "List your apartment" (→ `/list` or signup with intent=offering).
- [ ] How-it-works: 3 steps (find a place leaving soon → pay $100 to connect → meet & take it over).
- [ ] Trust section: every member background-checked; no broker fee; verified community. Links to Safety, Terms, Privacy (content already in `src/content/legal/`).
- [ ] Waitlist / early-access capture → writes an `intake_requests` row (reuse `/api/intake`) or a simple email capture.
- [ ] Bilingual EN/ES; clean white styling (no glitch treatment).
- [ ] SEO basics: title/description/OG (root layout already has metadata scaffolding).

**Admin dashboard**
- [ ] Access control: only `is_staff = true` profiles reach `/admin/*`; everyone else is redirected. Enforce in middleware + server checks (never client-only).
- [ ] Report queue: list `open` reports newest first, with reporter, target, reason, linked chat/listing, and the target's prior confirmed-strike count.
- [ ] Actions per report: **Confirm + refund**, **Dismiss**, **Ban** — all call the Session 5 `/api/reports/[id]/review` (and moderation lib), which already handles refund/strike/shadow-ban idempotently.
- [ ] Listings moderation: view/hide/restore listings (`suspended`/`removed`/`active`).
- [ ] User lookup: find a member, see standing (verification, strikes, shadow-ban, ratings), with manual ban / unban and a refund override (service-role).
- [ ] Minimal platform stats: counts of members, active listings, open reports, credits sold (nice-to-have panel).
- [ ] Every mutating admin action is server-side, authorized, and audit-logged (at least `reviewed_by` / timestamps already on `reports`; add a light audit note where useful).

**Deployment / launch wiring**
- [ ] Vercel project connected to `txtBilly/ten2ten`; all env vars set (Supabase, Stripe, Twilio, Resend, app URL, identity/background vendor keys or mock flags).
- [ ] Domain `ten2ten.app` attached; DNS updated.
- [ ] Stripe webhook → `https://ten2ten.app/api/stripe/webhook`; Twilio SMS webhook → `https://ten2ten.app/api/twilio/sms`; background vendor webhook wired.
- [ ] Scheduled deadline job (from Session 4) deployed and running.
- [ ] Legal pages (`/terms`, `/privacy`, `/safety`) render the `src/content/legal/` copy, and the identity-consent copy (incl. the automatic-disclosure line) is shown at verification and Connect.

### Nice-to-have (P1)
- [ ] Admin search/filter, pagination, and bulk actions.
- [ ] Concierge view of `intake_requests` for the cold-start matching workflow (surface new intakes, mark contacted/matched).
- [ ] Basic funnel analytics.

### Future (P2)
- [ ] Referral program.
- [ ] The parked glitch marketing treatment, if revived.
- [ ] Role-based admin permissions (tiers of staff).

---

## Acceptance criteria

- Given a visitor on the marketing site, when they choose "Find a place," then they land in the intake flow; "List your apartment" routes to listing/signup; "Join" routes to signup.
- Given a non-staff user, when they visit `/admin`, then they are redirected away and cannot call admin endpoints.
- Given a staff user on the report queue, when they Confirm+refund a seeker's report against a lister, then the Session 5 logic fires once (refund + strike; shadow-ban on the 2nd), reflected in the UI.
- Given a staff user, when they hide a listing, then it leaves browse and the lister sees it suspended.
- Given production deploy, when a seeker completes a $135 first purchase on `ten2ten.app`, then the Stripe webhook grants credits and the flow works end to end.

## Data touchpoints
- `profiles.is_staff` — admin gate.
- `reports`, `strikes`, `credit_ledger` — via Session 5 moderation endpoint.
- `listings` — moderation status changes.
- `intake_requests` — waitlist capture + concierge view.

## Suggested files
```
src/app/[locale]/(marketing)/page.tsx        # or a dedicated marketing route group
src/app/[locale]/(marketing)/how-it-works, /trust sections as needed
src/app/admin/layout.tsx                     # staff gate
src/app/admin/page.tsx                        # report queue
src/app/admin/listings/page.tsx
src/app/admin/users/page.tsx
src/app/api/admin/* (thin wrappers over moderation.ts, service-role, staff-checked)
src/middleware.ts                             # extend: protect /admin for staff only
```

## Open questions
- **[eng]** Marketing as a route group in the same app vs. a separate site — recommend same app for launch. Confirm.
- **[ops]** Who are the initial staff accounts? Set `is_staff = true` manually for them post-deploy.
- **[legal]** Final counsel sign-off on Terms/Privacy/Consent/Safety before taking real payments — the blocker for public launch, independent of code.

## Build order
1. Migration (`is_staff` + indexes). Run.
2. Admin gate (middleware + layout) and report queue wired to the Session 5 endpoint.
3. Listings moderation + user lookup + refund override.
4. Marketing site (hero, how-it-works, trust, waitlist, legal links), EN/ES.
5. Deployment wiring: Vercel, env, domain, webhooks, scheduled job.
6. End-to-end smoke test on `ten2ten.app` (signup → verify → list → browse → connect → chat → close → report → admin confirm).
7. i18n + a11y; `npm run build` green. Launch checklist complete.
```
```
