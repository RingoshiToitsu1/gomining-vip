-- ===========================================================================
-- PROPOSAL, NOT APPLIED. Chat report + block (Phase 6). Needs the owner's OK before anything is built or run.
-- Revised 2026-11-17: reported_user_id added; body, reported_user_id and reporter_id are filled by the
-- server from public.messages (a client can only choose WHICH message and an optional reason); body capped.
-- Safe to re-run. Rollback at the bottom.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Report a message. Messages are purged after 24h, so the report keeps a snapshot of what was said.
-- ---------------------------------------------------------------------------
create table if not exists public.message_reports (
  id               bigint generated always as identity primary key,
  message_id       bigint references public.messages(id) on delete set null,   -- null once the message is purged
  reported_user_id uuid   references auth.users(id) on delete cascade,         -- the message's author (server-filled)
  reporter_id      uuid   not null references auth.users(id) on delete cascade, -- who reported (server-filled)
  body             text   not null check (char_length(body) <= 500),            -- snapshot (server-filled, capped)
  reason           text   check (char_length(reason) <= 200),                   -- the only free text from the client
  created_at       timestamptz not null default now(),
  unique (message_id, reporter_id)                                              -- one report per person per message
);

-- Server-side fill: whatever the client sends for these columns is overwritten.
create or replace function public.message_reports_fill()
returns trigger
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select user_id, body into m from public.messages where id = new.message_id;
  if not found then raise exception 'message not found'; end if;
  if m.user_id = auth.uid() then raise exception 'you cannot report your own message'; end if;
  new.reporter_id      := auth.uid();
  new.reported_user_id := m.user_id;
  new.body             := left(m.body, 500);
  new.created_at       := now();
  return new;
end;
$$;
revoke all on function public.message_reports_fill() from public, anon, authenticated;   -- trigger only
drop trigger if exists message_reports_fill on public.message_reports;
create trigger message_reports_fill before insert on public.message_reports
  for each row execute function public.message_reports_fill();

alter table public.message_reports enable row level security;
drop policy if exists reports_insert on public.message_reports;
drop policy if exists reports_mod    on public.message_reports;
-- RLS checks run after the BEFORE trigger, so reporter_id here is the server-filled value.
create policy reports_insert on public.message_reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_mod    on public.message_reports for all using (public.is_mod());   -- only mods/admins read or clear reports
-- Clients may only send the message id and a reason; nothing else is insertable. anon gets nothing.
revoke all on public.message_reports from anon, authenticated;
grant insert (message_id, reason) on public.message_reports to authenticated;
grant select, update, delete on public.message_reports to authenticated;   -- still mods-only via reports_mod

-- ---------------------------------------------------------------------------
-- Block a user: their messages are hidden for you, on every device.
-- ---------------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists blocks_own on public.user_blocks;
create policy blocks_own on public.user_blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
revoke all on public.user_blocks from anon;

-- ---------------------------------------------------------------------------
-- ROLLBACK (removes both features and their data):
--   drop table if exists public.user_blocks;
--   drop trigger if exists message_reports_fill on public.message_reports;
--   drop table if exists public.message_reports;
--   drop function if exists public.message_reports_fill();
-- ---------------------------------------------------------------------------
