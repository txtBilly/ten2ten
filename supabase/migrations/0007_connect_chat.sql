-- Session 4 — Connect, Credits, Background Check & Chat
alter table chats drop column if exists seeker_shared_profile;
alter table chats drop column if exists lister_shared_profile;

-- Snapshot disclosed identity at chat-open (automatic disclosure on Connect)
alter table chats add column if not exists disclosed_seeker_name text;
alter table chats add column if not exists disclosed_credit_score int;
alter table chats add column if not exists disclosed_bg_status text
  check (disclosed_bg_status in ('pass','review','none'));

-- Background check validity is 60 days (set in app when writing bg_check_expires_at).
