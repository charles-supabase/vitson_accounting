-- =============================================================================
-- Transactional "replace one month" function for public."tbl_Account_Receivables"
-- Run this whole file once in the Supabase SQL Editor. Safe to re-run.
--
-- It does NOT create, alter, truncate or drop the table, and does not touch its
-- RLS settings, policies or privileges. for_month_of is TEXT 'YYYY-MM'.
-- =============================================================================

-- 1. Optional, additive index on the month column ------------------------------
create index if not exists idx_tbl_account_receivables_for_month_of
  on public."tbl_Account_Receivables" (for_month_of);

-- 2. Atomic replace function ----------------------------------------------------
-- A plpgsql function body always runs inside ONE transaction. If any statement
-- raises an error, everything it did (including the DELETE) is rolled back.
create or replace function public.replace_tbl_account_receivables_month(
  p_for_month_of text,
  p_rows         jsonb,
  p_allow_empty  boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected int;
  v_deleted  int;
  v_inserted int;
begin
  -- Defensive checks (the app already validates; the database double-checks).
  if p_for_month_of is null or p_for_month_of !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'p_for_month_of must look like YYYY-MM'
      using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array'
      using errcode = '22023';
  end if;

  v_expected := jsonb_array_length(p_rows);

  if v_expected = 0 and not coalesce(p_allow_empty, false) then
    raise exception 'Refusing to replace % with zero rows without explicit confirmation',
      p_for_month_of
      using errcode = '22023';
  end if;

  -- Serialise concurrent imports of the same month.
  perform pg_advisory_xact_lock(
    hashtextextended('tbl_Account_Receivables:' || p_for_month_of, 0)
  );

  delete from public."tbl_Account_Receivables"
   where for_month_of = p_for_month_of;
  get diagnostics v_deleted = row_count;

  -- Insert in the original sheet order. Duplicates are intentionally kept.
  -- id is an identity column and generates itself.
  insert into public."tbl_Account_Receivables"
         (for_month_of, sales_amount, customer_id, receivable_id)
  select p_for_month_of,
         (e.item ->> 'sales_amount')::double precision,
         (e.item ->> 'customer_id')::bigint,
         (e.item ->> 'receivable_id')::bigint
    from jsonb_array_elements(p_rows) with ordinality as e(item, ord)
   order by e.ord;
  get diagnostics v_inserted = row_count;

  if v_inserted <> v_expected then
    raise exception 'Inserted % rows but expected %', v_inserted, v_expected;
  end if;

  return jsonb_build_object('removed', v_deleted, 'inserted', v_inserted);
end;
$$;

-- 3. Only the server (service_role) may call it ---------------------------------
revoke all on function public.replace_tbl_account_receivables_month(text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.replace_tbl_account_receivables_month(text, jsonb, boolean)
  to service_role;

-- ROLLBACK (only if you want to remove this feature; the table and its data stay):
--   drop function if exists public.replace_tbl_account_receivables_month(text, jsonb, boolean);
--   drop index if exists public.idx_tbl_account_receivables_for_month_of;
