vitson-update-58 (on top of 57)
RUN FIRST (Supabase SQL Editor): supabase/migrations/20261016000000_create_invoice_with_discount.sql
  (dry run inside begin; ... rollback; is fine). It replaces the create_invoice function of update 57.
Changed: actions/invoicing.ts, actions/customer-statements.ts, components/invoicing-workspace.tsx,
         components/customer-statements-workspace.tsx, lib/invoice-totals.ts, tests/invoice-totals.test.ts
New:     app/invoicing/print/page.tsx, supabase/migrations/20261016000000_create_invoice_with_discount.sql
