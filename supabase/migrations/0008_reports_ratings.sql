-- Session 5 — Reports, Strikes, Ratings & Notifications
alter type report_reason rename value 'incomplete' to 'something_else';

alter table reports add column if not exists refund_issued boolean not null default false;
alter table profiles add column if not exists is_suppressed boolean not null default false;
