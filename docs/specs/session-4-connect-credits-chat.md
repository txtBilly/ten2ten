# Ten2Ten — Session 4 Spec: Connect, Credits, Background Check & Chat

> Hand to Claude Code. Builds on Sessions 1–3. This is the revenue engine and the
> core marketplace interaction: paying to connect, the one-time background check,
> and the real-time conversation. Business rules here are locked — do not re-derive.
> Screens match the approved wireframe (v2).

---

## Problem statement

Listings exist and can be browsed (Session 3), but there's no way to actually reach a
lister. This session builds the paid Connect flow ($100 → 3 credits), the one-time
$35 third-party background/credit check gated before a seeker's first connection, and
the real-time chat where the two parties arrange the hand-off. This is where Ten2Ten
makes money and where the trust model becomes concrete.

## Goals

1. A seeker can pay $100 for 3 contact credits via Stripe, with credits tracked in the existing ledger.
2. Before a seeker's first connection, a one-time $35 background + credit check runs through a third-party vendor (this is the **seeker's** identity + credit verification — listers are verified separately by government ID in Session 3); the result is valid for 60 days and reused across connections in that window.
3. If the seeker's verified credit score is **below the listing's `min_credit_score`, they are hard-blocked** from connecting to that listing (listing-specific — their credits and verification remain valid for listings they do match).
4. Tapping Connect (with a credit, and meeting the min score) opens exactly one active chat, consumes one credit, locks the listing, and automatically discloses the seeker's verified identity to the lister.
5. Both parties chat in real time, see each other's full names and the exact address, and can close the chat.
6. The credit and chat state machines exactly follow the locked rules.

## Non-goals
- Reports / refunds-on-report processing — **Session 5** (the ledger event exists; the review flow that triggers it is Session 5).
- Ratings — **Session 5**.
- Admin tools — **Session 6**.

---

## Locked decisions (from user review)

**Credits**
- $100 → **3 credits**. No rollover in normal use.
- Opening a chat consumes 1 credit. **Only one active chat per seeker at a time** (DB partial-unique index already enforces this).
- Closing "didn't work out" **consumes** the credit (no refund).
- A credit returns to balance **only when a report is filed and support verifies it** (`refund_report`, +1) — handled in Session 5. Not automatic on close.
- Unused credits **never expire**.

**Background / credit check (this is the SEEKER's verification)**
- Listers are verified by government ID at listing time (Session 3). **Seekers are verified here, at Connect** — the background + credit check is their identity verification. There is no separate seeker ID step at signup.
- **$35 one-time fee**, charged **with the first $100 purchase** (first connection total = **$135**; subsequent connections = **$100**).
- Run by a **third-party vendor**; collects **legal name, DOB, SSN**.
- **SSN is passed to the vendor, never stored raw by Ten2Ten** (only `bg_check_vendor_ref` + derived `credit_score`, `has_criminal_record`, `has_eviction_history`). The Connect UI also states SSN and the full credit report are never shared with the lister.
- **Credit report valid for 60 days** (`bg_check_expires_at = now() + 60 days`). Within the window, no re-check, no re-charge. After it, a new $35 check is required to connect.
- **First-timer expectation-setting**: because the score isn't known until the check runs, the Connect screen must state up front: *"If your score is below a listing's minimum, you won't be able to connect there."*

**Credit-score minimum — hard block**
- A seeker whose verified `credit_score` is **below the listing's `min_credit_score`** is **blocked from connecting to that listing** (this resolves the earlier open question — it is a hard block, not warn-and-allow).
- The block is **listing-specific**: the seeker's credits and background check remain valid for other listings they match.
- **Returning seeker** (score already known, valid check): the block is shown **before** any payment or credit use, when they tap Connect.
- **First-time seeker** (score unknown until the check): they pay the $35 check as part of the first Connect; if the returned score is below this listing's minimum, they hit the block screen. Their 3 credits and the check remain valid for matching listings. No credit is consumed on a blocked attempt.

**Automatic disclosure on Connect**
- The moment the chat opens, the **seeker's verified full name + credit band + background-check status are automatically shared with the lister** — no separate "share" step, no lister approval gate. Tapping Connect *is* the consent.
- The seeker sees the **lister's full name** and the **exact address** once the chat is open.
- **Connect-screen copy must make this explicit**, e.g.: *"Connecting shares your verified name and credit band with the lister."* The identity-consent doc must cover it.

**Chat**
- Messages are **immutable** (no edit, no delete) — schema already enforces (no update/delete policy).
- Chat has a **safety disclaimer auto-injected** at the top when it opens.
- Seeker has **24h to send the first message** or the chat auto-frees (`first_message_deadline`, already in schema).
- **Lister may request close after 3 days** if it stalls; the seeker gets **24h to confirm** or the listing auto-frees (`lister_close_requested_at`).
- Close reasons drive `chat_status`: `closed_success`, `closed_didnt_work`, `closed_reported`.

---

## Migration — `supabase/migrations/0007_connect_chat.sql`

```sql
-- Automatic disclosure on Connect makes the manual "share" flags obsolete.
alter table chats drop column if exists seeker_shared_profile;
alter table chats drop column if exists lister_shared_profile;

-- Background check validity is 60 days (business rule). No column change needed —
-- app sets bg_check_expires_at = now() + interval '60 days'. Documented here.

-- Optional: snapshot the disclosed identity on the chat at open time, so the
-- lister's view is stable even if the profile later changes.
alter table chats add column if not exists disclosed_seeker_name text;
alter table chats add column if not exists disclosed_credit_score int;
alter table chats add column if not exists disclosed_bg_status text
  check (disclosed_bg_status in ('pass','review','none'));
```

---

## Screens (approved wireframe)

| Screen | Route | Notes |
|---|---|---|
| Connect (bid + verify + pay) | `/browse/[id]/connect` | Plain "$100 = 3 credits" text (not boxed). First-time: verification block (legal name, DOB, SSN, $35) + card fields (number, exp, CVC), total $135, explicit disclosure copy ("shares your verified name and credit band… SSN and full credit report never shared"), and the first-timer min-score warning. Returning: $100, no verification block. |
| Below-minimum block | `/browse/[id]/connect` (blocked state) | Amber (not error). Shows seeker's score vs. listing's minimum, "nothing charged / no credit used," CTAs to matching listings or back. |
| Chat (seeker & lister) | `/chats/[id]` | Full names, address visible, safety banner, message list, **prominent Close chat**, **Send button**. No "share profile" action. |
| Close chat | `/chats/[id]/close` | "How did it go?" → got it / didn't work out → rate (Session 5). "unresponsive/misleading" phrase removed; the "'Didn't work out' uses the credit" line was moved off the Connect screen. |
| Credits balance | `/account/credits` | Balance, ledger history (purchase / consume / refund), "Buy 3 more — $100". |

---

## Requirements

### Must-have (P0)

**Purchase & credits**
- [ ] Stripe Checkout for the contact bundle (reuse `src/lib/stripe.ts`). First purchase includes the $35 line (`includeBgCheck`); later purchases are $100 only.
- [ ] Webhook (`api/stripe/webhook`) grants 3 credits on `checkout.session.completed` (idempotent by payment intent — already built in `credits.ts`).
- [ ] Credits balance + history screen reads `credit_ledger` / `seeker_credit_balance`.
- [ ] Determine "first connection" by absence of a valid, unexpired `bg_check_completed_at`.

**Background check**
- [ ] Verification block appears only when the seeker has no valid (≤60-day) check.
- [ ] Collect legal name, DOB, SSN; pass to the identity/background vendor via the existing `identity/` interface (extend it or add a `background/` sibling). Mock provider for dev.
- [ ] On success: store `bg_check_vendor_ref`, `credit_score`, `has_criminal_record`, `has_eviction_history`, `bg_check_completed_at = now()`, `bg_check_expires_at = now() + 60 days`. **Never store SSN.**
- [ ] Gate: a seeker cannot open a chat until a valid (≤60-day) background check exists (this check *is* the seeker's verification — no separate signup ID step).
- [ ] **Min-score hard block**: compare the seeker's `credit_score` against the listing's `min_credit_score`. If below, render the block screen and prevent chat creation. Returning seekers (known score) see it before payment; first-timers see it after the check runs. **Never consume a credit or open a chat on a blocked attempt.**

**Connect → open chat (atomic)**
- [ ] On Connect with an available credit: in one transaction — insert `chats` row (`active`), consume 1 credit (`credits.consumeCredit`), link `credit_ledger_id`, set listing `negotiating`, snapshot `disclosed_*` fields.
- [ ] Enforce one-active-chat: if the seeker already has an active chat, block with a clear message (DB index is the backstop).
- [ ] Connect screen shows the explicit disclosure copy before the pay/confirm action.

**Chat**
- [ ] Real-time via Supabase Realtime on `messages`.
- [ ] Header shows the other party's **full name** + verified badge; the seeker also sees the **exact address** (from `full_address`); the lister sees the seeker's **credit band + bg status** (from `disclosed_*`).
- [ ] Safety disclaimer auto-injected as the first thing in the thread.
- [ ] Composer with a **Send button**; messages are append-only.
- [ ] **Prominent Close chat** control.
- [ ] 24h first-message deadline enforced (auto-free if the seeker never messages).
- [ ] Lister "request close after 3 days" → seeker 24h confirm → else auto-free. A scheduled job / edge function checks deadlines (document the cron approach).

**Close**
- [ ] "How did it go?" → `closed_success` or `closed_didnt_work`; both consume the credit (no refund here). Frees the listing (`active` again unless success).
- [ ] Routes to rating (Session 5 stub).
- [ ] Copy: *'"Didn't work out" uses this credit and lets you open your next one. Report instead — that refunds your credit.'*

**Global / a11y / i18n** — as prior sessions.

### Nice-to-have (P1)
- [ ] Typing indicators / read receipts.
- [ ] Push notifications on new message (prefs already modeled).
- [ ] Downloadable background report share link for the seeker (`bg_report_share_url`).

### Future (P2)
- [ ] In-chat scheduling / calendar.
- [ ] Real background vendor (TransUnion SmartMove) swapped for the mock.

---

## Acceptance criteria

- Given a first-time seeker with 0 credits, when they complete verification + pay $135, then they receive 3 credits, a 60-day background check is recorded, and a chat opens (1 credit consumed).
- Given a returning seeker with a valid check and ≥1 credit, when they Connect, then they pay nothing extra, a chat opens, and 1 credit is consumed.
- Given a seeker with an active chat, when they try to Connect elsewhere, then it's blocked until they close the current chat.
- Given a chat opens, when the lister views it, then they see the seeker's full name, credit band, and bg status — with no separate share step — and the seeker sees the lister's name and exact address.
- Given a seeker closes "didn't work out," then the credit stays consumed and the listing returns to active.
- Given a seeker never sends a first message within 24h, then the chat auto-closes and the listing frees.
- Given a background check older than 60 days, when the seeker tries to Connect, then a new $35 check is required first.
- Given a returning seeker whose score is below a listing's minimum, when they tap Connect, then they see the below-minimum block before any charge, no credit is used, and their credits stay valid for other listings.
- Given a first-time seeker whose returned score is below the listing's minimum, when the check completes, then they see the block screen, no chat opens, no credit is consumed, and their 3 credits + check remain valid for matching listings.

## Data touchpoints
- `credit_ledger` / `seeker_credit_balance` — purchase, consume; refund is Session 5.
- `chats` — drop share flags; add `disclosed_*`; state machine + deadlines.
- `messages` — realtime, immutable.
- `profiles` — bg check fields, 60-day expiry, `credit_score`.
- `listings` — status flips active ↔ negotiating.

## Suggested files
```
src/app/[locale]/browse/[id]/connect/page.tsx
src/app/[locale]/chats/[id]/page.tsx
src/app/[locale]/chats/[id]/close/page.tsx
src/app/[locale]/account/credits/page.tsx
src/app/api/connect/route.ts          # atomic open-chat + consume credit
src/app/api/checkout/route.ts         # create Stripe session ($135 / $100)
src/app/api/background/start/route.ts  # kick off vendor check
src/app/api/background/webhook/route.ts
src/app/api/chats/[id]/messages/route.ts
src/app/api/chats/[id]/close/route.ts
src/lib/background/{index.ts,mock.ts}  # vendor interface + mock
supabase/functions/chat-deadlines/    # scheduled: 24h + 3-day + confirm windows
```

## Open questions
- **[legal]** Final identity-consent copy must state the automatic disclosure. Placeholder covers it; counsel to finalize.
- **[eng]** Scheduled deadline checks: Supabase cron / edge function vs. external scheduler. Pick and document.

## Build order
1. Migration. Run.
2. Credits balance/history screen from the existing ledger.
3. Checkout ($135 first / $100 returning) + webhook credit granting (verify idempotency).
4. Background check: interface + mock + start/webhook + profile writes + 60-day expiry + gates.
5. Connect endpoint: atomic open-chat + consume + snapshot disclosure; Connect screen with explicit copy + first-timer min-score warning; **min-score hard-block screen** (returning + first-time paths, no credit consumed).
6. Chat: realtime messages, header disclosure, safety banner, Send, Close.
7. Deadlines job (24h first-message, 3-day lister close, 24h confirm).
8. Close flow → rating stub.
9. i18n + a11y; `npm run build` green.
