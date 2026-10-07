"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { parsePeriod, round2 } from "@/lib/report-format";

export type BankMonthRow = {
  bankId: number;
  bankName: string;
  deposit: number;
  withdrawal: number;
  /** deposits - withdrawals from the beginning up to the end of the selected month */
  balance: number;
};

export type BankMonthlySummary = {
  ym: string;
  label: string;
  /** last day of the month, yyyy-mm-dd */
  asOf: string;
  rows: BankMonthRow[];
};

/**
 * Deposits and withdrawals per bank for a month ("2026-10") or a whole year ("2026"),
 * and each bank's balance up to the end of that period.
 */
export async function getBankMonthlySummary(period: string): Promise<{ error?: string; data?: BankMonthlySummary }> {
  await requireModule("bank");
  const range = parsePeriod(period);
  if (!range) return { error: "Enter a year, and a month if you want one month only." };

  const { data: banks, error: bankErr } = await supabaseAdmin.from("tbl_Bank").select("id, bank_name").order("id");
  if (bankErr) return { error: bankErr.message };

  const byBank = new Map<number, BankMonthRow>(
    (banks ?? []).map((b: any) => [b.id, { bankId: b.id, bankName: b.bank_name, deposit: 0, withdrawal: 0, balance: 0 }]),
  );

  // every dated transaction up to the end of the month (unused checks have no date and no amount)
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("tbl_Bank_Transactions")
      .select("id, bank_id, Deposit, Withdrawal, dt_check")
      .not("dt_check", "is", null)
      .lt("dt_check", range.end)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    for (const t of data ?? []) {
      const row = byBank.get(t.bank_id);
      if (!row) continue;
      const dep = t.Deposit ?? 0;
      const wd = t.Withdrawal ?? 0;
      row.balance += dep - wd;
      if (t.dt_check >= range.start) {
        row.deposit += dep;
        row.withdrawal += wd;
      }
    }
    if (!data || data.length < PAGE) break;
  }

  const rows = Array.from(byBank.values()).map((r) => ({
    ...r,
    deposit: round2(r.deposit),
    withdrawal: round2(r.withdrawal),
    balance: round2(r.balance),
  }));
  return {
    data: {
      ym: range.ym,
      label: range.label,
      asOf: range.asOf,
      rows,
    },
  };
}
