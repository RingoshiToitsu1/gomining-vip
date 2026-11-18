-- ===========================================================================
-- PROPOSAL, NOT APPLIED. Fix: anyone can read every user's saved farm and TH through the public API.
--
-- What's wrong today: `profiles_read using (true)` plus Supabase's default table grant let anon and
-- logged-in users SELECT every column of every profile, including `setup` (the whole saved console
-- farm) and `th_total`. The site only *shows* some of it; the API hands out all of it.
--
-- What this does (read access only; no data, write rules, RLS policies or triggers change):
--   • profiles: anon/authenticated may read only the public columns.
--   • public.profile_cards (view): the public profile card, incl. TH, as the chat card and /profile show today.
--   • public.get_my_profile(): a signed-in user's own full row, incl. their saved farm (`setup`).
-- After this, `setup` is readable only by its owner. TH stays public, exactly as it is shown today
-- (the per-user "hide my TH" toggle is the separate account_extras file).
--
-- ORDER: apply only once the overhaul site code is live on main. The current live account.js reads
-- `setup` and `th_total` straight from `profiles`; with this applied, that old code can't restore a
-- saved farm or load chat user cards. The overhaul code uses the view/function and falls back cleanly.
-- Safe to re-run. Rollback at the bottom.
-- ===========================================================================

-- 1. Column-level read access on profiles.
revoke select on public.profiles from anon, authenticated;
grant  select (id, username, display_name, avatar_url, bio, role, created_at, banned)
  on public.profiles to anon, authenticated;
-- `banned` stays readable: the messages_insert policy checks the poster's own ban flag as that user.
-- INSERT/UPDATE grants are untouched; RLS (profiles_insert_own, profiles_update_own, profiles_mod_update)
-- and the guard_role trigger still govern every write. Updates filter on `id`, which stays readable.

-- 2. Public profile cards (chat user card, /profile). Same fields as today. `show_th` is a constant
--    here so the site's query shape doesn't change when the hide-TH toggle (account_extras) arrives.
--    A plain view runs with its owner's rights, so it can read th_total; it exposes nothing else private.
create or replace view public.profile_cards with (security_barrier = true) as
  select id, username, display_name, avatar_url, bio, role, created_at,
         th_total,
         true as show_th
  from public.profiles;
grant select on public.profile_cards to anon, authenticated;

-- 3. The signed-in user's own full row (setup, th_total and everything else).
create or replace function public.get_my_profile()
returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- ROLLBACK (puts read access back exactly as it was):
--   grant select on public.profiles to anon, authenticated;
--   drop function if exists public.get_my_profile();
--   drop view if exists public.profile_cards;
-- (If account_extras was applied after this, roll that back first.)
-- ---------------------------------------------------------------------------
