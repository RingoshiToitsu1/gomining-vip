-- ===========================================================================
-- PROPOSAL, NOT APPLIED. Interim fix before launch: logged-OUT visitors stop seeing private profile columns.
--
-- Today anon (no login) can SELECT every column of all profiles, including `setup` (each user's saved
-- console farm). Probed 2026-11-17 with zero-row requests: anon can read id, username, display_name,
-- avatar_url, role, created_at, bio, banned, th_total and setup on 477 profiles.
--
-- What the LIVE site (main) reads while logged out: only the chat user card
-- (account.js fetchUserCard: username, display_name, avatar_url, bio, created_at, th_total, role, filtered
-- by id) and the message count (messages table). Nothing reads `setup` without a login. So anon keeps
-- exactly those columns (+ id, banned) and loses `setup` and anything added later.
--
-- Logged-in (authenticated) access is NOT changed here: logged-in users can still read other users'
-- `setup` until the full fix (2026-11-17_fix_profile_exposure.sql) runs at launch.
-- Safe to re-run. Rollback at the bottom.
-- ===========================================================================

revoke select on public.profiles from anon;
grant  select (id, username, display_name, avatar_url, bio, role, created_at, banned, th_total)
  on public.profiles to anon;

-- ---------------------------------------------------------------------------
-- ROLLBACK (anon back to reading every column, as today):
--   grant select on public.profiles to anon;
-- ---------------------------------------------------------------------------
