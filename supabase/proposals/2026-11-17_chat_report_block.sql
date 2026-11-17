-- ===========================================================================
-- PROPOSAL, NOT APPLIED. Chat report + block (Phase 6). Needs the owner's OK before anything is built or run.
-- ===========================================================================

-- Report a message. Messages are purged after 24h, so the report keeps a snapshot of what was said.
create table if not exists public.message_reports (
  id          bigint generated always as identity primary key,
  message_id  bigint references public.messages(id) on delete set null,
  reported_id uuid   references auth.users(id) on delete cascade,     -- the author
  reporter_id uuid   not null references auth.users(id) on delete cascade default auth.uid(),
  body        text   not null,                                         -- snapshot of the message
  reason      text   check (char_length(reason) <= 200),
  created_at  timestamptz not null default now(),
  unique (message_id, reporter_id)                                     -- one report per person per message
);
alter table public.message_reports enable row level security;
drop policy if exists reports_insert on public.message_reports;
drop policy if exists reports_mod    on public.message_reports;
create policy reports_insert on public.message_reports for insert with check (reporter_id = auth.uid());
create policy reports_mod    on public.message_reports for all using (public.is_mod());   -- only mods/admins read or clear reports

-- Block a user: their messages are hidden for you, on every device.
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;
drop policy if exists blocks_own on public.user_blocks;
create policy blocks_own on public.user_blocks for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
