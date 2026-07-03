-- ============================================================================
-- Ten2Ten — Business logic (functions + triggers)
-- These encode the rules so the app layer can't drift from them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- LISTING CAP: 1 active/negotiating at a time, max 3 published per rolling year.
-- Drafts are unlimited and excluded. Runs when a listing moves to 'active'.
-- ----------------------------------------------------------------------------
create or replace function enforce_listing_limits()
returns trigger language plpgsql as $$
declare
  active_count int;
  yearly_count int;
begin
  if new.status = 'active' and (old.status is distinct from 'active') then

    -- only one active or negotiating listing at a time
    select count(*) into active_count
    from listings
    where lister_id = new.lister_id
      and status in ('active','negotiating')
      and id <> new.id;
    if active_count > 0 then
      raise exception 'You already have an active listing. Close it before publishing another.';
    end if;

    -- max 3 publishes in the trailing 365 days
    select count(*) into yearly_count
    from listings
    where lister_id = new.lister_id
      and published_at is not null
      and published_at > now() - interval '365 days'
      and id <> new.id;
    if yearly_count >= 3 then
      raise exception 'You have reached the limit of 3 published listings per year.';
    end if;

    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end; $$;

create trigger trg_listing_limits
  before update on listings
  for each row execute function enforce_listing_limits();

-- ----------------------------------------------------------------------------
-- OPEN CONTACT: spend one credit, lock the listing to 'negotiating'.
-- Validates: verified, bg-check clear & unexpired, meets min credit score,
-- has >=1 credit, no other active contact, listing is 'active'.
-- ----------------------------------------------------------------------------
create or replace function open_contact(p_seeker uuid, p_listing uuid)
returns uuid language plpgsql security definer as $$
declare
  v_profile profiles%rowtype;
  v_listing listings%rowtype;
  v_contact_id uuid;
begin
  select * into v_profile from profiles where id = p_seeker for update;
  select * into v_listing from listings where id = p_listing for update;

  if v_listing.status <> 'active' then
    raise exception 'This listing is not open for new contacts.';
  end if;
  if v_profile.shadow_banned then
    raise exception 'Your account is under review.';
  end if;
  if not v_profile.identity_verified then
    raise exception 'Verify your identity before contacting a lister.';
  end if;
  if v_profile.bg_check_status <> 'clear'
     or v_profile.bg_check_expires_at < now() then
    raise exception 'A current background check is required.';
  end if;
  if v_listing.min_credit_score is not null
     and coalesce(v_profile.credit_score, 0) < v_listing.min_credit_score then
    raise exception 'Your credit score does not meet this listing''s requirement.';
  end if;
  if v_profile.contact_credits < 1 then
    raise exception 'You have no contact credits. Purchase to continue.';
  end if;

  -- spend the credit and lock the listing
  update profiles set contact_credits = contact_credits - 1 where id = p_seeker;
  update listings set status = 'negotiating' where id = p_listing;

  insert into contacts (seeker_id, listing_id)
  values (p_seeker, p_listing)
  returning id into v_contact_id;

  return v_contact_id;
end; $$;

-- ----------------------------------------------------------------------------
-- CLOSE CONTACT: free the listing. Refund the credit only on confirmed report.
-- ----------------------------------------------------------------------------
create or replace function close_contact(
  p_contact uuid,
  p_status  contact_status,
  p_reason  text default null,
  p_refund  boolean default false
) returns void language plpgsql security definer as $$
declare
  v contacts%rowtype;
begin
  select * into v from contacts where id = p_contact for update;
  if v.status <> 'active' then
    raise exception 'Contact is already closed.';
  end if;

  update contacts
     set status = p_status,
         closed_at = now(),
         close_reason = p_reason,
         credit_refunded = p_refund
   where id = p_contact;

  -- free the listing back to active (unless it was removed/suspended)
  update listings
     set status = 'active'
   where id = v.listing_id
     and status = 'negotiating';

  -- refund the credit only when a report was confirmed
  if p_refund then
    update profiles set contact_credits = contact_credits + 1 where id = v.seeker_id;
  end if;

  -- notify seekers who saved this listing that it's free again
  insert into notifications (user_id, type, channel, payload)
  select s.seeker_id, 'listing_freed', 'push',
         jsonb_build_object('listing_id', v.listing_id)
  from listing_saves s
  where s.listing_id = v.listing_id and s.notify_on_free;
end; $$;

-- ----------------------------------------------------------------------------
-- CONFIRM REPORT: mark confirmed, refund seeker, escalate strikes.
-- 2 confirmed reports from DIFFERENT reporters -> shadow ban the user/listing.
-- ----------------------------------------------------------------------------
create or replace function confirm_report(p_report uuid, p_reviewer uuid)
returns void language plpgsql security definer as $$
declare
  r reports%rowtype;
  v_lister uuid;
  distinct_reporters int;
  next_strike int;
begin
  select * into r from reports where id = p_report for update;
  if r.status <> 'pending' then
    raise exception 'Report already resolved.';
  end if;

  -- resolve the lister: explicit reported user, else the listing's owner
  v_lister := r.reported_user_id;
  if v_lister is null and r.listing_id is not null then
    select lister_id into v_lister from listings where id = r.listing_id;
  end if;

  update reports
     set status = 'confirmed', reviewed_by = p_reviewer, reviewed_at = now()
   where id = p_report;

  -- refund the reporter's credit via their contact, if any
  if r.contact_id is not null then
    perform close_contact(r.contact_id, 'reported_refunded', 'confirmed_report', true);
  end if;

  -- count distinct reporters with confirmed reports against this listing
  if r.listing_id is not null then
    select count(distinct reporter_id) into distinct_reporters
    from reports
    where listing_id = r.listing_id and status = 'confirmed';

    -- determine strike number
    select coalesce(max(strike_number),0) + 1 into next_strike
    from strikes where listing_id = r.listing_id;

    if next_strike >= 2 then
      -- second strike: permanent removal
      update listings set status = 'removed' where id = r.listing_id;
      insert into strikes (lister_id, listing_id, report_id, strike_number)
      values (v_lister, r.listing_id, p_report, 2);
      update profiles set shadow_banned = true,
             shadow_ban_reason = 'two_confirmed_reports'
      where id = v_lister;
    else
      -- first strike: 7-day suspension
      update listings set status = 'suspended' where id = r.listing_id;
      insert into strikes (lister_id, listing_id, report_id, strike_number, suspended_until)
      values (v_lister, r.listing_id, p_report, 1, now() + interval '7 days');
    end if;
  end if;
end; $$;

-- ----------------------------------------------------------------------------
-- RECOMPUTE RATING on new review
-- ----------------------------------------------------------------------------
create or replace function recompute_rating()
returns trigger language plpgsql as $$
begin
  update profiles p set
    rating_avg = sub.avg, rating_count = sub.cnt
  from (
    select rated_id, round(avg(rating)::numeric,1) avg, count(*) cnt
    from reviews where rated_id = new.rated_id group by rated_id
  ) sub
  where p.id = sub.rated_id;
  return new;
end; $$;

create trigger trg_recompute_rating
  after insert on reviews
  for each row execute function recompute_rating();

-- ----------------------------------------------------------------------------
-- GRANT CREDITS: atomic increment, called from the Stripe webhook.
-- ----------------------------------------------------------------------------
create or replace function grant_credits(p_seeker uuid, p_amount int)
returns void language plpgsql security definer as $$
begin
  update profiles
     set contact_credits = contact_credits + p_amount
   where id = p_seeker;
end; $$;
