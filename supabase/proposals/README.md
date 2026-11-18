# Supabase proposals (not applied)

Nothing in this folder has been run on the live database. The owner applies them by hand, in the
Supabase SQL editor, after review.

| When | File | Changes |
|---|---|---|
| Any time (read-only) | `2026-11-17_inspect_readonly.sql` | nothing: lists columns, RLS, policies, grants, foreign keys, functions |
| Before launch (optional, owner's call) | `2026-11-17_interim_anon_lockdown.sql` | logged-out visitors lose `setup`; logged-in unchanged |
| **Launch, required**, right after the overhaul is on `main` | `2026-11-17_fix_profile_exposure.sql` | read access on `profiles` (own `setup` only) |
| After the launch fix | `2026-11-17_account_extras.sql` | `show_th`, `prefs`, `profile_cards` update, `delete_my_account()` |
| Only when approved | `2026-11-17_chat_report_block.sql` | 2 new tables + a fill trigger |

## Back up first

### Option A: `pg_dump` (keeps data, grants, policies)
Get the connection string from the Supabase dashboard: **Connect → Session pooler** (works over IPv4).
`pg_dump` must be the same major version as the server or newer (`pg_dump --version`; the server
version is under Settings → Infrastructure).

```bash
read -rs DBPASS && export PGPASSWORD="$DBPASS"            # keeps the password out of shell history
DB='postgresql://postgres.cbatlxqlmeyuhwqpczpv@<pooler-host>:5432/postgres'   # paste from Connect, minus the password
STAMP=$(date +%F)

# 1. The tables the files touch (schema + data + their grants and policies)
pg_dump "$DB" -Fc --table=public.profiles --table=public.miners --table=public.messages \
  -f "gmt-tables-$STAMP.dump"
# 2. Auth users (delete_my_account removes rows here). Contains password hashes: keep it private.
pg_dump "$DB" -Fc --table=auth.users -f "gmt-auth-users-$STAMP.dump"
# 3. Everything else in the public schema as readable SQL (functions, views, policies, grants, triggers)
pg_dump "$DB" --schema-only --schema=public -f "gmt-public-schema-$STAMP.sql"

pg_restore --list "gmt-tables-$STAMP.dump" | head      # check the dump is readable
unset PGPASSWORD DBPASS
```
Restore one table if needed: `pg_restore -d "$DB" --clean --if-exists --table=profiles "gmt-tables-$STAMP.dump"`.

### Option B: dashboard only (data, not permissions)
1. **Table Editor** → `profiles` → the **⋯** menu (or "Export") → **Export to CSV**. Repeat for `miners` and `messages`.
2. **SQL Editor** → run `2026-11-17_inspect_readonly.sql` and export each result (sections 2–5 are the permissions)
   so you have a record of today's RLS, policies and grants.
3. Paid plans: **Database → Backups** also has daily backups / point-in-time restore; take note of the latest one.

Each SQL file ends with a rollback block for its permission changes; the dumps are for data.
