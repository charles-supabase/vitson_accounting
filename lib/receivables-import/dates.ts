import { ImportError } from "./errors";

/**
 * DATE HANDLING
 * -------------
 * Dates are NEVER converted through a local-time JavaScript Date.
 *  - Sheet date cells are requested as raw serial numbers (days since
 *    1899-12-30) and converted with pure UTC integer arithmetic.
 *  - Text dates must be written as YYYY-MM-DD and are read by regex.
 *  - The month sent to Postgres is built by string formatting ("2026-01"),
 *    so no timezone can ever shift it to 2025-12.
 *
 * tbl_Account_Receivables.for_month_of is TEXT in the form YYYY-MM.
 */

const MS_PER_DAY = 86_400_000;
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);
const MAX_SERIAL = 2_958_465; // 9999-12-31

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type YMD = { year: number; month: number; day: number };

export function parseSheetDate(value: unknown): YMD | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1 || value > MAX_SERIAL) return null;
    const d = new Date(SHEETS_EPOCH_MS + Math.floor(value) * MS_PER_DAY);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value.trim());
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (year < 1900) return null;
    // Confirm it is a real calendar date (rejects 2026-02-31, etc.).
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
      return null;
    }
    return { year, month, day };
  }

  return null;
}

/** "2026-01" (the format stored in tbl_Account_Receivables.for_month_of) */
export function formatPeriod(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** "January 2026" */
export function formatPeriodLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Validates the month/year sent by the browser. */
export function parsePeriodInput(monthInput: unknown, yearInput: unknown): { month: number; year: number } {
  const toInt = (v: unknown): number =>
    typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;

  const month = toInt(monthInput);
  const year = toInt(yearInput);

  if (
    !Number.isInteger(month) || month < 1 || month > 12 ||
    !Number.isInteger(year) || year < 1900 || year > 2200
  ) {
    throw new ImportError("INVALID_PERIOD", "Please choose a valid month and a year between 1900 and 2200.", { status: 400 });
  }
  return { month, year };
}
