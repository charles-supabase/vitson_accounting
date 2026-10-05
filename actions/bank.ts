"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";

export type BankOption = { id: number; label: string };

export type BankTransactionRow = {
  id: number;
  checkNo: string;
  dtCheck: string | null;
  payee: string | null;
  deposit: number | null;
  withdrawal: number | null;
};

export type BankLedger = {
  /** Balance up to the end of the filtered period (or everything when no filter is applied). */
  currentBalance: number;
  /** Last day the balance covers, when a period filter is applied. */
  balanceAsOf: string | null;
  /** Only set when a month is chosen: everything dated before the month. */
  balanceForward: number | null;
  monthDeposit: number;
  monthWithdrawal: number;
  rows: BankTransactionRow[];
  truncated: boolean;
};

const ROW_LIMIT = 2000;

export async function getBanks(): Promise<BankOption[]> {
  await requireModule("bank");
  const { data } = await supabaseAdmin
    .from("tbl_Bank")
    .select("id, bank_name, active")
    .order("bank_name");
  return ((data ?? []) as any[])
    .filter((b) => b.active !== false)
    .map((b) => ({ id: b.id as number, label: b.bank_name as string }));
}

export type BankFilter = { year: number; month: number | null };

/**
 * Transactions for one bank. A filter limits the list to a year (or one month of it) and adds the
 * balance forward; null lists everything. Unused (blank) checks are always included.
 */
export async function getBankLedger(bankId: number, filter: BankFilter | null): Promise<BankLedger> {
  await requireModule("bank");

  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;
  if (filter) {
    const { year, month } = filter;
    if (!Number.isInteger(year) || year < 2000 || year > 2099) throw new Error("Enter a valid year.");
    if (month != null && (!Number.isInteger(month) || month < 1 || month > 12)) throw new Error("Invalid month.");
    if (month == null) {
      rangeStart = `${year}-01-01`;
      rangeEnd = `${year + 1}-01-01`;
    } else {
      rangeStart = `${year}-${String(month).padStart(2, "0")}-01`;
      rangeEnd = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    }
  }

  const { data: bal, error: balErr } = await supabaseAdmin.rpc("bank_balances", {
    p_bank_id: bankId,
    p_month_start: rangeStart,
  });
  if (balErr) throw new Error(`Could not load balance: ${balErr.message}`);
  const b = (bal as { current_balance: number; balance_forward: number }[] | null)?.[0];

  let q = supabaseAdmin
    .from("tbl_Bank_Transactions")
    .select('id, "Check_No", dt_check, "Payee", "Deposit", "Withdrawal"')
    .eq("bank_id", bankId);

  if (rangeStart && rangeEnd) {
    // the period's transactions plus every unused (undated) check
    q = q.or(`and(dt_check.gte.${rangeStart},dt_check.lt.${rangeEnd}),dt_check.is.null`);
  }

  // by date first, then check number; unused (undated) checks sink to the bottom
  q = q.order("dt_check", { ascending: true, nullsFirst: false }).order("Check_No", { ascending: true });

  const { data, error } = await q.limit(ROW_LIMIT + 1);
  if (error) throw new Error(`Could not load transactions: ${error.message}`);

  const all = (data ?? []) as any[];
  const rows: BankTransactionRow[] = all.slice(0, ROW_LIMIT).map((r) => ({
    id: r.id,
    checkNo: r.Check_No,
    dtCheck: r.dt_check ?? null,
    payee: r.Payee ?? null,
    deposit: r.Deposit ?? null,
    withdrawal: r.Withdrawal ?? null,
  }));

  // with a filter the balance stops at the end of the period; later transactions are left out
  let currentBalance = b?.current_balance ?? 0;
  let balanceAsOf: string | null = null;
  if (rangeStart && rangeEnd) {
    const periodRows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error: pErr } = await supabaseAdmin
        .from("tbl_Bank_Transactions")
        .select("Deposit, Withdrawal")
        .eq("bank_id", bankId)
        .gte("dt_check", rangeStart)
        .lt("dt_check", rangeEnd)
        .order("id")
        .range(from, from + 999);
      if (pErr) throw new Error(`Could not load balance: ${pErr.message}`);
      periodRows.push(...((page ?? []) as any[]));
      if (!page || page.length < 1000) break;
    }
    const inPeriod = periodRows.reduce((a, r) => a + (r.Deposit ?? 0) - (r.Withdrawal ?? 0), 0);
    currentBalance = (b?.balance_forward ?? 0) + inPeriod;

    const [ey, em, ed] = rangeEnd.split("-").map(Number);
    balanceAsOf = new Date(Date.UTC(ey, em - 1, ed - 1)).toISOString().slice(0, 10);
  }

  return {
    currentBalance,
    balanceAsOf,
    balanceForward: rangeStart ? (b?.balance_forward ?? 0) : null,
    monthDeposit: rows.reduce((a, r) => a + (r.deposit ?? 0), 0),
    monthWithdrawal: rows.reduce((a, r) => a + (r.withdrawal ?? 0), 0),
    rows,
    truncated: all.length > ROW_LIMIT,
  };
}

export async function createChecks(
  bankId: number,
  start: string,
  count: number
): Promise<{ error?: string; first?: string; last?: string; created?: number }> {
  await requireModule("bank");

  const startNo = start.trim();
  if (!/^\d{1,15}$/.test(startNo)) return { error: "Starting check number must be digits only." };
  if (!Number.isInteger(count) || count < 1 || count > 1000) return { error: "Number of checks must be between 1 and 1000." };

  const { data, error } = await supabaseAdmin.rpc("bank_create_checks", {
    p_bank_id: bankId,
    p_start: startNo,
    p_count: count,
  });
  if (error) return { error: error.message };

  revalidatePath("/bank");
  const r = (data as { first_no: string; last_no: string; created: number }[] | null)?.[0];
  return { first: r?.first_no, last: r?.last_no, created: r?.created };
}

export async function createDms(
  bankId: number,
  ym: string, // "YYYY-MM"
  count: number
): Promise<{ error?: string; first?: string; last?: string; created?: number }> {
  await requireModule("bank");

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return { error: "Choose the month and year." };
  if (!Number.isInteger(count) || count < 1 || count > 500) return { error: "Number of DMs must be between 1 and 500." };

  const { data, error } = await supabaseAdmin.rpc("bank_create_dms", {
    p_bank_id: bankId,
    p_year: Number(ym.slice(0, 4)),
    p_month: Number(ym.slice(5, 7)),
    p_count: count,
  });
  if (error) return { error: error.message };

  revalidatePath("/bank");
  const r = (data as { first_no: string; last_no: string; created: number }[] | null)?.[0];
  return { first: r?.first_no, last: r?.last_no, created: r?.created };
}
