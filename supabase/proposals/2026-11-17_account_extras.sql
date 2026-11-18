-- ===========================================================================
-- PROPOSAL, NOT APPLIED. Account extras (owner-approved features): hide TH, preferences, delete account.
-- REQUIRES 2026-11-17_fix_profile_exposure.sql first (it creates profile_cards and get_my_profile).
-- "Remove profile picture" needs no SQL (existing avatars_delete_own policy + a profile update).
-- Safe to re-run. Rollback at the bottom.
-- ===========================================================================

-- 1. New columns. Defaults keep every existing account exactly as it is today.
alter table public.profiles add column if not exists show_th boolean not null default true;   -- TH shown
alter table public.profiles add column if not exists prefs   jsonb   not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists profiles_prefs_shape;
alter table public.profiles add constraint profiles_prefs_shape
  check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) < 2048);   -- {"lang":"en"} today
-- show_th is public (the card needs it); prefs stays private (read via get_my_profile()).
grant select (show_th) on public.profiles to anon, authenticated;

-- 2. Hide-TH: the public card now honours the toggle. Same columns, same order as the exposure fix.
create or replace view public.profile_cards with (security_barrier = true) as
  select id, username, display_name, avatar_url, bio, role, created_at,
         case when show_th or id = auth.uid() then th_total end as th_total,
         show_th
  from public.profiles;

-- 3. Delete my account. Removes the auth user; ON DELETE CASCADE then removes their profiles row,
--    miners rows and chat messages (messages.user_id already cascades; chat only keeps 24h).
--    Chat messages are DELETED, not kept as "deleted user".
--    Avatar files don't cascade: the site deletes avatars/<uid>/ first (avatars_delete_own policy),
--    after re-checking the current password, then calls this.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK:
--   drop function if exists public.delete_my_account();
--   create or replace view public.profile_cards with (security_barrier = true) as
--     select id, username, display_name, avatar_url, bio, role, created_at, th_total, true as show_th
--     from public.profiles;
--   revoke select (show_th) on public.profiles from anon, authenticated;
--   alter table public.profiles drop constraint if exists profiles_prefs_shape;
--   alter table public.profiles drop column if exists prefs;     -- drops saved preferences
--   alter table public.profiles drop column if exists show_th;   -- drops hide-TH choices
-- ---------------------------------------------------------------------------
