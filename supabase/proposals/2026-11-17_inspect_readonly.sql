-- ===========================================================================
-- READ-ONLY. Changes nothing. Run in the SQL editor before applying any proposal, and paste the results back.
-- It confirms against the LIVE database what schema.sql says (the publishable key can't list schema).
-- ===========================================================================

-- 1. Every column of every public table (catches columns added outside schema.sql).
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 2. Every public table and view: is RLS on?
select c.relname as name, case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'matview' end as kind,
       c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
order by 1;

-- 3. Every RLS policy in public (who can do what).
select tablename, policyname, cmd, roles, qual as using_expr, with_check
from pg_policies where schemaname = 'public'
order by tablename, policyname;

-- 4. What anon and authenticated may read: table-level and column-level SELECT grants.
select table_name, grantee, privilege_type, 'table' as level
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT'
union all
select table_name || '.' || column_name, grantee, privilege_type, 'column'
from information_schema.column_privileges
where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT'
  and (table_name, grantee) not in (select table_name, grantee from information_schema.role_table_grants
                                    where table_schema = 'public' and privilege_type = 'SELECT')
order by 1, 2;

-- 5. Every foreign key that points at auth.users or public.profiles, from ANY schema, with its ON DELETE rule.
--    delete_my_account() needs every row here to be CASCADE (or SET NULL), or the delete fails.
select con.conrelid::regclass as from_table, a.attname as from_column,
       con.confrelid::regclass as to_table,
       case con.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT'
                            when 'r' then 'RESTRICT' when 'a' then 'NO ACTION' end as on_delete
from pg_constraint con
join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
where con.contype = 'f' and con.confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
order by 1;

-- 6. Functions anon/authenticated can call in public (RPC surface).
select p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_call,
       has_function_privilege('authenticated', p.oid, 'execute') as authed_can_call
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by 1;
