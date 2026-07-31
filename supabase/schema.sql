-- GMT Optimizer — Supabase schema (Phase 2: accounts, profiles, cloud fleets)
-- =============================================================================
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> paste -> Run.
-- Safe to re-run; every statement is guarded with IF NOT EXISTS / OR REPLACE.
--
-- Auth model: username + password only, no email. The frontend maps a username to
-- a synthetic internal email (username@users.gmt-optimizer.local) so Supabase's
-- hardened password auth does the real work while the user only ever sees a
-- username. For that to work you MUST disable email confirmation:
--   Dashboard -> Authentication -> Providers -> Email -> turn OFF "Confirm email".
--
-- Role note (for Phase 3 chat moderation): profiles.role is 'user' | 'mod' | 'admin'.
-- Users can NEVER change their own role — a trigger blocks it. Only an existing
-- admin (or the service role from the dashboard) can promote someone. Make your
-- own account admin after signing up:
--   update public.profiles set role = 'admin' where username = 'YOUR_USERNAME';

-- ---------------------------------------------------------------------------
-- profiles: one row per account, created automatically at signup by a trigger.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null,
  display_name text,
  avatar_url   text,
  role         text not null default 'user' check (role in ('user','mod','admin')),
  created_at   timestamptz not null default now()
);

-- Case-insensitive uniqueness: "Ringo" and "ringo" can't both exist.
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- miners: the cloud-saved fleet. One row per NFT, replacing localStorage once a
-- user is logged in. Collection and code are labels; th/wth feed the calculator.
-- ---------------------------------------------------------------------------
create table if not exists public.miners (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  collection text,
  code       text,
  th         numeric not null default 0 check (th >= 0),
  wth        numeric not null default 15 check (wth >= 0),
  created_at timestamptz not null default now()
);
create index if not exists miners_user_idx on public.miners (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security. Nothing is readable or writable except through these.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.miners   enable row level security;

-- profiles: anyone (even logged-out) may READ — needed for chat names/avatars and
-- the site-wide stats in Phase 3. Users may INSERT/UPDATE only their own row.
drop policy if exists profiles_read      on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_read       on public.profiles for select using (true);
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);
create policy profiles_update_own on public.profiles for update using (auth.uid() = id);

-- miners: a user sees and edits ONLY their own fleet.
drop policy if exists miners_all_own on public.miners;
create policy miners_all_own on public.miners
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Auto-create a profile when someone signs up. The username comes from the
-- signUp() metadata the frontend sends.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || left(new.id::text, 8)),
    coalesce(new.raw_user_meta_data->>'username', 'Miner')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Block self-promotion: a normal user cannot change their own role. Only an
-- existing admin, or the service role (dashboard/SQL), may change it.
-- ---------------------------------------------------------------------------
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if auth.role() = 'service_role' then
      return new;  -- dashboard / server: allowed
    end if;
    if exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
      return new;  -- an admin is making the change: allowed
    end if;
    new.role := old.role;  -- otherwise silently keep the old role
  end if;
  return new;
end $$;

drop trigger if exists guard_role on public.profiles;
create trigger guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------------------------------------------------------------------------
-- Avatar storage: a public bucket, but a user may only write inside a folder
-- named after their own user id (avatars/<uid>/...).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists avatars_read        on storage.objects;
drop policy if exists avatars_write_own   on storage.objects;
drop policy if exists avatars_update_own  on storage.objects;
drop policy if exists avatars_delete_own  on storage.objects;
create policy avatars_read       on storage.objects for select
  using (bucket_id = 'avatars');
create policy avatars_write_own  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update_own on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete_own on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
