"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";

export type RequisitionDetailInput = {
  itemId: number;
  unitId: number;
  onHand: number | null;
  onHandRecipe: number | null;
  onHandDaily: number | null;
  qty: number;
  supplierId: number | null;
  boolRush: boolean;
  remarks: string;
  itemPackaging: number | null;
  price: number | null;
};

export type RequisitionHeaderInput = {
  dtRequest: string; // yyyy-mm-dd
  accBookId: number;
  remark: string;
  projectId: number | null;
};

export type CreateRequisitionResult = { error?: string; id?: number; requestNo?: number };

export async function createRequisition(
  header: RequisitionHeaderInput,
  details: RequisitionDetailInput[]
): Promise<CreateRequisitionResult> {
  const session = await requireModule("requisition");

  if (!header.dtRequest) return { error: "Request date is required." };
  if (!header.accBookId) return { error: "Account book is required." };
  if (!details || details.length === 0) return { error: "Add at least one item line." };
  for (const d of details) {
    if (!d.itemId || !d.unitId || !d.qty || d.qty <= 0) {
      return { error: "Every line needs an item, a unit, and a quantity greater than zero." };
    }
  }

  const { data, error } = await supabaseAdmin.rpc("create_requisition", {
    p_dt_request: header.dtRequest,
    p_acc_book_id: header.accBookId,
    p_remark: header.remark || null,
    p_project_id: header.projectId,
    p_created_by: session.userId,
    p_details: details.map((d) => ({
      item_id: d.itemId,
      unit_id: d.unitId,
      on_hand: d.onHand ?? "",
      on_hand_recipe: d.onHandRecipe ?? "",
      on_hand_daily: d.onHandDaily ?? "",
      qty: d.qty,
      supplier_id: d.supplierId ?? "",
      bool_rush: d.boolRush,
      remarks: d.remarks || "",
      item_packaging: d.itemPackaging ?? "",
      price: d.price ?? "",
    })),
  });

  if (error || !data || data.length === 0) {
    return { error: `Could not save requisition: ${error?.message ?? "unknown error"}` };
  }

  revalidatePath("/requisition");
  return { id: data[0].id, requestNo: data[0].request_no };
}

export async function decideRequisition(
  requisitionId: number,
  decision: "APPROVED" | "REJECTED"
): Promise<{ error?: string }> {
  const session = await requireModule("requisition");

  const { error } = await supabaseAdmin
    .from("tbl_Requisition")
    .update({
      status: decision,
      approved_by: session.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", requisitionId)
    .eq("status", "PENDING"); // only a still-pending requisition can be decided

  if (error) return { error: error.message };

  revalidatePath("/requisition");
  revalidatePath(`/requisition/${requisitionId}`);
  return {};
}

export type ItemOnHand = {
  onHand: number;
  onHandOverall: number;
  /** The item name with everything from the first "(" removed, e.g. "BLACK VSF (ATK)" -> "BLACK VSF" */
  baseItem: string;
  onHandRecipe: number;
  onHandDaily: number;
};

const baseItemName = (name: string) => name.split("(")[0].trim();

/**
 * Stock on hand for an item, computed from tbl_Item_Inventory:
 *  - onHand        = sum(purchased_qty) - sum(actual_withdrawn_qty)
 *  - onHandRecipe  = sum(purchased_qty) - sum(recipe_withdrawn_qty)
 *  - onHandDaily   = sum(purchased_qty) - sum(daily_withdrawn_qty)
 */
export async function getItemOnHand(itemId: number): Promise<ItemOnHand> {
  await requireModule("requisition");
  const { data, error } = await supabaseAdmin.rpc("get_item_on_hand_all", { p_item_id: itemId });
  const row = (data as { on_hand: number; on_hand_recipe: number; on_hand_daily: number }[] | null)?.[0];
  if (error || !row) {
    if (error) console.error("get_item_on_hand_all failed:", error.message);
  }

  // Overall: the on hand of every item that shares this item's base name (the part before the first "(")
  let baseItem = "";
  let overall = row?.on_hand ?? 0;
  try {
    const { data: item } = await supabaseAdmin.from("tbl_Item").select("item_name").eq("id", itemId).maybeSingle();
    const name = ((item as { item_name?: string } | null)?.item_name ?? "").toString();
    baseItem = baseItemName(name);

    if (baseItem) {
      const pattern = baseItem.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: sibs } = await supabaseAdmin
        .from("tbl_Item")
        .select("id, item_name")
        .ilike("item_name", `${pattern}%`)
        .limit(1000);
      const ids = new Set<number>([itemId]);
      for (const s of (sibs ?? []) as { id: number; item_name: string }[]) {
        if (baseItemName(s.item_name).toLowerCase() === baseItem.toLowerCase()) ids.add(s.id);
      }

      let total = 0;
      const idList = Array.from(ids);
      for (let i = 0; i < idList.length; i += 200) {
        const chunk = idList.slice(i, i + 200);
        for (let from = 0; ; from += 1000) {
          const { data: inv } = await supabaseAdmin
            .from("tbl_Item_Inventory")
            .select("purchased_qty, actual_withdrawn_qty")
            .in("item_id", chunk)
            .order("id")
            .range(from, from + 999);
          const rows = (inv ?? []) as { purchased_qty: number | null; actual_withdrawn_qty: number | null }[];
          for (const r of rows) total += (r.purchased_qty ?? 0) - (r.actual_withdrawn_qty ?? 0);
          if (rows.length < 1000) break;
        }
      }
      overall = total;
    }
  } catch (e) {
    console.error("overall on hand failed:", e);
  }

  return {
    onHand: row?.on_hand ?? 0,
    onHandOverall: Math.round(overall * 10000) / 10000,
    baseItem,
    onHandRecipe: row?.on_hand_recipe ?? 0,
    onHandDaily: row?.on_hand_daily ?? 0,
  };
}

export async function getItemLastDefaults(
  itemId: number,
  supplierId: number
): Promise<{ unitId: number | null; itemPackaging: number | null; price: number | null }> {
  await requireModule("requisition");
  const { data, error } = await supabaseAdmin.rpc("get_item_last_defaults", {
    p_item_id: itemId,
    p_supplier_id: supplierId,
  });
  if (error || !data || data.length === 0) {
    return { unitId: null, itemPackaging: null, price: null };
  }
  return { unitId: data[0].unit_id, itemPackaging: data[0].item_packaging, price: data[0].price };
}

export async function getItemsByBound(
  boundId: number
): Promise<{ items: { id: number; item_name: string }[] }> {
  await requireModule("requisition");
  const { data, error } = await supabaseAdmin.rpc("get_items_by_bound", { p_bound_id: boundId });
  if (error) return { items: [] };
  return { items: (data ?? []) as { id: number; item_name: string }[] };
}

export type RequisitionListRow = {
  id: number;
  request_no: number;
  dt_request: string;
  status: string;
  project_name: string | null;
  supplier_names: string[];
  /** lines that already belong to a purchase order, and the total number of lines */
  lines_with_po: number;
  total_lines: number;
};

export async function getRequisitionList(): Promise<RequisitionListRow[]> {
  await requireModule("requisition");

  const { data: headers } = await supabaseAdmin
    .from("tbl_Requisition")
    .select("id, request_no, dt_request, status, tbl_Project_ID(project_name)");

  const { data: detailRows } = await supabaseAdmin
    .from("tbl_Requisition_Details")
    .select("request_id, po_id, tbl_Supplier(Supplier_Name)");

  type DetailRow = {
    request_id: number;
    po_id: number | null;
    tbl_Supplier: { Supplier_Name: string } | { Supplier_Name: string }[] | null;
  };

  const suppliersByRequest = new Map<number, Set<string>>();
  const lineCounts = new Map<number, { withPo: number; total: number }>();
  for (const row of (detailRows ?? []) as unknown as DetailRow[]) {
    const c = lineCounts.get(row.request_id) ?? { withPo: 0, total: 0 };
    c.total += 1;
    if (row.po_id != null) c.withPo += 1;
    lineCounts.set(row.request_id, c);

    const supplier = Array.isArray(row.tbl_Supplier) ? row.tbl_Supplier[0] : row.tbl_Supplier;
    const name = supplier?.Supplier_Name;
    if (!name) continue;
    const set = suppliersByRequest.get(row.request_id) ?? new Set<string>();
    set.add(name);
    suppliersByRequest.set(row.request_id, set);
  }

  const STATUS_ORDER: Record<string, number> = { PENDING: 0, APPROVED: 1, REJECTED: 2 };

  const rows = ((headers ?? []) as any[]).map((h) => ({
    id: h.id,
    request_no: h.request_no,
    dt_request: h.dt_request,
    status: h.status,
    project_name: h.tbl_Project_ID?.project_name ?? null,
    supplier_names: Array.from(suppliersByRequest.get(h.id) ?? []),
    lines_with_po: lineCounts.get(h.id)?.withPo ?? 0,
    total_lines: lineCounts.get(h.id)?.total ?? 0,
  }));

  rows.sort((a, b) => {
    const statusDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return b.dt_request.localeCompare(a.dt_request) || b.request_no - a.request_no;
  });

  return rows;
}

export type ItemHistoryRow = {
  po_date: string | null;
  supplier_id: number | null;
  supplier_name: string | null;
  po_no: number | null;
  quantity: number | null;
  price: number | null;
  discount: number | null;
  receiving_date: string | null;
  voucher_no: number | null;
};

export async function getItemHistory(
  itemId: number
): Promise<{ error?: string; history: ItemHistoryRow[] }> {
  await requireModule("requisition");

  const { data, error } = await supabaseAdmin.rpc("get_item_purchase_history", {
    p_item_id: itemId,
  });

  if (error) return { error: error.message, history: [] };
  return { history: (data ?? []) as ItemHistoryRow[] };
}

/* ---------- editing a requisition that has not been decided yet ---------- */

export type UpdateRequisitionInput = {
  id: number;
  dtRequest: string; // yyyy-mm-dd
  accBookId: number | null;
  projectId: number | null;
  remark: string;
  lines: {
    id: number;
    qty: number;
    unitId: number;
    packagingId: number | null;
    supplierId: number | null;
    boolRush: boolean;
    price: number | null;
    remarks: string;
  }[];
  removedLineIds: number[];
};

/** Only a PENDING requisition can be changed; once it is approved (or rejected) it is locked. */
export async function updateRequisition(input: UpdateRequisitionInput): Promise<{ error?: string }> {
  await requireModule("requisition");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dtRequest)) return { error: "Date is required." };
  if (input.lines.length === 0) return { error: "A requisition needs at least one item." };
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty <= 0) return { error: "Every quantity must be a whole number greater than zero." };
    if (!l.unitId) return { error: "Every item needs a unit." };
    if (l.price != null && (!Number.isFinite(l.price) || l.price < 0)) return { error: "Price can't be negative." };
  }

  const { data: head } = await supabaseAdmin.from("tbl_Requisition").select("id, status").eq("id", input.id).maybeSingle();
  if (!head) return { error: "Requisition not found." };
  if ((head as { status: string }).status !== "PENDING") {
    return { error: "This requisition is no longer pending, so it is locked and can't be edited." };
  }

  const { data: existing } = await supabaseAdmin.from("tbl_Requisition_Details").select("id").eq("request_id", input.id);
  const existingIds = new Set(((existing ?? []) as { id: number }[]).map((r) => r.id));
  for (const l of input.lines) {
    if (!existingIds.has(l.id)) return { error: "One of the items does not belong to this requisition." };
  }
  for (const id of input.removedLineIds) {
    if (!existingIds.has(id)) return { error: "One of the removed items does not belong to this requisition." };
  }

  const { error: hErr } = await supabaseAdmin
    .from("tbl_Requisition")
    .update({
      dt_request: input.dtRequest,
      Acc_Book_id: input.accBookId,
      project_id: input.projectId,
      remark: input.remark.trim() || null,
    })
    .eq("id", input.id)
    .eq("status", "PENDING");
  if (hErr) return { error: `Could not save: ${hErr.message}` };

  for (const l of input.lines) {
    const { error } = await supabaseAdmin
      .from("tbl_Requisition_Details")
      .update({
        qty: l.qty,
        unit_id: l.unitId,
        item_packaging: l.packagingId,
        supplier_id: l.supplierId,
        bool_rush: l.boolRush,
        price: l.price,
        remarks: l.remarks.trim() || null,
      })
      .eq("id", l.id)
      .eq("request_id", input.id);
    if (error) return { error: `Could not save an item: ${error.message}` };
  }

  if (input.removedLineIds.length > 0) {
    const { error } = await supabaseAdmin
      .from("tbl_Requisition_Details")
      .delete()
      .in("id", input.removedLineIds)
      .eq("request_id", input.id);
    if (error) return { error: `Could not remove an item: ${error.message}` };
  }

  revalidatePath("/requisition");
  revalidatePath(`/requisition/${input.id}`);
  return {};
}
