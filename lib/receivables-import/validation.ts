import { ImportError } from "./errors";
import { parseSheetDate } from "./dates";

/** BIG -> 1, SMALL -> 2 (matched case-insensitively, whitespace trimmed). tbl_receivable_type: 1 = Big, 2 = Small. */
export const RECEIVABLE_ID_BY_TYPE: Readonly<Record<string, number>> = Object.freeze({ BIG: 1, SMALL: 2 });

const HEADER_SCAN_LIMIT = 20; // header must be within the first 20 rows
const MAX_REPORTED_ROW_ERRORS = 50;

// Header names (normalised: lowercase, letters and digits only).
const COLUMN_HEADERS = {
  date: "date",
  customerCode: "customercode",
  amount: "amount",
  type: "type",
} as const;
type ColumnKey = keyof typeof COLUMN_HEADERS;

export type Layout = { headerRowIndex: number; columns: Record<ColumnKey, number> };

export type ImportRecord = {
  /** real Google Sheets row number */
  sheetRow: number;
  sales_amount: number;
  /** tbl_Customer.id found through the sheet's customer_code = tbl_Customer.customer_no */
  customer_id: number;
  receivable_id: number;
};

export type CustomerLookup = {
  /** normalised customer_no -> tbl_Customer.id */
  byCode: Map<string, number>;
  /** normalised customer_no values that belong to more than one customer */
  ambiguous: Set<string>;
};

const normalizeHeader = (cell: unknown): string =>
  typeof cell === "string" ? cell.toLowerCase().replace(/[^a-z0-9]/g, "") : "";

const isBlank = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

const show = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim() : String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
};

/**
 * How customer codes are compared: trimmed, case-insensitive, and WITHOUT leading zeros
 * ("007" = "7", "0038" = "38"; "000" = "0"). Applied to the sheet's customer_code and to
 * tbl_Customer.customer_no alike. Zeros inside or after the code are kept ("A-07" stays "a-07").
 */
export const normalizeCode = (code: string): string => code.trim().toLowerCase().replace(/^0+(?=.)/, "");

/** 0 -> "A", 25 -> "Z", 26 -> "AA" */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Builds the customer_no -> id lookup from tbl_Customer rows. Rows without a customer_no are ignored. */
export function buildCustomerLookup(customers: { id: number; customer_no: string | null }[]): CustomerLookup {
  const byCode = new Map<string, number>();
  const ambiguous = new Set<string>();
  for (const c of customers) {
    if (c.customer_no == null || c.customer_no.trim() === "") continue;
    const key = normalizeCode(c.customer_no);
    if (byCode.has(key)) ambiguous.add(key);
    else byCode.set(key, c.id);
  }
  return { byCode, ambiguous };
}

/**
 * Finds the header row and the positions of date, customer_code, amount and type
 * by HEADER NAME, so the real position of "type" is verified from the sheet
 * rather than assumed.
 * @param rows rows[0] is spreadsheet row 1, rows[i][0] is column A.
 */
export function locateColumns(rows: unknown[][]): Layout {
  const limit = Math.min(rows.length, HEADER_SCAN_LIMIT);
  const keys = Object.keys(COLUMN_HEADERS) as ColumnKey[];

  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    const matches: Record<ColumnKey, number[]> = { date: [], customerCode: [], amount: [], type: [] };

    row.forEach((cell, c) => {
      const norm = normalizeHeader(cell);
      for (const key of keys) {
        if (norm === COLUMN_HEADERS[key]) matches[key].push(c);
      }
    });

    if (keys.every((k) => matches[k].length > 0)) {
      const duplicated = keys.filter((k) => matches[k].length > 1);
      if (duplicated.length > 0) {
        const where = duplicated.map((k) => `${k} (columns ${matches[k].map(columnLetter).join(", ")})`).join("; ");
        throw new ImportError(
          "AMBIGUOUS_COLUMNS",
          `The Sales Statement header row contains duplicate column names: ${where}. Please make each header unique. No changes were made to Supabase.`,
          { status: 422 },
        );
      }
      return {
        headerRowIndex: r,
        columns: {
          date: matches.date[0],
          customerCode: matches.customerCode[0],
          amount: matches.amount[0],
          type: matches.type[0],
        },
      };
    }
  }

  throw new ImportError(
    "COLUMNS_NOT_FOUND",
    'Could not find a header row containing the columns "date", "customer_code", "amount" and "type" in the first 20 rows of the Sales Statement sheet. No changes were made to Supabase.',
    { status: 422 },
  );
}

type Parsed<T> = { value: T; error?: undefined } | { error: string; value?: undefined };

function resolveCustomer(raw: unknown, lookup: CustomerLookup): Parsed<number> {
  if (isBlank(raw)) return { error: "customer_code is blank." };
  let code: string;
  if (typeof raw === "number" && Number.isFinite(raw)) code = String(raw);
  else if (typeof raw === "string") code = raw.trim();
  else return { error: `customer_code is not valid (found "${show(raw)}").` };

  const key = normalizeCode(code);
  if (lookup.ambiguous.has(key)) {
    return { error: `customer_code "${show(code)}" matches more than one customer_no in the customer list.` };
  }
  const id = lookup.byCode.get(key);
  if (id === undefined) {
    return { error: `customer_code "${show(code)}" does not match any customer_no in the customer list.` };
  }
  return { value: id };
}

function parseAmount(raw: unknown): Parsed<number> {
  if (isBlank(raw)) return { error: "amount is blank." };
  let n: number;
  if (typeof raw === "number") {
    n = raw;
  } else if (typeof raw === "string") {
    const cleaned = raw.replace(/[$,\s]/g, "");
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) {
      return { error: `amount is not a valid number (found "${show(raw)}").` };
    }
    n = Number(cleaned);
  } else {
    return { error: `amount is not a valid number (found "${show(raw)}").` };
  }
  if (!Number.isFinite(n)) return { error: `amount is not a valid number (found "${show(raw)}").` };
  return { value: n };
}

function parseType(raw: unknown): Parsed<number> {
  if (isBlank(raw)) return { error: "type is blank (expected BIG or SMALL)." };
  if (typeof raw !== "string") return { error: `type must be BIG or SMALL (found "${show(raw)}").` };
  const key = raw.trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(RECEIVABLE_ID_BY_TYPE, key)) {
    return { error: `type must be BIG or SMALL (found "${show(raw)}").` };
  }
  return { value: RECEIVABLE_ID_BY_TYPE[key] };
}

/**
 * Validates every row that belongs to the requested month and returns the
 * records to insert. Throws VALIDATION_FAILED (listing every bad row) if any
 * row has a problem. Nothing is deduplicated.
 *
 *  - completely empty rows are skipped;
 *  - rows with a valid date in ANOTHER month are skipped (not our business);
 *  - rows whose date is blank/invalid cannot be assigned to a month, so they
 *    are reported (safer than silently ignoring a possibly-relevant row);
 *  - every row in the requested month has all fields validated, including that
 *    customer_code exists as tbl_Customer.customer_no.
 */
export function extractRecordsForMonth(
  rows: unknown[][],
  layout: Layout,
  period: { year: number; month: number },
  customers: CustomerLookup,
): ImportRecord[] {
  const { headerRowIndex, columns } = layout;
  const records: ImportRecord[] = [];
  const rowErrors: { row: number; problems: string[] }[] = [];

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const rawDate = row[columns.date];
    const rawCustomer = row[columns.customerCode];
    const rawAmount = row[columns.amount];
    const rawType = row[columns.type];

    if ([rawDate, rawCustomer, rawAmount, rawType].every(isBlank)) continue;

    const rowNumber = i + 1; // actual Google Sheets row number
    const problems: string[] = [];

    let date = null;
    if (isBlank(rawDate)) {
      problems.push("date is blank.");
    } else {
      date = parseSheetDate(rawDate);
      if (!date) {
        problems.push(`date is not a valid date (found "${show(rawDate)}"). Use a real date cell or the format YYYY-MM-DD.`);
      }
    }

    // A valid date in a different month: not part of this import.
    if (date && (date.year !== period.year || date.month !== period.month)) continue;

    const customer = resolveCustomer(rawCustomer, customers);
    if (customer.error !== undefined) problems.push(customer.error);
    const amount = parseAmount(rawAmount);
    if (amount.error !== undefined) problems.push(amount.error);
    const type = parseType(rawType);
    if (type.error !== undefined) problems.push(type.error);

    if (problems.length > 0 || customer.value === undefined || amount.value === undefined || type.value === undefined) {
      rowErrors.push({ row: rowNumber, problems });
      continue;
    }

    records.push({
      sheetRow: rowNumber,
      sales_amount: amount.value,
      customer_id: customer.value,
      receivable_id: type.value,
    });
  }

  if (rowErrors.length > 0) {
    throw new ImportError(
      "VALIDATION_FAILED",
      `Import failed. ${rowErrors.length} row${rowErrors.length === 1 ? "" : "s"} in the Google Sheet ${rowErrors.length === 1 ? "has" : "have"} problems. No changes were made to Supabase.`,
      {
        status: 422,
        details: {
          totalInvalidRows: rowErrors.length,
          rowErrors: rowErrors.slice(0, MAX_REPORTED_ROW_ERRORS),
          truncated: rowErrors.length > MAX_REPORTED_ROW_ERRORS,
        },
      },
    );
  }

  return records;
}
