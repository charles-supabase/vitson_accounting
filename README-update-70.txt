Update 70: job ticket format (A#-#####-#-AA-#) in Invoicing and Job Orders

Invoicing (components/invoicing-workspace.tsx, actions/invoicing.ts)
  - Delivery receipts waiting on the right: new "Job ticket" column after Price.
  - Invoice being made (left) and a saved invoice opened for viewing: new "Job ticket" column after Amount.
  - The saved invoice now also loads each receipt's job ticket (actions/invoicing.ts, InvoiceDetail.receipts).
Job Orders (components/job-orders-workspace.tsx): tickets in every list use the format (includes the update 62 Supabase populate).
Customer Statements already shows the ticket in the format (update 67).
lib/job-ticket.ts is the same as update 69 (needed by these files).
