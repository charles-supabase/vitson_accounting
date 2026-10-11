-- Small delivery receipts (DR# contains "-") have no alias: tbl_Deliveries.alias_id = 0.
-- tbl_Deliveries.alias_id has a foreign key to tbl_Alias(id), so a row with id 0 must exist.
-- Run once in the Supabase SQL Editor. Safe to re-run. The Aliases page does not list this row.
insert into public."tbl_Alias" (id, alias_name, "TIN_number", associated_customer)
values (0, 'NO ALIAS', 0, '')
on conflict (id) do nothing;

-- ROLLBACK (only if no delivery uses alias_id 0):
--   delete from public."tbl_Alias" where id = 0;
