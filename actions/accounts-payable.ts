"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";

export type ApRow = {
  supplier_id: number;
  supplier_name: string;
  due_month: string; // yyyy-mm-01
  amount: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Reads every row of a query, a page at a time (the API caps a single response at 1000 rows). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

/** yyyy-mm-dd plus whole days, as yyyy-mm-dd (UTC arithmetic, so no timezone drift). */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/**
 * Amounts still owed to suppliers:
 *  - received items that are not on a voucher yet (gross amount), and
 *  - vouchers that have no check assigned or issued (net amount, after deductions).
 * Once a check is assigned to a voucher it is in the bank records, so it drops out.
 * Bucketed by due month = date received + the supplier's terms (days).
 * year / month filter the due month; month is only used together with a year.
 */
export async function getApSummary(
  supplierId: number | null,
  year: number | null,
  month: number | null
): Promise<ApRow[]> {
  await requireModule("accounts_payable");

  if (year != null && (!Number.isInteger(year) || year < 2000 || year > 2099)) throw new Error("Invalid year.");
  if (month != null && (!Number.isInteger(month) || month < 1 || month > 12)) throw new Error("Invalid month.");

  const { data: supplierRows } = await supabaseAdmin.from("tbl_Supplier").select("id, Supplier_Name, terms");
  const supplier = new Map<number, { name: string; terms: number }>(
    ((supplierRows ?? []) as any[]).map((s): [number, { name: string; terms: number }] => [
      s.id,
      { name: s.Supplier_Name, terms: s.terms ?? 0 },
    ])
  );

  type Entry = { sid: number; due: string; amount: number };
  const entries: Entry[] = [];

  // 1) received, not yet on a voucher
  const loose = await fetchAll<any>((from, to) =>
    supabaseAdmin
      .from("tbl_Recieving")
      .select("id, supplier_id, dt_recieved, qty, price")
      .is("voucher_id", null)
      .not("dt_recieved", "is", null)
      .order("id")
      .range(from, to)
  );
  for (const r of loose) {
    const sup = supplier.get(r.supplier_id);
    entries.push({
      sid: r.supplier_id,
      due: addDays(r.dt_recieved, sup?.terms ?? 0),
      amount: round2(Number(r.qty) * Number(r.price)),
    });
  }

  // 2) vouchers with no check assigned or issued
  const vouchers = await fetchAll<any>((from, to) =>
    supabaseAdmin
      .from("tbl_Voucher")
      .select("id, Supplier_id, Voucher_Date, amount")
      .eq("bool_Cancelled", false)
      .eq("Check_issued", false)
      .order("id")
      .range(from, to)
  );

  if (vouchers.length > 0) {
    const ids = vouchers.map((v) => v.id);
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200));

    const withCheck = new Set<number>();
    const dedTotal = new Map<number, number>();
    const firstReceived = new Map<number, string>();

    for (const chunk of chunks) {
      const [{ data: checks }, { data: deds }, { data: recv }] = await Promise.all([
        supabaseAdmin.from("tbl_Voucher_Check").select("voucher_id").in("voucher_id", chunk),
        supabaseAdmin.from("tbl_Voucher_Deductions").select("voucher_id, deduction").in("voucher_id", chunk),
        supabaseAdmin.from("tbl_Recieving").select("voucher_id, dt_recieved").in("voucher_id", chunk),
      ]);
      for (const c of (checks ?? []) as any[]) withCheck.add(c.voucher_id);
      for (const d of (deds ?? []) as any[]) dedTotal.set(d.voucher_id, (dedTotal.get(d.voucher_id) ?? 0) + Number(d.deduction));
      for (const r of (recv ?? []) as any[]) {
        if (!r.dt_recieved) continue;
        const cur = firstReceived.get(r.voucher_id);
        if (!cur || r.dt_recieved < cur) firstReceived.set(r.voucher_id, r.dt_recieved);
      }
    }

    for (const v of vouchers) {
      if (withCheck.has(v.id)) continue; // a check is assigned: it is already in the bank records
      const sup = supplier.get(v.Supplier_id);
      const base = firstReceived.get(v.id) ?? v.Voucher_Date;
      entries.push({
        sid: v.Supplier_id,
        due: addDays(base, sup?.terms ?? 0),
        amount: round2(Number(v.amount ?? 0) - (dedTotal.get(v.id) ?? 0)),
      });
    }
  }

  // bucket by supplier and due month, applying the filters
  const buckets = new Map<string, ApRow>();
  for (const e of entries) {
    if (supplierId != null && e.sid !== supplierId) continue;
    const y = Number(e.due.slice(0, 4));
    const m = Number(e.due.slice(5, 7));
    if (year != null && y !== year) continue;
    if (year != null && month != null && m !== month) continue;

    const dueMonth = `${e.due.slice(0, 7)}-01`;
    const key = `${e.sid}|${dueMonth}`;
    const row = buckets.get(key) ?? {
      supplier_id: e.sid,
      supplier_name: supplier.get(e.sid)?.name ?? `Supplier #${e.sid}`,
      due_month: dueMonth,
      amount: 0,
    };
    row.amount = round2(row.amount + e.amount);
    buckets.set(key, row);
  }

  return Array.from(buckets.values())
    .filter((r) => r.amount !== 0)
    .sort((a, b) => a.supplier_name.localeCompare(b.supplier_name) || a.due_month.localeCompare(b.due_month));
}

/** Suppliers that are currently owed something, for the filter dropdown. */
export async function getApSuppliers(): Promise<{ id: number; label: string }[]> {
  const rows = await getApSummary(null, null, null);
  const seen = new Map<number, string>();
  for (const r of rows) seen.set(r.supplier_id, r.supplier_name);
  return Array.from(seen.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
