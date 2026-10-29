Update 66

1. Job ticket format A#-#####-#-AA-#  (supersedes update 65)
   lib/job-ticket.ts, components/job-ticket-input.tsx, tests/job-ticket.test.ts
   <JobTicketInput value onChange />  while typing: "c2" -> "C2-", "C2-00607" -> "C2-00607-" ...
   displayJobTicket(value)            complete tickets get their dashes, other (older) tickets are shown as stored
   Customer Statements green box now shows the job ticket with displayJobTicket.

2. Collections: check name (tbl_Collections.check_name: 1 Vitson International, 2 Personal)
   lib/check-name.ts, actions/collection.ts, components/collection-workspace.tsx
   Radio buttons at the top of the form (required). Deposit bank list: 1 = banks without the "Y_" prefix,
   2 = only "Y_" banks, none until a check name is chosen. The server checks it again when depositing.

3. Customer Statements layout
   components/customer-statements-workspace.tsx
   Top: period (left) and the customer list in the top right corner (3 visible, the rest by scrolling).
   Below: Big/Small list on the left (1/3): DR No. ascending, Date, Color; totals (receipts, weight, rolls) at the bottom.
   Green box on the right (2/3).
