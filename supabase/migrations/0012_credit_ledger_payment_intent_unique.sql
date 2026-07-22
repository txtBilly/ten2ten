-- Close the TOCTOU race in credits.grantPurchaseCredits(): a select-then-insert
-- check can't stop two concurrent webhook deliveries for the same payment from
-- both inserting. A unique constraint makes the DB the source of truth; the app
-- catches the conflict (23505) instead of pre-checking.
-- NULLs (consume/refund_report rows have no stripe_payment_intent) don't collide
-- with each other under a standard unique constraint, so this only constrains
-- actual purchase rows.
alter table credit_ledger
  add constraint credit_ledger_stripe_payment_intent_key unique (stripe_payment_intent);
