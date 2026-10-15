vitson-update-59 (on top of 58)
RUN FIRST (Supabase SQL Editor): supabase/migrations/20261017000000_invoice_deduction.sql
  (dry run inside begin; ... rollback; is fine). It replaces the create_invoice function of update 58.
Changed: actions/invoicing.ts, components/invoicing-workspace.tsx, app/invoicing/print/page.tsx, lib/invoice-totals.ts,
         tests/invoice-totals.test.ts, components/customer-statements-workspace.tsx, app/customer-statements/print/page.tsx
New:     supabase/migrations/20261017000000_invoice_deduction.sql
