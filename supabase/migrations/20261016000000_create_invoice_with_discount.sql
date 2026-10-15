-- Replaces create_invoice (update 57) with a version that also stores the discount.
-- Run in the Supabase SQL Editor. Dry run first: begin; <this file>; rollback;
-- Rollback: drop function public.create_invoice(bigint, bigint, date, bigint[], double precision, double precision, double precision, double precision);

-- the discount column: 0 when nothing is given (tbl_invoice is empty, so nothing is lost)
update public."tbl_invoice" set discount = 0 where discount is null;
alter table public."tbl_invoice" alter column discount set default 0, alter column discount set not null;

drop function if exists public.create_invoice(bigint, bigint, date, bigint[], double precision, double precision, double precision);

create or replace function public.create_invoice(
  p_invoice_number bigint,
  p_alias_id bigint,
  p_date date,
  p_delivery_ids bigint[],
  p_invoice_amount double precision,
  p_discount double precision,
  p_vat double precision,
  p_sales_amount double precision
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id bigint;
  v_wanted int := coalesce(array_length(p_delivery_ids, 1), 0);
  v_found int;
begin
  if v_wanted = 0 then
    raise exception 'NO_DELIVERIES';
  end if;

  -- one invoice is created at a time, so two people cannot take the same number
  perform pg_advisory_xact_lock(hashtext('create_invoice'));

  if exists (select 1 from public."tbl_invoice" where "Invoice_number" = p_invoice_number) then
    raise exception 'INVOICE_NUMBER_EXISTS';
  end if;

  select count(*) into v_found
    from public."tbl_Deliveries"
   where id = any (p_delivery_ids) and invoice_id = 0 and alias_id = p_alias_id;
  if v_found <> v_wanted then
    raise exception 'DELIVERIES_NOT_AVAILABLE';
  end if;

  insert into public."tbl_invoice" ("Invoice_number", alias_id, date_invoice, invoice_amount, discount, "VAT", sales_amount)
  values (p_invoice_number, p_alias_id, p_date, p_invoice_amount, p_discount, p_vat, p_sales_amount)
  returning id into v_id;

  update public."tbl_Deliveries" set invoice_id = v_id where id = any (p_delivery_ids);
  return v_id;
end;
$$;

revoke all on function public.create_invoice(bigint, bigint, date, bigint[], double precision, double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.create_invoice(bigint, bigint, date, bigint[], double precision, double precision, double precision, double precision) to service_role;
