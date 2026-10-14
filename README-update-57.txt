vitson-update-57 (on top of updates 54 to 56; extract 57)
RUN FIRST (Supabase SQL Editor): supabase/migrations/20261015000000_create_invoice_function.sql
New:     app/invoicing/page.tsx, actions/invoicing.ts, components/invoicing-workspace.tsx, lib/invoice-totals.ts,
         tests/invoice-totals.test.ts, supabase/migrations/20261015000000_create_invoice_function.sql
Changed: lib/modules.ts (new module "invoicing"), app/customer-statements/print/page.tsx, components/customer-statements-workspace.tsx
Test:    npx tsx --test tests/invoice-totals.test.ts tests/price-check.test.ts tests/statement-report.test.ts
