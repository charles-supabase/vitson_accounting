"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { compareVoucherNo, parseYm, round2 } from "@/lib/report-format";

export type VoucherReportBank = { id: number; name: string };

export type VoucherReportRow = {
  id: number;
  voucherNo: string;
  voucherDate: string;
  supplier: string;
  remarks: string;
  /** every deduction except EWT */
  totalDeductions: number;
  ewt: number;
  /** gross voucher amount */
  amount: number;
  sortingId: number;
  sortBook: string;
  sortName: string;
  /** bank id -> check amount issued for this voucher on that bank */
  bankAmounts: Record<number, number>;
  checkNos: string[];
};

export type VoucherReportData = {
  ym: string;
  label: string;
  /** only the banks that have a check assigned to one of the filtered vouchers */
  banks: VoucherReportBank[];
  rows: VoucherReportRow[];
};

const CHUNK = 100;
const uniq = (xs: any[]) => Array.from(new Set(xs.filter((x) => x != null)));

async function inChunks<T>(ids: number[], run: (chunk: number[]) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await run(ids.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

/** All non-cancelled vouchers dated in the month, with deductions split into EWT / other and the checks issued per bank. */
export async function getVoucherReportData(ym: string): Promise<{ error?: string; data?: VoucherReportData }> {
  await requireModule("voucher");
  const range = parseYm(ym);
  if (!range) return { error: "Choose a month and year." };

  try {
    const { data: vouchers, error } = await supabaseAdmin
      .from("tbl_Voucher")
      .select("id, Voucher_No, Voucher_Date, Supplier_id, Sorting_id, amount, remarks")
      .gte("Voucher_Date", range.start)
      .lt("Voucher_Date", range.end)
      .or("bool_Cancelled.is.null,bool_Cancelled.eq.false")
      .limit(5000);
    if (error) return { error: error.message };
    const vs = vouchers ?? [];
    const ids = vs.map((v: any) => v.id as number);

    const [suppliers, sortings, dedTypes] = await Promise.all([
      supabaseAdmin.from("tbl_Supplier").select("id, Supplier_Name").in("id", uniq(vs.map((v: any) => v.Supplier_id))),
      supabaseAdmin.from("tbl_Acc_Sorting").select("id, Sort_name, sort_book"),
      supabaseAdmin.from("tbl_Deduction").select("id, deduction_name"),
    ]);
    const sname = new Map<number, string>((suppliers.data ?? []).map((s: any) => [s.id, s.Supplier_Name]));
    const sorting = new Map<number, { name: string; book: string }>(
      (sortings.data ?? []).map((s: any) => [s.id, { name: s.Sort_name ?? "", book: s.sort_book ?? "" }]),
    );
    const ewtIds = new Set<number>(
      (dedTypes.data ?? []).filter((d: any) => String(d.deduction_name).trim().toUpperCase() === "EWT").map((d: any) => d.id),
    );
    if (ewtIds.size === 0) ewtIds.add(1); // EWT = 1 in this database

    const deds = await inChunks<any>(ids, (c) =>
      supabaseAdmin.from("tbl_Voucher_Deductions").select("voucher_id, deduction, deduction_id").in("voucher_id", c),
    );
    const vchecks = await inChunks<any>(ids, (c) =>
      supabaseAdmin.from("tbl_Voucher_Check").select("voucher_id, check_id").in("voucher_id", c).not("check_id", "is", null),
    );
    const txIds = uniq(vchecks.map((c) => c.check_id)) as number[];
    const txs = await inChunks<any>(txIds, (c) =>
      supabaseAdmin.from("tbl_Bank_Transactions").select("id, Check_No, Withdrawal, bank_id").in("id", c),
    );
    const tx = new Map<number, any>(txs.map((t) => [t.id, t]));
    const bankRows = await supabaseAdmin.from("tbl_Bank").select("id, bank_name").order("id");
    const bankName = new Map<number, string>((bankRows.data ?? []).map((b: any) => [b.id, b.bank_name]));

    const ewtBy = new Map<number, number>();
    const otherBy = new Map<number, number>();
    for (const d of deds) {
      const target = ewtIds.has(d.deduction_id) ? ewtBy : otherBy;
      target.set(d.voucher_id, (target.get(d.voucher_id) ?? 0) + (d.deduction ?? 0));
    }

    const rows: VoucherReportRow[] = vs.map((v: any) => {
      const bankAmounts: Record<number, number> = {};
      const checkNos: string[] = [];
      for (const c of vchecks.filter((x) => x.voucher_id === v.id)) {
        const t = tx.get(c.check_id);
        if (!t) continue;
        bankAmounts[t.bank_id] = round2((bankAmounts[t.bank_id] ?? 0) + (t.Withdrawal ?? 0));
        checkNos.push(t.Check_No);
      }
      const s = sorting.get(v.Sorting_id);
      return {
        id: v.id,
        voucherNo: v.Voucher_No,
        voucherDate: v.Voucher_Date,
        supplier: sname.get(v.Supplier_id) ?? "",
        remarks: v.remarks ?? "",
        totalDeductions: round2(otherBy.get(v.id) ?? 0),
        ewt: round2(ewtBy.get(v.id) ?? 0),
        amount: round2(v.amount ?? 0),
        sortingId: v.Sorting_id,
        sortBook: s?.book ?? "",
        sortName: s?.name ?? "",
        bankAmounts,
        checkNos,
      };
    });
    rows.sort((a, b) => compareVoucherNo(a.voucherNo, b.voucherNo));

    const usedBankIds = uniq(rows.flatMap((r) => Object.keys(r.bankAmounts).map(Number))) as number[];
    const banks: VoucherReportBank[] = usedBankIds
      .sort((a, b) => a - b)
      .map((id) => ({ id, name: bankName.get(id) ?? `Bank ${id}` }));

    return { data: { ym: range.ym, label: range.label, banks, rows } };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the report." };
  }
}
