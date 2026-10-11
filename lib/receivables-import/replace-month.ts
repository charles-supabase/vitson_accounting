import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ImportError } from "./errors";
import type { ImportRecord } from "./validation";

/** Name of the transactional Postgres function (see supabase/migrations). */
const RPC_NAME = "replace_tbl_account_receivables_month";

function translateSupabaseError(error: any): ImportError {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`;
  console.error("[supabase] RPC failed:", {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
  });

  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network/i.test(text)) {
    return new ImportError(
      "SUPABASE_UNREACHABLE",
      "Could not connect to Supabase. Please check the connection and try again. Running the import again is safe.",
      { status: 502, cause: error },
    );
  }
  if (error?.code === "PGRST202" || error?.code === "42883" || error?.code === "42P01" || /Could not find the function|does not exist/i.test(text)) {
    return new ImportError(
      "SUPABASE_NOT_SET_UP",
      "The database is not set up yet. Please run the SQL migration in Supabase, then try again. No changes were made to Supabase.",
      { status: 500, cause: error },
    );
  }
  if (/invalid api key|JWT|PGRST301|permission denied/i.test(text) || error?.code === "42501") {
    return new ImportError(
      "SUPABASE_AUTH_FAILED",
      "Supabase rejected the server's credentials. Please check the Supabase environment variables.",
      { status: 502, cause: error },
    );
  }
  if (error?.code === "23503") {
    return new ImportError(
      "SUPABASE_REFERENCE_FAILED",
      "A customer or receivable type in the sheet no longer exists in the app. The existing records for this month were not changed. Please try again.",
      { status: 409, cause: error },
    );
  }
  return new ImportError(
    "SUPABASE_WRITE_FAILED",
    "The database could not save the records. The operation is transactional, so the existing records for this month were not changed.",
    { status: 502, cause: error },
  );
}

/**
 * Atomically replaces every tbl_Account_Receivables row for `period` ("YYYY-MM")
 * using the Postgres function replace_tbl_account_receivables_month
 * (delete + insert in a single transaction; any failure rolls both back).
 */
export async function replaceMonthRecords(args: {
  period: string;
  records: ImportRecord[];
  allowEmpty?: boolean;
}): Promise<{ removed: number; inserted: number }> {
  const rows = args.records.map((r) => ({
    sales_amount: r.sales_amount,
    customer_id: r.customer_id,
    receivable_id: r.receivable_id,
  }));

  let result;
  try {
    result = await supabaseAdmin.rpc(RPC_NAME, {
      p_for_month_of: args.period,
      p_rows: rows,
      p_allow_empty: args.allowEmpty === true,
    });
  } catch (err) {
    throw translateSupabaseError(err);
  }

  if (result.error) throw translateSupabaseError(result.error);

  const removed = Number(result.data?.removed);
  const inserted = Number(result.data?.inserted);
  if (!Number.isInteger(removed) || !Number.isInteger(inserted)) {
    console.error("[supabase] Unexpected RPC response:", result.data);
    throw new ImportError(
      "SUPABASE_BAD_RESPONSE",
      "The database returned an unexpected response. Please check the data in Supabase before trying again.",
      { status: 502 },
    );
  }
  return { removed, inserted };
}
