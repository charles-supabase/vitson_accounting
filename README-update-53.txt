vitson-update-53 (includes updates 50 to 52; extract 53 only)
SQL from update 52 must have been run (count_1x1 column and 0 defaults).
New:     app/customer-statements/page.tsx, actions/customer-statements.ts, components/customer-statements-workspace.tsx,
         lib/price-check.ts, tests/price-check.test.ts
Changed: components/deliveries-workspace.tsx (Body / 1x1 / C+C shown as columns, Weight and Rolls as rows)
Open the screen at /customer-statements (no tile yet: needs lib/modules.ts).
Test: npx tsx --test tests/price-check.test.ts
