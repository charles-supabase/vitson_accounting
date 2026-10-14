vitson-update-54 (includes updates 50 to 53; extract 54 only)
New:     app/customer-statements/print/page.tsx, lib/statement-report.ts, tests/statement-report.test.ts
Changed: lib/modules.ts (new module customer_statements: dashboard tile, sidebar, permission),
         actions/customer-statements.ts, app/customer-statements/page.tsx, components/customer-statements-workspace.tsx
Test:    npx tsx --test tests/price-check.test.ts tests/statement-report.test.ts
