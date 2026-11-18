# Supabase proposals (not applied)

Nothing in this folder has been run on the live database. The owner applies them by hand, in the
Supabase SQL editor, after review.

| Order | File | Needs | Changes |
|---|---|---|---|
| 1 | `2026-11-17_fix_profile_exposure.sql` | overhaul code live on `main` | read access on `profiles` only |
| 2 | `2026-11-17_account_extras.sql` | file 1 | 2 columns, view update, delete function |
| – | `2026-11-17_chat_report_block.sql` | owner OK to build | 2 new tables |

## Back up first

Get the connection string from the Supabase dashboard: **Connect → Session pooler** (works over IPv4).
`pg_dump` must be the same major version as the server or newer (`pg_dump --version`; the server
version is under Settings → Infrastructure).

```bash
read -rs DBPASS && export PGPASSWORD="$DBPASS"            # keeps the password out of shell history
DB='postgresql://postgres.cbatlxqlmeyuhwqpczpv@<pooler-host>:5432/postgres'   # paste from Connect, minus the password
STAMP=$(date +%F)

# 1. The tables the three files touch (schema + data + their grants and policies)
pg_dump "$DB" -Fc --table=public.profiles --table=public.miners --table=public.messages \
  -f "gmt-tables-$STAMP.dump"

# 2. Auth users (delete_my_account removes rows here). Contains password hashes: keep it private.
pg_dump "$DB" -Fc --table=auth.users -f "gmt-auth-users-$STAMP.dump"

# 3. Everything else in the public schema as readable SQL (functions, views, policies, grants, triggers)
pg_dump "$DB" --schema-only --schema=public -f "gmt-public-schema-$STAMP.sql"

# Check the dumps are readable
pg_restore --list "gmt-tables-$STAMP.dump" | head
unset PGPASSWORD DBPASS
```

Fallback without `pg_dump`: Table Editor → each of `profiles`, `miners`, `messages` → Export → CSV.
That keeps the data but not grants or policies.

Each SQL file ends with a rollback block. That is the quick undo for its permission changes;
the dumps are for data.
