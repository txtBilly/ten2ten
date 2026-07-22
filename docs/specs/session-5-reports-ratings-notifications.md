# Ten2Ten — Session 5 Spec: Reports, Strikes, Ratings & Notifications

> Hand to Claude Code. Builds on Sessions 1–4. This session is the trust-and-safety
> layer that keeps the community honest and closes the credit-refund loop opened in
> Session 4. Screens match the approved wireframe (v2).

---

## Problem statement

The marketplace loop works end to end after Session 4, but there's nothing keeping
members honest: no way to report a bad actor, no consequence for one, no reputation
signal, and the "confirmed report refunds your credit" promise has no mechanism
behind it. This session builds reporting, the strike/shadow-ban system, post-chat
ratings, and the notification dispatch that ties the whole product together.

## Goals

1. A member can report a listing or the other party in a chat, choosing a reason.
2. Support can review reports; confirming one triggers consequences: a strike, credit refund to the affected seeker, and (on the second confirmed report) shadow-ban + listing removal.
3. Both parties can rate each other after a chat closes; ratings roll up to profile reputation.
4. Members receive the notifications the product promises (contact accepted, new message, listing freed, chat expiring) on their chosen channels.

## Non-goals
- The admin *dashboard UI* for reviewing reports — **Session 6** (this session builds the report data flow + the server actions that confirm/dismiss; Session 6 gives support a screen).
- Real push infrastructure (FCM/APNs) — P1; email + SMS are the launch channels.

---

## Locked decisions (from user review)

- **Report screen copy**: headline/intro is *"Ten2Ten community is built on trust and safety. Tell us more. We got you."* (The old "What went wrong? Confirmed reports refund your credit." line is removed.)
- **Report reasons**: Unresponsive, Apartment unavailable, Inaccurate listing, Fraudulent / scam, **Something else**. (The `incomplete` enum value is renamed to `something_else`.)
- **Credit refund is only on a *verified* (confirmed) report** — not on plain "didn't work out." Confirming a report against the lister posts a `refund_report` (+1) to the reporting seeker's ledger.
- **Two confirmed reports from different members** → shadow ban + listing hidden/removed (existing rule; DB has `strikes`, `is_shadow_banned`).
- **Ratings**: post-chat, both directions; two confirmed bad ratings → profile suppression (existing rule).
- **Messages/chats are never deleted** — reporting references them but never removes them.

---

## Migration — `supabase/migrations/0008_reports_ratings.sql`

```sql
-- Rename the report reason to match the new UI option.
alter type report_reason rename value 'incomplete' to 'something_else';

-- Track that a refund was issued for a confirmed report (idempotency + audit).
alter table reports add column if not exists refund_issued boolean not null default false;

-- Suppression flag driven by bad ratings (distinct from report-driven shadow ban).
alter table profiles add column if not exists is_suppressed boolean not null default false;
```

---

## Screens (approved wireframe)

| Screen | Route | Notes |
|---|---|---|
| Report a member/listing | `/chats/[id]/report` (and from listing detail) | New intro copy; 5 reasons incl. "Something else"; details textarea; submit. |
| Rate & review | `/chats/[id]/rate` | Stars + optional note; both sides; "two confirmed bad reports lead to removal" fine print. |
| Notification prefs | `/account/notifications` | Already built in Session 2 — this session wires the actual dispatch to those prefs. |

---

## Requirements

### Must-have (P0)

**Reporting**
- [ ] Report entry points: the flag icon in a chat header, and the listing detail.
- [ ] Screen shows the new intro copy and the 5 reasons; one reason selectable; details textarea; submit creates a `reports` row (`open`) linked to reporter, reported_user, listing, and chat as applicable.
- [ ] A seeker reporting from a chat can trigger the refund path on confirmation (below).

**Review → consequences (server-side; UI in Session 6)**
- [ ] A confirm action (support/service-role) sets `reports.status = 'confirmed'`, `reviewed_by`, `reviewed_at`.
- [ ] On confirm against a **lister** where the reporter is the chat's **seeker**: post `refund_report` (+1) to the seeker's ledger via `credits.refundCreditForReport` (idempotent; set `reports.refund_issued = true`). Also set the chat `closed_reported` if still open.
- [ ] On confirm: create a `strikes` row (number = count of prior confirmed strikes + 1). First strike → 7-day suspension (`reactivates_at`), status messaging. **Second** confirmed report from a **different** reporter → `is_shadow_banned = true` + hide/remove the offending listing (`status = 'suspended'`/`removed`).
- [ ] Dismiss action sets `status = 'dismissed'` with no consequence.
- [ ] All consequence writes run service-role (bypass RLS) and are idempotent.

**Ratings**
- [ ] After a chat closes (`closed_success` / `closed_didnt_work`), prompt both parties to rate.
- [ ] `ratings` insert (1–5 + optional body), unique per (chat, rater) — schema enforces. Trigger already recomputes `rating_avg` / `rating_count`.
- [ ] Two confirmed bad ratings (define "bad" = ≤2 stars; "confirmed" per support or a threshold rule — see open question) → `is_suppressed = true`; suppressed profiles rank lower / are hidden from browse lister display.
- [ ] Public ratings visible on profile summaries.

**Notifications (dispatch wiring)**
- [ ] Wire real events to `notification_prefs` channels using `src/lib/twilio.ts` (SMS + Resend email):
  - Contact accepted (chat opened) → `bid_accepted`
  - New message → `chat_message`
  - Listing freed up (a favourited listing returns to active) → `listing_freed`
  - Chat expiring soon (approaching 24h / 3-day deadlines) → `expiry_warn`
- [ ] Respect each user's per-event channel array; skip channels not chosen; always allow transactional/safety messages.
- [ ] Push channel: if not building real push now, no-op it and note P1.

**Global / a11y / i18n** — as prior sessions; add all new strings to en/es.

### Nice-to-have (P1)
- [ ] Real push (FCM/APNs).
- [ ] Reporter feedback ("we reviewed your report") notification.
- [ ] Rate-limit / abuse protection on reporting.

### Future (P2)
- [ ] ML/heuristic fraud signals feeding the review queue.
- [ ] Appeals flow for shadow-banned members.

---

## Acceptance criteria

- Given a seeker in a chat, when they submit a report with a reason, then a `reports` row is created as `open` and support can see it (Session 6).
- Given a confirmed report by a seeker against a lister, when support confirms it, then the seeker's ledger gets +1 (`refund_report`, once), `refund_issued` is true, and a strike is recorded.
- Given a member with one prior confirmed report from member A, when a second confirmed report from member B lands, then `is_shadow_banned` becomes true and their active listing is hidden.
- Given a dismissed report, when processed, then no strike, no refund, no ban.
- Given a closed chat, when both parties rate, then each rating is stored once and the profiles' `rating_avg`/`rating_count` update.
- Given a user who opted contact-accepted → SMS+Email, when their chat opens, then they get an SMS and an email and no push.

## Data touchpoints
- `reports` (+ `refund_issued`), `strikes`, `profiles` (`is_shadow_banned`, `is_suppressed`).
- `credit_ledger` — `refund_report` via existing helper.
- `ratings` — insert; trigger recomputes aggregates.
- `notification_prefs` — read for dispatch; `favourites` — for listing-freed.

## Suggested files
```
src/app/[locale]/chats/[id]/report/page.tsx
src/app/[locale]/chats/[id]/rate/page.tsx
src/app/api/reports/route.ts            # file a report
src/app/api/reports/[id]/review/route.ts # confirm/dismiss (service-role) — used by Session 6 UI
src/app/api/ratings/route.ts
src/lib/moderation.ts                   # confirm→strike/refund/ban logic (idempotent)
src/lib/notify.ts                       # event→prefs→channel dispatch
```

## Open questions
- **[product]** "Two confirmed bad ratings" — is a bad rating auto-counted (≤2 stars) or does it require support confirmation like reports? Recommend: ratings are advisory (auto-aggregate), and only *reports* carry hard consequences. Confirm.
- **[product]** When a shadow-banned member has an active chat, does it close immediately or run its course? Recommend close + refund the counterparty seeker's credit. Confirm.
- **[eng]** Listing-freed notification fan-out could be large; batch/queue it. Document approach.

## Build order
1. Migration (enum rename + columns). Run.
2. Report screen + file-report endpoint.
3. Moderation logic (`moderation.ts`): confirm → refund + strike + ban; dismiss. Idempotent, service-role. (UI to trigger comes in Session 6; expose the endpoint now.)
4. Ratings screen + endpoint + suppression rule.
5. Notification dispatch wiring to prefs for the four events.
6. i18n + a11y; `npm run build` green.
