"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";

/* ---------- types ---------- */

export type ReceivingSupplierOption = {
  id: number;
  label: string;
  openLines: number;
};

export type OpenPoLine = {
  detailId: number;
  poId: number;
  poNo: number;
  dtDelivery: string | null;
  itemId: number;
  itemName: string;
  unitName: string;
  qty: number;
  price: number;
  discount: number;
  remarks: string | null;
  destination: string | null;
};

export type ReceivePoLineInput = {
  detailId: number;
  drInvNo: string;
  newInvNo: string;
  dtRecieved: string;
  qty: number;
  destination: string;
  remarks: string;
};

export type ReceivePoLineResult = {
  error?: string;
  balanceQty?: number;
};

/* ---------- reads ---------- */

const OPEN_FLAG_FILTER = "bool_plant_recieved.is.null,bool_plant_recieved.eq.false";

/** Suppliers that have at least one PO line still waiting to be received. */
export async function getSuppliersWithOpenLines(): Promise<ReceivingSupplierOption[]> {
  await requireModule("receiving");

  const { data: lines } = await supabaseAdmin
    .from("tbl_PO_details")
    .select("PO_id")
    .or(OPEN_FLAG_FILTER)
    .gt("qty", 0);

  const rows = (lines ?? []) as any[];
  if (rows.length === 0) return [];

  const poIds = Array.from(new Set(rows.map((r) => r.PO_id)));
  const { data: pos } = await supabaseAdmin
    .from("tbl_Purchase_Order")
    .select("id, supplier_id")
    .in("id", poIds);

  const supplierByPo = new Map<number, number>(
    ((pos ?? []) as any[]).map((p): [number, number] => [p.id, p.supplier_id])
  );

  const countBySupplier = new Map<number, number>();
  for (const r of rows) {
    const sid = supplierByPo.get(r.PO_id);
    if (sid == null) continue;
    countBySupplier.set(sid, (countBySupplier.get(sid) ?? 0) + 1);
  }

  const supplierIds = Array.from(countBySupplier.keys());
  if (supplierIds.length === 0) return [];

  const { data: suppliers } = await supabaseAdmin
    .from("tbl_Supplier")
    .select("id, Supplier_Name")
    .in("id", supplierIds);

  return ((suppliers ?? []) as any[])
    .map((s) => ({
      id: s.id as number,
      label: s.Supplier_Name as string,
      openLines: countBySupplier.get(s.id) ?? 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Active (not yet plant-received, not cancelled) PO lines for one supplier. */
export async function getOpenLinesForSupplier(supplierId: number): Promise<OpenPoLine[]> {
  await requireModule("receiving");

  const { data: pos } = await supabaseAdmin
    .from("tbl_Purchase_Order")
    .select("id, po_no, dt_Delivery, destination")
    .eq("supplier_id", supplierId);

  const poRows = (pos ?? []) as any[];
  if (poRows.length === 0) return [];
  const poMap = new Map<number, any>(poRows.map((p): [number, any] => [p.id, p]));

  const { data: details } = await supabaseAdmin
    .from("tbl_PO_details")
    .select("id, PO_id, item_id, unit_id, qty, price, discount, remarks")
    .in("PO_id", poRows.map((p) => p.id))
    .or(OPEN_FLAG_FILTER)
    .gt("qty", 0);

  const ds = (details ?? []) as any[];
  if (ds.length === 0) return [];

  const uniq = (xs: any[]) => Array.from(new Set(xs.filter((x) => x != null)));
  const [{ data: items }, { data: units }] = await Promise.all([
    supabaseAdmin.from("tbl_Item").select("id, item_name").in("id", uniq(ds.map((d) => d.item_id))),
    supabaseAdmin.from("tbl_Unit").select("id, unit_name").in("id", uniq(ds.map((d) => d.unit_id))),
  ]);

  const itemName = new Map<number, string>(((items ?? []) as any[]).map((i): [number, string] => [i.id, i.item_name]));
  const unitName = new Map<number, string>(((units ?? []) as any[]).map((u): [number, string] => [u.id, u.unit_name]));

  const result: OpenPoLine[] = ds.map((d) => {
    const po = poMap.get(d.PO_id);
    return {
      detailId: d.id,
      poId: d.PO_id,
      poNo: po?.po_no ?? 0,
      dtDelivery: po?.dt_Delivery ?? null,
      itemId: d.item_id,
      itemName: itemName.get(d.item_id) ?? `Item #${d.item_id}`,
      unitName: unitName.get(d.unit_id) ?? "",
      qty: Number(d.qty),
      price: Number(d.price),
      discount: Number(d.discount ?? 0),
      remarks: d.remarks ?? null,
      destination: po?.destination ?? null,
    };
  });

  // Earliest expected delivery first, then PO number, then line id.
  result.sort((a, b) => {
    const da = a.dtDelivery ?? "9999-12-31";
    const db = b.dtDelivery ?? "9999-12-31";
    return da.localeCompare(db) || a.poNo - b.poNo || a.detailId - b.detailId;
  });
  return result;
}

/* ---------- writes ---------- */

export async function receivePoLine(input: ReceivePoLineInput): Promise<ReceivePoLineResult> {
  await requireModule("receiving");

  if (!input.detailId) return { error: "No PO line selected." };
  if (!input.drInvNo || input.drInvNo.trim() === "") return { error: "DR / invoice number is required." };
  if (!input.dtRecieved) return { error: "Date received is required." };
  if (!(input.qty > 0)) return { error: "Received quantity must be greater than zero." };

  const { data, error } = await supabaseAdmin.rpc("receive_po_line", {
    p_po_detail_id: input.detailId,
    p_dr_inv_no: input.drInvNo.trim(),
    p_new_inv_no: input.newInvNo.trim(),
    p_dt_recieved: input.dtRecieved,
    p_qty: input.qty,
    p_destination: input.destination.trim(),
    p_remarks: input.remarks.trim(),
  });

  if (error || !data) {
    return { error: `Could not save receiving: ${error?.message ?? "unknown error"}` };
  }

  revalidatePath("/receiving");
  const row = (data as { new_receiving_id: number; balance_detail_id: number | null; balance_qty: number }[])[0];
  return { balanceQty: row?.balance_qty ?? 0 };
}

export async function cancelPoLine(
  detailId: number,
  cancelDate: string // yyyy-mm-dd, the user's local date
): Promise<{ error?: string }> {
  await requireModule("receiving");

  if (!detailId) return { error: "No PO line selected." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cancelDate)) return { error: "Invalid cancellation date." };

  const { error } = await supabaseAdmin.rpc("cancel_po_line", {
    p_po_detail_id: detailId,
    p_cancel_date: cancelDate,
  });
  if (error) return { error: `Could not cancel this item: ${error.message}` };

  revalidatePath("/receiving");
  revalidatePath("/purchase-order");
  return {};
}
