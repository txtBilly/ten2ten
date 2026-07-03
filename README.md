# Ten2Ten

Tenant-to-tenant apartment marketplace. NYC. No brokers, no fees — just $100 to connect with the person leaving the place you want.

**Market:** US / NYC · **Languages:** English, Spanish · **Stack:** Next.js 14, Supabase, Stripe, Twilio, Resend.

---

## The business model (locked)

- Browsing is free; favouriting is free.
- A seeker pays **$100 → 3 contact credits**. Each credit opens one chat with one lister.
- Only **1 active chat at a time** — close the current one to open the next.
- **"Didn't work out" consumes the credit.** A confirmed report against the lister refunds it.
- **Unused credits never expire.**
- A lister may have **1 active listing**, max **3 per rolling year**, unlimited drafts.
- A lister-initiated close requires seeker confirmation within 24h, or the listing auto-frees after the **3-day** window.
- The thank-you ("Gratitude") to the lister is paid **off-platform**; Ten2Ten neither facilitates nor verifies it.

## Cold-start launch strategy

Instead of opening an empty browse page, the homepage is an **intake form**: seekers describe what they want, we match the first members by hand, and notify them by SMS. This avoids the "empty playground" problem. The intake also works over inbound SMS (Twilio webhook).

---

## Project layout

```
ten2ten/
├── src/
│   ├── middleware.ts            # locale routing (must live in src/ with the app dir)
│   ├── app/
│   │   ├── layout.tsx           # root metadata
│   │   ├── globals.css
│   │   ├── [locale]/
│   │   │   ├── layout.tsx       # sets <html lang>
│   │   │   ├── page.tsx         # cold-start homepage + intake
│   │   │   ├── browse/          # placeholder (Session 3)
│   │   │   ├── list/            # placeholder (Session 3)
│   │   │   └── account/         # placeholder (Session 2)
│   │   └── api/
│   │       ├── intake/          # POST intake submissions
│   │       ├── stripe/webhook/  # grants credits on payment
│   │       └── twilio/sms/      # inbound SMS intake
│   ├── components/IntakeForm.tsx
│   ├── lib/
│   │   ├── supabase/{client,server}.ts
│   │   ├── credits.ts           # the credit ledger logic
│   │   ├── stripe.ts
│   │   ├── twilio.ts            # SMS + email (Resend)
│   │   └── cn.ts
│   └── i18n/{config.ts,en.json,es.json}
└── supabase/
    ├── schema.sql               # run first
    └── rls-policies.sql         # run second
```

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Database

In your Supabase project (SQL Editor), run in order:
1. `supabase/schema.sql`
2. `supabase/rls-policies.sql`

Enable the `postgis` extension if the schema step doesn't (Database → Extensions → postgis).

### 3. Environment

Copy `.env.example` to `.env.local` and fill it in.

**Supabase keys** (Settings → API Keys in the dashboard):
- New-style keys: copy the **Publishable key** (`sb_publishable_…`) into `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and the **Secret key** (`sb_secret_…`) into `SUPABASE_SERVICE_ROLE_KEY`.
- Or legacy keys (deprecated, valid through 2026): `anon` and `service_role` from the Legacy API Keys tab.

Both work with this code — the new keys are drop-in replacements for the old ones.

### 4. Run

```bash
npm run dev      # http://localhost:3000  (redirects to /en)
npm run build    # production build
npm run typecheck
```

---

## What works today

- Bilingual (EN/ES) homepage with locale auto-detection and `/` → `/en` redirect.
- Working intake form → `/api/intake` → saves to `intake_requests` → sends Twilio confirmation SMS.
- Inbound SMS intake webhook (point your Twilio number's "A message comes in" to `/api/twilio/sms`).
- Full database schema + RLS for the entire product (listings, bids/chats, credits, reports, strikes, ratings).
- Stripe webhook scaffolding (idempotent credit granting) — wired but inactive until the bid flow ships.

## What's next (later sessions)

2. Auth (sign up as seeker/lister, KYC verification screens, profile, account deletion)
3. Listing creation + browse/search
4. Bid flow ($100 → 3 credits) + real-time chat
5. Reports/strikes + notifications
6. Marketing site + admin dashboard

---

## Deploy (Vercel)

1. Connect the `txtBilly/ten2ten` GitHub repo to a new Vercel project (auto-detects Next.js).
2. Add all `.env.example` variables under Settings → Environment Variables.
3. Add the domain `ten2ten.app` under Settings → Domains, then update DNS.
4. Set the Stripe webhook endpoint to `https://ten2ten.app/api/stripe/webhook` and the Twilio SMS webhook to `https://ten2ten.app/api/twilio/sms`.

> Note: `next@14.2.x` is pinned. The `supabase` CLI is not a project dependency — use `npx supabase` if you need it locally.
