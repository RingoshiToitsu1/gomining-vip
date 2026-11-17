-- ===========================================================================
-- PROPOSAL, NOT APPLIED. Phase 5 account extras (owner-approved features, SQL awaiting review).
-- Run in the Supabase SQL editor only after the owner OKs this exact file.
-- Safe to re-run (idempotent). Nothing here deletes existing data.
--
--   1. Delete my account     → public.delete_my_account()
--   2. Remove profile picture → no SQL (the existing avatars_delete_own policy + profile update cover it)
--   3. Hide TH on my profile → profiles.show_th + column privileges + public.profile_cards view
--   4. Preferences           → profiles.prefs (jsonb), starting with {"lang": "en"}
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 3 + 4. New columns
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists show_th boolean not null default true;   -- default: TH shown
alter table public.profiles add column if not exists prefs   jsonb   not null default '{}'::jsonb;
-- Keep prefs small and an object: {"lang":"en"} today, more keys later.
alter table public.profiles drop constraint if exists profiles_prefs_shape;
alter table public.profiles add constraint profiles_prefs_shape
  check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) < 2048);


-- ---------------------------------------------------------------------------
-- 3. Make the hide-TH toggle real, not cosmetic.
-- Today `profiles_read using (true)` plus the default table grant let ANYONE read EVERY column over the
-- REST API: th_total, and also `setup` (each user's saved console farm). A UI toggle alone would not
-- hide anything. So: anon/authenticated keep table-level SELECT only on the public columns; the
-- private ones (th_total, setup, prefs) are read through the view / function below.
-- ---------------------------------------------------------------------------
revoke select on public.profiles from anon, authenticated;
grant  select (id, username, display_name, avatar_url, bio, role, created_at, banned, show_th)
  on public.profiles to anon, authenticated;
-- UPDATE/INSERT grants are unchanged; RLS (profiles_update_own, profiles_mod_update, guard_role) still governs writes.

-- Public user card: TH only when the owner shows it (or the viewer is the owner).
-- security_barrier + owned by postgres, so it can read th_total for the rows it exposes.
create or replace view public.profile_cards with (security_barrier = true) as
  select id, username, display_name, avatar_url, bio, role, created_at, show_th,
         case when show_th or id = auth.uid() then th_total end as th_total
  from public.profiles;
grant select on public.profile_cards to anon, authenticated;

-- The signed-in user's own full row (incl. setup, prefs, th_total).
create or replace function public.get_my_profile()
returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;


-- ---------------------------------------------------------------------------
-- 1. Delete my account.
-- Deletes the auth user; ON DELETE CASCADE then removes their profiles row, miners rows and chat
-- messages (messages.user_id already cascades; chat history only lives 24h anyway).
-- Chat messages are DELETED, not kept as "deleted user".
-- Storage objects don't cascade: the site removes the user's avatars/<uid>/ files first, using the
-- existing avatars_delete_own policy, then calls this. The site asks for the current password first.
-- ---------------------------------------------------------------------------
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
