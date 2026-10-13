-- Defense in depth: this app reaches the database only through the service-role key.
-- RLS is already ON for every public table with zero policies (so anon/authenticated
-- are blocked today), but Supabase also grants them full table privileges by default.
-- Remove those grants so a future mistake (a new policy, RLS switched off on one table)
-- cannot expose tbl_User or any business table through the public API keys.
--
-- Dry run first:  begin;  <paste this file>;  <check query below>;  rollback;
-- Rollback (restores Supabase defaults):
--   grant all on all tables in schema public to anon, authenticated;
--   grant all on all sequences in schema public to anon, authenticated;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Check: should return 0 rows.
-- select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public' and grantee in ('anon','authenticated');
