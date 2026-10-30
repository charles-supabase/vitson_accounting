Update 67

1. Administration > Aliases: the list is shown in several columns (1 on a narrow screen, 2 on medium, 3 on wide),
   alias name with its TIN (dash every 3 digits). Double-click / Enter loads the alias into the form; the filter box still works.
   lib/admin-masters.ts (new "multiColumn" option, set for aliases), components/master-manager.tsx, components/master-page.tsx
   Any other master can use it with one line in lib/admin-masters.ts.

2. Customer Statements green box: DR No. column added right after Date.
   components/customer-statements-workspace.tsx  (includes the update 66 layout; needs lib/job-ticket.ts from update 66)
