Update 69: job ticket format A#-#####-#-AA-#  (supersedes the format in updates 65 and 66)

A = letter or digit, # = digit. Only A#-##### is required; -#, -AA and -# are optional.
  typing   <JobTicketInput value onChange />   "c2" -> "C2-", "C200607" -> "C2-00607-"; the dash is removed together with its character on backspace
  showing  displayJobTicket(value)             "c200607" -> "C2-00607", "76876867bj1" -> "76-87686-7-BJ-1"; other layouts are shown as stored
  saving   isValidJobTicket(value)             true when at least A#-##### is there and everything fits the format

lib/job-ticket.ts, components/job-ticket-input.tsx, tests/job-ticket.test.ts  (npx tsx --test tests/job-ticket.test.ts)
