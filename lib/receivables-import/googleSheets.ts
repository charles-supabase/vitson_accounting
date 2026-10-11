import "server-only";
import { google } from "googleapis";
import { ImportError } from "./errors";
import { describeKeyProblem, resolvePrivateKey } from "./googleKey";

const READ_ONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const REQUEST_TIMEOUT_MS = 30_000;

function readConfig() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME;
  const privateKey = resolvePrivateKey();

  const missing = Object.entries({
    GOOGLE_SERVICE_ACCOUNT_EMAIL: email,
    "GOOGLE_PRIVATE_KEY (or GOOGLE_PRIVATE_KEY_BASE64)": privateKey,
    GOOGLE_SPREADSHEET_ID: spreadsheetId,
    GOOGLE_SHEET_NAME: sheetName,
  })
    .filter(([, v]) => !v || !v.trim())
    .map(([k]) => k);

  if (missing.length > 0 || !email || !spreadsheetId || !sheetName) {
    console.error(`[config] Missing Google environment variables: ${missing.join(", ")}`);
    throw new ImportError(
      "CONFIG_ERROR",
      "The server is not configured to read Google Sheets yet. Please contact the administrator.",
      { status: 500 },
    );
  }

  const keyProblem = describeKeyProblem(privateKey);
  if (keyProblem) {
    console.error(
      `[config] The Google private key is not usable: ${keyProblem}. ` +
        `(length ${privateKey.length}, lines ${privateKey.split("\n").length}). ` +
        "Run `npm run check-env` for details.",
    );
    throw new ImportError(
      "GOOGLE_KEY_INVALID",
      "The Google private key in the server settings is not in a readable format. Please copy it again from the service-account JSON file (see docs/receivables-import.md).",
      { status: 500 },
    );
  }

  return { email: email.trim(), privateKey, spreadsheetId: spreadsheetId.trim(), sheetName: sheetName.trim() };
}

/** 'A' -> 0, 'AA' -> 26 */
function lettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Where does the returned range start? e.g. "'Sales Statement'!A1:Z1000" */
function parseRangeStart(range: string | null | undefined): { col: number; row: number } {
  const m = /!\$?([A-Z]+)\$?(\d+)/.exec(range || "");
  return m ? { col: lettersToIndex(m[1]), row: Number(m[2]) - 1 } : { col: 0, row: 0 };
}

function translateGoogleError(err: any): ImportError {
  const status: number | undefined = typeof err?.code === "number" ? err.code : err?.response?.status;
  const message = String(err?.message || "");
  const reason = err?.errors?.[0]?.reason;
  // Never log the private key; only the error summary.
  console.error("[google] Sheets request failed:", { status, reason, message });

  if (
    status === 401 ||
    /invalid_grant|invalid_client|unauthorized_client|DECODER routines|PEM|private key|error:1E08010C/i.test(message)
  ) {
    return new ImportError(
      "GOOGLE_AUTH_FAILED",
      "Google rejected the server's service-account credentials. Please check GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.",
      { status: 502, cause: err },
    );
  }
  if (status === 403) {
    if (/has not been used|accessNotConfigured|is disabled|SERVICE_DISABLED/i.test(message) || reason === "accessNotConfigured") {
      return new ImportError(
        "GOOGLE_API_DISABLED",
        "The Google Sheets API is not enabled for the Google Cloud project. Please enable it and try again.",
        { status: 502, cause: err },
      );
    }
    return new ImportError(
      "GOOGLE_PERMISSION_DENIED",
      "Unable to read the Google Sheet. Please make sure the spreadsheet has been shared with the Google service-account email address.",
      { status: 502, cause: err },
    );
  }
  if (status === 404) {
    return new ImportError(
      "GOOGLE_SPREADSHEET_NOT_FOUND",
      "The Google spreadsheet could not be found. Please check GOOGLE_SPREADSHEET_ID and make sure the spreadsheet is shared with the service-account email address.",
      { status: 502, cause: err },
    );
  }
  if (status === 400 && /unable to parse range|not found/i.test(message)) {
    return new ImportError(
      "WORKSHEET_NOT_FOUND",
      `The worksheet "${process.env.GOOGLE_SHEET_NAME}" was not found in the spreadsheet. Please check the tab name (GOOGLE_SHEET_NAME).`,
      { status: 502, cause: err },
    );
  }
  if (status === 429) {
    return new ImportError(
      "GOOGLE_RATE_LIMITED",
      "Google is temporarily limiting requests. Please wait a minute and try again.",
      { status: 503, cause: err },
    );
  }
  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|timeout|network|socket/i.test(`${err?.code} ${message}`)) {
    return new ImportError(
      "GOOGLE_UNREACHABLE",
      "Could not connect to Google. Please check the server's internet connection and try again.",
      { status: 502, cause: err },
    );
  }
  return new ImportError(
    "GOOGLE_API_ERROR",
    "Something went wrong while reading the Google Sheet. Please try again; if it keeps happening, contact the administrator.",
    { status: 502, cause: err },
  );
}

/**
 * Reads the whole worksheet in ONE API request (read-only scope).
 * Returns rows aligned to the real sheet: rows[0] is row 1, rows[i][0] is column A,
 * so (index + 1) is always the true Google Sheets row number.
 *
 * Dates are fetched as raw serial numbers (UNFORMATTED_VALUE + SERIAL_NUMBER),
 * which avoids any locale- or timezone-dependent formatting.
 */
export async function fetchSalesStatementRows(): Promise<unknown[][]> {
  const { email, privateKey, spreadsheetId, sheetName } = readConfig();

  const auth = new google.auth.JWT({ email, key: privateKey, scopes: [READ_ONLY_SCOPE] });
  const sheets = google.sheets({ version: "v4", auth });
  const range = `'${sheetName.replace(/'/g, "''")}'`; // whole worksheet

  let response;
  try {
    response = await sheets.spreadsheets.values.get(
      {
        spreadsheetId,
        range,
        majorDimension: "ROWS",
        valueRenderOption: "UNFORMATTED_VALUE",
        dateTimeRenderOption: "SERIAL_NUMBER",
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
  } catch (err) {
    throw translateGoogleError(err);
  }

  const values = response?.data?.values as unknown[][] | null | undefined;
  if (!Array.isArray(values) || values.length === 0) {
    throw new ImportError("SHEET_EMPTY", `The worksheet "${sheetName}" is empty. No changes were made to Supabase.`, { status: 422 });
  }

  // Align to A1 in case Google returns a range that doesn't start there.
  const start = parseRangeStart(response.data.range);
  const padCols = (row: unknown[]): unknown[] => (start.col > 0 ? (Array(start.col).fill("") as unknown[]).concat(row) : row);
  return (Array(start.row).fill([]) as unknown[][]).concat(values.map(padCols));
}
