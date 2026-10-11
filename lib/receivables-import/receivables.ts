import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ImportError } from "./errors";
import { formatPeriod, formatPeriodLabel, parsePeriodInput } from "./dates";
import { buildCustomerLookup, columnLetter, extractRecordsForMonth, locateColumns, type CustomerLookup } from "./validation";
import { fetchSalesStatementRows } from "./googleSheets";
import { replaceMonthRecords } from "./replace-month";

const AR_TABLE = "tbl_Account_Receivables";
const PAGE = 1000;

export type ImportResult = {
  success: true;
  period: string;
  periodLabel: string;
  recordsFound: number;
  /** existing rows of the month that were removed before inserting */
  removed: number;
  inserted: number;
  columnsUsed: Record<string, string>;
};

/** Read-only: tbl_Customer id + customer_no, used to turn the sheet's customer_code into customer_id. */
async function loadCustomerLookup(): Promise<CustomerLookup> {
  const all: { id: number; customer_no: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("tbl_Customer")
      .select("id, customer_no")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[supabase] customer list failed:", error);
      throw new ImportError(
        "CUSTOMERS_READ_FAILED",
        "The customer list could not be read from the database. No changes were made. Please try again.",
        { status: 502, cause: error },
      );
    }
    const page = (data ?? []) as { id: number; customer_no: string | null }[];
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return buildCustomerLookup(all);
}

/** Read-only count of the rows the import would replace (used only to warn the user). */
async function countExisting(period: string): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from(AR_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("for_month_of", period);
  return error ? null : count ?? 0;
}

/**
 * Orchestrates one import. The ORDER is the safety guarantee:
 *   1. read ALL rows from Google          (failure -> nothing touched)
 *   2. read the customer list (read-only)
 *   3. validate every row of the month    (failure -> nothing touched)
 *   4. refuse an empty month unless explicitly confirmed
 *   5. ONLY THEN call the transactional database function
 */
export async function importReceivables(input: {
  month: unknown;
  year: unknown;
  allowEmptyReplacement?: boolean;
}): Promise<ImportResult> {
  const { month, year } = parsePeriodInput(input.month, input.year);
  const period = formatPeriod(year, month);
  const label = formatPeriodLabel(year, month);
  const allowEmpty = input.allowEmptyReplacement === true;

  // 1. Read
  const rows = await fetchSalesStatementRows();
  const customers = await loadCustomerLookup();

  // 3. Validate
  const layout = locateColumns(rows);
  const records = extractRecordsForMonth(rows, layout, { year, month }, customers);

  // 4. Empty-month safety
  if (records.length === 0 && !allowEmpty) {
    throw new ImportError(
      "NO_RECORDS_FOUND",
      `No records were found in Google Sheets for ${label}. No changes were made.`,
      { status: 409, details: { period, label, existingRows: await countExisting(period) } },
    );
  }

  // 5. Atomic replace
  const { removed, inserted } = await replaceMonthRecords({ period, records, allowEmpty });

  return {
    success: true,
    period,
    periodLabel: label,
    recordsFound: records.length,
    removed,
    inserted,
    columnsUsed: Object.fromEntries(Object.entries(layout.columns).map(([k, idx]) => [k, columnLetter(idx)])),
  };
}
