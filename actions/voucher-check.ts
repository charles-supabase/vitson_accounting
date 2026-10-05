"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { verifyAppPassword } from "@/lib/app-password";

export type OpenVoucherRow = {
  id: number;
  voucherNo: string;
  voucherDate: string;
  supplierName: string;
  net: number;
  printed: boolean;
  checkIssued: boolean;
  hasCheck: boolean;
};

export type AssignedCheck = {
  txId: number;
  checkNo: string;
  bankId: number | null;
  bankName: string | null;
  dtCheck: string | null;
  payee: string | null;
  payableId: number | null;
  payableName: string | null;
  remark: string | null;
  amount: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const uniq = (xs: any[]) => Array.from(new Set(xs.filter((x) => x != null)));

function refresh() {
  revalidatePath("/voucher");
  revalidatePath("/voucher/create-check");
  revalidatePath("/bank");
}

/**
 * Every voucher that is not cancelled. Red dot = not printed; orange = printed, check not issued;
 * green = printed and check issued. Vouchers still needing work come first.
 */
export async function getOpenVouchers(): Promise<OpenVoucherRow[]> {
  await requireModule("voucher");

  const { data } = await supabaseAdmin
    .from("tbl_Voucher")
    .select("id, Voucher_No, Voucher_Date, Supplier_id, amount, Voucher_Printed, Check_issued")
    .eq("bool_Cancelled", false)
    .order("id", { ascending: true });

  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [{ data: suppliers }, { data: deds }, { data: checks }] = await Promise.all([
    supabaseAdmin.from("tbl_Supplier").select("id, Supplier_Name").in("id", uniq(rows.map((r) => r.Supplier_id))),
    supabaseAdmin.from("tbl_Voucher_Deductions").select("voucher_id, deduction").in("voucher_id", ids),
    supabaseAdmin.from("tbl_Voucher_Check").select("voucher_id").in("voucher_id", ids),
  ]);
  const sname = new Map<number, string>(((suppliers ?? []) as any[]).map((s): [number, string] => [s.id, s.Supplier_Name]));
  const dedTotal = new Map<number, number>();
  for (const d of (deds ?? []) as any[]) dedTotal.set(d.voucher_id, (dedTotal.get(d.voucher_id) ?? 0) + Number(d.deduction));
  const hasCheck = new Set<number>(((checks ?? []) as any[]).map((c) => c.voucher_id));

  const out: OpenVoucherRow[] = rows.map((r) => ({
    id: r.id,
    voucherNo: String(r.Voucher_No),
    voucherDate: r.Voucher_Date,
    supplierName: sname.get(r.Supplier_id) ?? "",
    net: round2(Number(r.amount ?? 0) - (dedTotal.get(r.id) ?? 0)),
    printed: !!r.Voucher_Printed,
    checkIssued: !!r.Check_issued,
    hasCheck: hasCheck.has(r.id),
  }));

  // work to do first (oldest number first), finished vouchers after (newest first)
  const done = (v: OpenVoucherRow) => v.printed && v.checkIssued;
  return [...out.filter((v) => !done(v)), ...out.filter(done).reverse()];
}

export async function getCheckLookups(): Promise<{
  payables: { id: number; label: string }[];
  banks: { id: number; label: string }[];
}> {
  await requireModule("voucher");
  const [{ data: payables }, { data: banks }] = await Promise.all([
    supabaseAdmin.from("tbl_payables").select("id, payable_names").order("payable_names"),
    supabaseAdmin.from("tbl_Bank").select("id, bank_name, active").order("bank_name"),
  ]);
  return {
    payables: ((payables ?? []) as any[]).map((p) => ({ id: p.id, label: p.payable_names })),
    banks: ((banks ?? []) as any[]).filter((b) => b.active !== false).map((b) => ({ id: b.id, label: b.bank_name })),
  };
}

/** Blank checks and DMs for a bank: the ones whose date is still empty. */
export async function getAvailableChecks(bankId: number): Promise<{ id: number; label: string }[]> {
  await requireModule("voucher");
  const { data } = await supabaseAdmin
    .from("tbl_Bank_Transactions")
    .select("id, Check_No")
    .eq("bank_id", bankId)
    .is("dt_check", null)
    .order("Check_No", { ascending: true })
    .limit(1000);
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, label: r.Check_No }));
}

/** The check currently assigned to a voucher, if any. */
export async function getAssignedCheck(voucherId: number): Promise<AssignedCheck | null> {
  await requireModule("voucher");

  const { data: vc } = await supabaseAdmin
    .from("tbl_Voucher_Check")
    .select("check_id, remark, payable_id")
    .eq("voucher_id", voucherId)
    .order("id", { ascending: false })
    .limit(1);
  const row = ((vc ?? []) as any[])[0];
  if (!row) return null;

  const { data: tx } = await supabaseAdmin
    .from("tbl_Bank_Transactions")
    .select('id, "Check_No", dt_check, "Payee", "Withdrawal", bank_id')
    .eq("id", row.check_id)
    .maybeSingle();
  const t = tx as any;
  if (!t) return null;

  const [{ data: bank }, { data: payable }] = await Promise.all([
    t.bank_id != null
      ? supabaseAdmin.from("tbl_Bank").select("bank_name").eq("id", t.bank_id).maybeSingle()
      : Promise.resolve({ data: null }),
    row.payable_id != null
      ? supabaseAdmin.from("tbl_payables").select("payable_names").eq("id", row.payable_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    txId: t.id,
    checkNo: t.Check_No,
    bankId: t.bank_id ?? null,
    bankName: (bank as any)?.bank_name ?? null,
    dtCheck: t.dt_check ?? null,
    payee: t.Payee ?? null,
    payableId: row.payable_id ?? null,
    payableName: (payable as any)?.payable_names ?? null,
    remark: row.remark ?? null,
    amount: t.Withdrawal ?? null,
  };
}

/* ---------- writes ---------- */

export async function assignCheck(input: {
  voucherId: number;
  checkTxId: number;
  date: string;
  payableId: number | null;
  remark: string;
}): Promise<{ error?: string }> {
  await requireModule("voucher");

  if (!input.voucherId) return { error: "Select a voucher." };
  if (!input.checkTxId) return { error: "Select a check or DM number." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Check date is required." };

  // Original vouchers use banks WITHOUT the "Y_" prefix; Duplicate vouchers only banks WITH it
  const { data: vRow } = await supabaseAdmin.from("tbl_Voucher").select("Voucher_type_id").eq("id", input.voucherId).maybeSingle();
  const { data: txRow } = await supabaseAdmin.from("tbl_Bank_Transactions").select("bank_id").eq("id", input.checkTxId).maybeSingle();
  if (vRow && txRow && (txRow as any).bank_id != null) {
    const { data: bankRow } = await supabaseAdmin.from("tbl_Bank").select("bank_name").eq("id", (txRow as any).bank_id).maybeSingle();
    const name = String((bankRow as any)?.bank_name ?? "");
    const isDuplicate = Number((vRow as any).Voucher_type_id) === 2;
    if (isDuplicate && !name.startsWith("Y_")) return { error: "A duplicate voucher can only use a bank whose name starts with Y_." };
    if (!isDuplicate && name.startsWith("Y_")) return { error: "An original voucher can't use a bank whose name starts with Y_." };
  }

  const { error } = await supabaseAdmin.rpc("voucher_assign_check", {
    p_voucher_id: input.voucherId,
    p_check_tx_id: input.checkTxId,
    p_date: input.date,
    p_payable_id: input.payableId,
    p_remark: input.remark,
  });
  if (error) return { error: error.message };
  refresh();
  return {};
}

async function simpleRpc(fn: string, voucherId: number): Promise<{ error?: string }> {
  await requireModule("voucher");
  if (!voucherId) return { error: "Select a voucher." };
  const { error } = await supabaseAdmin.rpc(fn, { p_voucher_id: voucherId });
  if (error) return { error: error.message };
  refresh();
  return {};
}

export async function markVoucherPrinted(voucherId: number) {
  return simpleRpc("voucher_mark_printed", voucherId);
}
export async function markCheckIssued(voucherId: number) {
  return simpleRpc("voucher_mark_check_issued", voucherId);
}
/** Cancelling a check needs the check-cancellation password (tbl_App_Settings: check_cancel_password). */
export async function cancelCheck(voucherId: number, password: string) {
  await requireModule("voucher");
  const check = await verifyAppPassword(["check_cancel_password"], password);
  if (!check.ok) return { error: check.error };
  return simpleRpc("voucher_cancel_check", voucherId);
}
export async function cancelVoucher(voucherId: number) {
  return simpleRpc("voucher_cancel", voucherId);
}
