vitson-update-61 (on top of 59 and 60; extract 61)
Changed: lib/invoice-totals.ts (new VAT and Service Income formulas), tests/invoice-totals.test.ts,
         actions/invoicing.ts (view an invoice, edit password check, update invoice),
         components/invoicing-workspace.tsx (click an invoice to view, Edit with password, invoice date default)
No SQL needed. Optional: create unique index on public."tbl_invoice" ("Invoice_number");
