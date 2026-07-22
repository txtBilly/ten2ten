-- Session 6 — Marketing & Admin
alter table profiles add column if not exists is_staff boolean not null default false;

create index if not exists idx_reports_status_created on reports (status, created_at desc);
create index if not exists idx_listings_status_created on listings (status, created_at desc);
