Update 65: job ticket format ##-#####-#-AA-#

lib/job-ticket.ts               formatJobTicketInput (typing), displayJobTicket (showing), isCompleteJobTicket
components/job-ticket-input.tsx <JobTicketInput value onChange /> : replaces <input> for a job ticket
tests/job-ticket.test.ts        npx tsx --test tests/job-ticket.test.ts

Use:
  <JobTicketInput value={ticket} onChange={setTicket} />      // typing: "26" shows "26-", "26-00123" shows "26-00123-" ...
  {displayJobTicket(row.job_ticket)}                          // showing

Older tickets (e.g. C200607BJ2) start with a letter, so they are shown and typed exactly as they are.
