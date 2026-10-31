Update 72: job ticket format in the Deliveries module (needs update 71 first for the other screens)

components/deliveries-workspace.tsx
  - list of available delivery receipts: Ticket No. column shows A#-#####-#-AA-# (column made wider)
  - the delivery heading, the "updated" / "saved" messages and the DR search drop-down show the format
  - New job ticket and delivery: the Job ticket box is the typing box (dashes appear while typing)
actions/deliveries.ts
  - a new job ticket must have at least A#-##### (e.g. C2-00607)
  - it is saved without dashes and in capitals (like C200607BJ2), the dashes are only added when shown;
    the duplicate check looks for both spellings, so the same ticket cannot be saved twice
lib/job-ticket.ts (adds storedJobTicket), components/job-ticket-input.tsx, tests/job-ticket.test.ts
