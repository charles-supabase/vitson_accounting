# Accounts Receivable: Populate from Google Sheets

The **Populate** button (Accounts Receivable, right of the Month / Year filter) reads the
**Sales Statement** tab of the Google Sheet *customer_statements* (read-only) and copies the
selected month into `tbl_Account_Receivables`, **replacing that month's existing rows (Big and Small)**.

| Sheet column | Table column |
|---|---|
| date | `for_month_of` (text `YYYY-MM`, e.g. `2026-01`) |
| amount | `sales_amount` |
| customer_code | looked up in `tbl_Customer.customer_no` ignoring leading zeros on both sides (`007` = `7`); the matching `tbl_Customer.id` is stored in `customer_id` |
| type: BIG / SMALL (case-insensitive, trimmed) | `receivable_id` 1 / 2 |

## Safety rules (built in)
- Nothing is deleted until the whole sheet is read AND every row of the month is validated.
- Any invalid row (including a customer_code that matches no customer_no): every bad row is listed with its real sheet row number and nothing changes.
- Zero rows for the month: nothing changes unless the user confirms an empty replacement.
- Delete + insert happen only inside one Postgres function (rolls back on any failure).
- Rows are not de-duplicated and are inserted in sheet order.
- Dates never go through a local-time JS Date. The Google scope is `spreadsheets.readonly`.
- Access: signed-in users with the `accounts_receivable` module only (401 / 403 otherwise).

## Before the first real import
1. **Back up first.** Supabase backup, or: `create table "tbl_Account_Receivables_backup" as select * from public."tbl_Account_Receivables";`
2. Remember: importing a month **replaces** that month's existing rows.

## Setup
1. `npm install googleapis server-only` and `npm install -D tsx`
2. Add to `package.json` scripts:
   ```json
   "check-env": "tsx scripts/check-receivables-env.ts",
   "test:receivables": "tsx --test tests/receivables-import.test.ts"
   ```
3. Run `supabase/migrations/20261011000000_replace_tbl_account_receivables_month.sql` in the Supabase SQL Editor.
4. Environment variables (names only), in `.env.local` and `.env.example`:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=
   GOOGLE_PRIVATE_KEY_BASE64=   # preferred (base64 of the private_key value)
   # GOOGLE_PRIVATE_KEY=        # alternative, one line, "\n" for line breaks
   GOOGLE_SPREADSHEET_ID=
   GOOGLE_SHEET_NAME=Sales Statement
   ```
   The service-role key already used by the app stays server-only.
5. `.gitignore` must contain:
   ```
   .env*
   !.env.example
   *service-account*.json
   *serviceaccount*.json
   *credentials*.json
   *-key.json
   *.pem
   *.p12
   *.key
   ```
6. Share the spreadsheet (Viewer) with the service-account email.
7. `npm run check-env`, `npm run test:receivables`, then `npm run build` / `npm run lint`.

## Verify the function (SQL Editor)
```sql
select p.proname, pg_get_function_identity_arguments(p.oid) args,
       p.prosecdef as security_definer,
       has_function_privilege('service_role', p.oid, 'EXECUTE')   as service_role_can_run,
       has_function_privilege('anon', p.oid, 'EXECUTE')           as anon_can_run,
       has_function_privilege('authenticated', p.oid, 'EXECUTE')  as authenticated_can_run
from pg_proc p
where p.proname = 'replace_tbl_account_receivables_month';
-- expected: service_role_can_run = true, the other two = false

-- Works against the real table name, without keeping anything (rolled back):
begin;
select public.replace_tbl_account_receivables_month(
  '2099-01',
  '[{"sales_amount":1,"customer_id":1,"receivable_id":1}]'::jsonb, false);
select * from public."tbl_Account_Receivables" where for_month_of = '2099-01';
rollback;
```

## Manual test plan
1. Import **January 2026**. Note "entries added".
2. Import January 2026 again: "previous entries replaced" must equal the earlier "entries added".
3. Pick a month with no rows in the sheet: you get a "No records found" prompt; choose **Keep existing** and confirm nothing changed.
4. In the sheet, change one type to `BIGG` for a row in the test month, import: the modal must name that sheet row, and the table must be unchanged. Restore the value afterwards.
5. Put a customer_code that is not a customer_no in a row: same result (row listed, nothing changed).
6. Log out (or use a user without the module) and POST to `/api/import-receivables`: expect 401 / 403.

## Rollback
```sql
drop function if exists public.replace_tbl_account_receivables_month(text, jsonb, boolean);
drop index if exists public.idx_tbl_account_receivables_for_month_of;
```
The table and its data are not touched by the rollback.
