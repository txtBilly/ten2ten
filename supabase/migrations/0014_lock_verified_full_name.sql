-- Lock the seeker's legal name once identity is verified.
--
-- On a background-check pass, /api/background/start writes the vendor-verified
-- legal name into profiles.full_name. From that point the seeker must not be
-- able to change it (the disabled field in the account UI is convenience only;
-- the client could still issue a direct update). This trigger is the real
-- enforcement: any update that tries to change full_name while the profile is
-- already verified is silently reverted to the stored value.
--
-- The pass path itself is exempt: it advances bg_check_completed_at in the same
-- update (and on the very first verification the old value is null), so a
-- legitimate (re)verification can still set the name.

create or replace function lock_verified_full_name()
returns trigger
language plpgsql
as $$
begin
  if old.bg_check_completed_at is not null
     and new.full_name is distinct from old.full_name
     and new.bg_check_completed_at is not distinct from old.bg_check_completed_at
  then
    new.full_name := old.full_name;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lock_verified_full_name on profiles;
create trigger trg_lock_verified_full_name
  before update on profiles
  for each row
  execute function lock_verified_full_name();
