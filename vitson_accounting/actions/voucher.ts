"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { VOUCHER_SUFFIX, type VoucherTypeId } from "@/lib/voucher-types";

/* ---------- types ---------- */

export type VoucherSupplierOption = {
  id: number;
  label: string;
  openLines: number;
  discountPercent: number | null;
};

export type VoucherLine = {
  receivingId: number;
  dtRecieved: string;
  poNo: number | null;
  drInvNo: string;
  newInvNo: string;
  itemName: string;
  amount: number;
  accBookId: number | null;
  accBookName: string | null;
  accCategoryId: number | null;
  accCategoryName: string | null;
  accSortingId: number | null;
  accSortingName: string | null;
};

export type VoucherOption = { id: number; no: string; typeId: number; label: string; columns: string[] };

export type VoucherLookups = {
  vouchers: VoucherOption[];
  suppliers: VoucherSupplierOption[];
  sortings: { id: number; label: string }[];
  deductions: { id: number; label: string; isEwt: boolean; isDiscount: boolean }[];
  /** the biggest voucher number of each type, e.g. "125-A" and "48-B" */
  latestVoucherNos: { 1: string | null; 2: string | null };
};

export type EwtType = "goods" | "service" | "professional";

export type VoucherDeductionInput = {
  deductionId: number;
  amount: number;
  ewtType: EwtType | null;
  discountRate: number | null;
  remarks: string;
};

export type CreateVoucherInput = {
  /** just the digits the user typed; the -A / -B suffix is added from the type */
  voucherNo: number;
  typeId: VoucherTypeId;
  voucherDate: string; // yyyy-mm-dd
  supplierId: number;
  sortingId: number;
  receivingIds: number[];
  deductions: VoucherDeductionInput[];
};

export type UpdateVoucherInput = {
  voucherId: number;
  voucherDate: string;
  sortingId: number;
  receivingIds: number[];
  deductions: VoucherDeductionInput[];
};

export type VoucherDetail = {
  id: number;
  voucherNo: string;
  typeId: number;
  voucherDate: string;
  supplierId: number;
  supplierName: string;
  supplierDiscountPercent: number | null;
  sortingId: number | null;
  sortingName: string | null;
  printed: boolean;
  checkIssued: boolean;
  cancelled: boolean;
  hasCheck: boolean;
  isPettyCash: boolean;
  lines: VoucherLine[];
  deductions: {
    deductionId: number;
    deductionName: string;
    amount: number;
    remarks: string | null;
    ewtType: EwtType | null;
    discountRate: number | null;
  }[];
  gross: number;
  totalDeductions: number;
  net: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const uniq = (xs: any[]) => Array.from(new Set(xs.filter((x) => x != null)));

/* ---------- helpers ---------- */

async function toLines(rows: any[]): Promise<VoucherLine[]> {
  if (rows.length === 0) return [];
  const [{ data: items }, { data: pos }, { data: books }, { data: cats }, { data: sorts }] = await Promise.all([
    supabaseAdmin.from("tbl_Item").select("id, item_name").in("id", uniq(rows.map((r) => r.item_id))),
    supabaseAdmin.from("tbl_Purchase_Order").select("id, po_no").in("id", uniq(rows.map((r) => r.purchase_id))),
    supabaseAdmin.from("tbl_Acc_Book").select("id, Book_Name").in("id", uniq(rows.map((r) => r.Acc_Book_id))),
    supabaseAdmin.from("tbl_Acc_Category").select("id, Acc_Category_Name").in("id", uniq(rows.map((r) => r.Acc_Category_id))),
    supabaseAdmin.from("tbl_Acc_Sorting").select("id, Sort_name").in("id", uniq(rows.map((r) => r.Acc_Sorting_id))),
  ]);
  const sortName = new Map<number, string>(((sorts ?? []) as any[]).map((a): [number, string] => [a.id, a.Sort_name]));
  const bookName = new Map<number, string>(((books ?? []) as any[]).map((b): [number, string] => [b.id, b.Book_Name]));
  const catName = new Map<number, string>(((cats ?? []) as any[]).map((c): [number, string] => [c.id, c.Acc_Category_Name]));
  const itemName = new Map<number, string>(((items ?? []) as any[]).map((i): [number, string] => [i.id, i.item_name]));
  const poNo = new Map<number, number>(((pos ?? []) as any[]).map((p): [number, number] => [p.id, p.po_no]));

  return rows.map((r) => ({
    receivingId: r.id,
    dtRecieved: r.dt_recieved,
    poNo: poNo.get(r.purchase_id) ?? null,
    drInvNo: r["dr-inv_no"] ?? "",
    newInvNo: r.new_inv_no ?? "",
    itemName: itemName.get(r.item_id) ?? `Item #${r.item_id}`,
    amount: round2(Number(r.qty) * Number(r.price)),
    accBookId: r.Acc_Book_id ?? null,
    accBookName: r.Acc_Book_id != null ? (bookName.get(r.Acc_Book_id) ?? null) : null,
    accCategoryId: r.Acc_Category_id ?? null,
    accCategoryName: r.Acc_Category_id != null ? (catName.get(r.Acc_Category_id) ?? null) : null,
    accSortingId: r.Acc_Sorting_id ?? null,
    accSortingName: r.Acc_Sorting_id != null ? (sortName.get(r.Acc_Sorting_id) ?? null) : null,
  }));
}

const RECEIVING_COLS = 'id, dt_recieved, "dr-inv_no", new_inv_no, qty, price, item_id, purchase_id, "Acc_Book_id", "Acc_Category_id", "Acc_Sorting_id"';

/** The number part of "125-A" (125), used to find the biggest voucher number of a type. */
const numberPart = (no: string) => Number.parseInt(no, 10) || 0;

/** Every voucher (newest first), for the "find voucher" dropdowns: number, date, supplier, net amount. */
export async function getVoucherOptions(): Promise<VoucherOption[]> {
  await requireModule("voucher");
  const { data } = await supabaseAdmin
    .from("tbl_Voucher")
    .select("id, Voucher_No, Voucher_type_id, Voucher_Date, Supplier_id, amount, bool_Cancelled")
    .order("id", { ascending: false });
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  const [{ data: suppliers }, { data: deds }] = await Promise.all([
    supabaseAdmin.from("tbl_Supplier").select("id, Supplier_Name").in("id", uniq(rows.map((r) => r.Supplier_id))),
    supabaseAdmin.from("tbl_Voucher_Deductions").select("voucher_id, deduction").in("voucher_id", rows.map((r) => r.id)),
  ]);
  const sname = new Map<number, string>(((suppliers ?? []) as any[]).map((s): [number, string] => [s.id, s.Supplier_Name]));
  const dedTotal = new Map<number, number>();
  for (const d of (deds ?? []) as any[]) dedTotal.set(d.voucher_id, (dedTotal.get(d.voucher_id) ?? 0) + Number(d.deduction));

  const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return rows.map((r) => {
    const net = round2(Number(r.amount ?? 0) - (dedTotal.get(r.id) ?? 0));
    const date = formatDate(r.Voucher_Date);
    const supplier = `${sname.get(r.Supplier_id) ?? ""}${r.bool_Cancelled ? " (cancelled)" : ""}`;
    const no = String(r.Voucher_No);
    return {
      id: r.id,
      no,
      typeId: Number(r.Voucher_type_id ?? 1),
      label: `${no} · ${date} · ${supplier} · ${money(net)}`,
      columns: [no, date, supplier, money(net)],
    };
  });
}

/* ---------- reads ---------- */

/** Suppliers with received items not yet on a voucher, plus the other dropdown data. */
export async function getVoucherLookups(): Promise<VoucherLookups> {
  await requireModule("voucher");

  const [vouchers, { data: open }, { data: sortings }, { data: deductions }, { data: latest }] = await Promise.all([
    getVoucherOptions(),
    supabaseAdmin.from("tbl_Recieving").select("supplier_id").is("voucher_id", null),
    supabaseAdmin.from("tbl_Acc_Sorting").select("id, Sort_name").order("Sort_name"),
    supabaseAdmin.from("tbl_Deduction").select("id, deduction_name").order("id"),
    supabaseAdmin.from("tbl_Voucher").select("Voucher_No, Voucher_type_id").order("id", { ascending: false }).limit(1000),
  ]);

  const counts = new Map<number, number>();
  for (const r of (open ?? []) as any[]) counts.set(r.supplier_id, (counts.get(r.supplier_id) ?? 0) + 1);

  let suppliers: VoucherSupplierOption[] = [];
  if (counts.size > 0) {
    const { data } = await supabaseAdmin
      .from("tbl_Supplier")
      .select("id, Supplier_Name, discount_percent")
      .in("id", Array.from(counts.keys()));
    suppliers = ((data ?? []) as any[])
      .map((s) => ({
        id: s.id as number,
        label: s.Supplier_Name as string,
        openLines: counts.get(s.id) ?? 0,
        discountPercent: s.discount_percent ?? null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  return {
    vouchers,
    suppliers,
    sortings: ((sortings ?? []) as any[]).map((s) => ({ id: s.id, label: s.Sort_name })),
    deductions: ((deductions ?? []) as any[]).map((d) => {
      const name = String(d.deduction_name).trim().toUpperCase();
      return { id: d.id, label: d.deduction_name, isEwt: name === "EWT", isDiscount: name === "DISCOUNT" };
    }),
    latestVoucherNos: (() => {
      const best: { 1: { n: number; no: string } | null; 2: { n: number; no: string } | null } = { 1: null, 2: null };
      for (const r of (latest ?? []) as any[]) {
        const t = Number(r.Voucher_type_id) === 2 ? 2 : 1;
        const no = String(r.Voucher_No);
        const n = numberPart(no);
        if (!best[t] || n > best[t]!.n) best[t] = { n, no };
      }
      return { 1: best[1]?.no ?? null, 2: best[2]?.no ?? null };
    })(),
  };
}

/**
 * Received items for one supplier that are not on a voucher yet.
 * By default only the items that normally belong to the tab: Original items carry a new invoice no.,
 * Duplicate items have only a DR / invoice no. With showAll every item of the supplier is listed.
 */
export async function getVoucherableLines(
  supplierId: number,
  typeId: VoucherTypeId = 1,
  showAll = false
): Promise<VoucherLine[]> {
  await requireModule("voucher");

  let q = supabaseAdmin
    .from("tbl_Recieving")
    .select(RECEIVING_COLS)
    .eq("supplier_id", supplierId)
    .is("voucher_id", null);

  if (!showAll) {
    q = typeId === 1 ? q.not("new_inv_no", "is", null).neq("new_inv_no", "") : q.or("new_inv_no.is.null,new_inv_no.eq.");
  }

  const { data } = await q.order("dt_recieved", { ascending: true }).order("id", { ascending: true });
  return toLines((data ?? []) as any[]);
}

/** True when a voucher with this number and type already exists (cancelled ones keep their number). */
export async function voucherNoExists(voucherNo: number, typeId: VoucherTypeId): Promise<boolean> {
  await requireModule("voucher");
  if (!Number.isInteger(voucherNo) || voucherNo <= 0) return false;
  const full = `${voucherNo}${VOUCHER_SUFFIX[typeId]}`;
  const { data } = await supabaseAdmin.from("tbl_Voucher").select("id").eq("Voucher_No", full).limit(1);
  return ((data ?? []) as any[]).length > 0;
}

/** One voucher with its items and deductions, looked up by voucher number or by id. */
export async function getVoucherDetail(key: { no?: string; id?: number }): Promise<VoucherDetail | null> {
  await requireModule("voucher");

  let q = supabaseAdmin
    .from("tbl_Voucher")
    .select("id, Voucher_No, Voucher_type_id, Voucher_Date, Supplier_id, Sorting_id, amount, Voucher_Printed, Check_issued, bool_Cancelled");
  if (key.id != null) q = q.eq("id", key.id);
  else if (key.no != null) q = q.eq("Voucher_No", key.no);
  else return null;

  const { data: vRows } = await q.limit(1);
  const v = ((vRows ?? []) as any[])[0];
  if (!v) return null;

  const [{ data: supplier }, { data: sorting }, { data: recv }, { data: deds }, { data: checks }] = await Promise.all([
    supabaseAdmin.from("tbl_Supplier").select("Supplier_Name, discount_percent").eq("id", v.Supplier_id).maybeSingle(),
    v.Sorting_id != null
      ? supabaseAdmin.from("tbl_Acc_Sorting").select("Sort_name").eq("id", v.Sorting_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from("tbl_Recieving").select(RECEIVING_COLS).eq("voucher_id", v.id).order("dt_recieved").order("id"),
    supabaseAdmin
      .from("tbl_Voucher_Deductions")
      .select("id, deduction, deduction_id, remarks, ewt_type, discount_rate")
      .eq("voucher_id", v.id)
      .order("id"),
    supabaseAdmin.from("tbl_Voucher_Check").select("id").eq("voucher_id", v.id).limit(1),
  ]);

  const dedRows = (deds ?? []) as any[];
  const { data: dedNames } = dedRows.length
    ? await supabaseAdmin.from("tbl_Deduction").select("id, deduction_name").in("id", uniq(dedRows.map((d) => d.deduction_id)))
    : { data: [] as any[] };
  const dedName = new Map<number, string>(((dedNames ?? []) as any[]).map((d): [number, string] => [d.id, d.deduction_name]));

  const lines = await toLines((recv ?? []) as any[]);
  const gross = round2(lines.reduce((a, l) => a + l.amount, 0));
  const totalDeductions = round2(dedRows.reduce((a, d) => a + Number(d.deduction), 0));

  return {
    id: v.id,
    voucherNo: String(v.Voucher_No),
    typeId: Number(v.Voucher_type_id ?? 1),
    voucherDate: v.Voucher_Date,
    supplierId: v.Supplier_id,
    supplierName: (supplier as any)?.Supplier_Name ?? "",
    supplierDiscountPercent: (supplier as any)?.discount_percent ?? null,
    sortingId: v.Sorting_id ?? null,
    sortingName: (sorting as any)?.Sort_name ?? null,
    printed: !!v.Voucher_Printed,
    checkIssued: !!v.Check_issued,
    cancelled: !!v.bool_Cancelled,
    hasCheck: ((checks ?? []) as any[]).length > 0,
    isPettyCash: String((supplier as any)?.Supplier_Name ?? "").trim().toUpperCase() === "SM PETTY CASH",
    lines,
    deductions: dedRows.map((d) => ({
      deductionId: d.deduction_id,
      deductionName: dedName.get(d.deduction_id) ?? `#${d.deduction_id}`,
      amount: round2(Number(d.deduction)),
      remarks: d.remarks ?? null,
      ewtType: (d.ewt_type ?? null) as EwtType | null,
      discountRate: d.discount_rate ?? null,
    })),
    gross,
    totalDeductions,
    net: round2(gross - totalDeductions),
  };
}

/* ---------- writes ---------- */

function rpcDeductions(deductions: VoucherDeductionInput[]) {
  return deductions.map((d) => ({
    deduction_id: d.deductionId,
    amount: d.amount,
    ewt_type: d.ewtType,
    discount_rate: d.discountRate,
    remarks: d.remarks.trim(),
  }));
}

export async function createVoucher(
  input: CreateVoucherInput
): Promise<{ error?: string; voucherNo?: string; net?: number }> {
  await requireModule("voucher");

  if (input.typeId !== 1 && input.typeId !== 2) return { error: "Choose the Original or Duplicate tab." };
  if (!Number.isInteger(input.voucherNo) || input.voucherNo <= 0) return { error: "Enter a valid voucher number." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.voucherDate)) return { error: "Voucher date is required." };
  if (!input.supplierId) return { error: "Select a supplier." };
  if (!input.sortingId) return { error: "Select a sorting." };
  if (input.receivingIds.length === 0) return { error: "Add at least one item to the voucher." };

  const { data, error } = await supabaseAdmin.rpc("create_voucher", {
    p_voucher_no: input.voucherNo,
    p_type_id: input.typeId,
    p_date: input.voucherDate,
    p_supplier_id: input.supplierId,
    p_sorting_id: input.sortingId,
    p_receiving_ids: input.receivingIds,
    p_deductions: rpcDeductions(input.deductions),
  });
  if (error) return { error: error.message };

  revalidatePath("/voucher");
  const row = (data as { net: number; new_voucher_no: string }[] | null)?.[0];
  return {
    voucherNo: row?.new_voucher_no ?? `${input.voucherNo}${VOUCHER_SUFFIX[input.typeId]}`,
    net: row ? Number(row.net) : undefined,
  };
}

export async function updateVoucher(input: UpdateVoucherInput): Promise<{ error?: string; net?: number }> {
  await requireModule("voucher");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.voucherDate)) return { error: "Voucher date is required." };
  if (!input.sortingId) return { error: "Select a sorting." };
  if (input.receivingIds.length === 0) return { error: "A voucher needs at least one item." };

  const { data, error } = await supabaseAdmin.rpc("update_voucher", {
    p_voucher_id: input.voucherId,
    p_date: input.voucherDate,
    p_sorting_id: input.sortingId,
    p_receiving_ids: input.receivingIds,
    p_deductions: rpcDeductions(input.deductions),
  });
  if (error) return { error: error.message };

  revalidatePath("/voucher");
  const row = (data as { net: number }[] | null)?.[0];
  return { net: row ? Number(row.net) : undefined };
}

/** Stores a supplier's discount rate so later vouchers pick it up by default. */
export async function setSupplierDiscount(supplierId: number, rate: number): Promise<{ error?: string }> {
  await requireModule("voucher");
  if (!supplierId) return { error: "Select a supplier." };
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { error: "Discount rate must be between 0 and 100." };

  const { error } = await supabaseAdmin.from("tbl_Supplier").update({ discount_percent: rate }).eq("id", supplierId);
  if (error) return { error: error.message };
  revalidatePath("/voucher");
  return {};
}
