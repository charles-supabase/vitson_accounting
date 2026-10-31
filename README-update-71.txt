Update 71: complete redo of update 67 + the job ticket format everywhere it is available.
Copy all files over the project (same folders). This replaces updates 65 to 70.

Job ticket A#-#####-#-AA-#  (lib/job-ticket.ts)
  A = letter or digit, # = digit. Only A#-##### is required; every part after it may be left out, including the single
  digit (a letter right after A#-##### starts the AA part).
  Shown:   C200516 -> C2-00516    C200607BJ2 -> C2-00607-BJ-2    76876867BJ1 -> 76-87686-7-BJ-1
  Other layouts (e.g. 1111, 11111) are shown as stored.
  Screens: Customer Statements (green box), Invoicing (waiting list, invoice being made, saved invoice), Job Orders (all lists).
  Typing:  components/job-ticket-input.tsx   Saving check: isValidJobTicket(value)
  Test:    npx tsx --test tests/job-ticket.test.ts

Customer Statements green box: DR No. column after Date; layout of update 66.
Invoicing: Job ticket column after Price (waiting list), after Amount (invoice being made and saved invoice).
Administration > Aliases: alias list in columns; Associated customers check boxes in columns.
