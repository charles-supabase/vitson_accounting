"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";

/* ---------- types ---------- */

export type PurchaseOrderListRow = {
  id: number;
  po_no: number;
  dt_po: string;
  dt_delivery: string | null;
  supplier_name: string | null;
  bound_name: string | null;
  requisition_no: number | null;
  line_count: number;
  total: number;
  printed_at: string | null;
  emailed_at: string | null;
};

export type ApprovedRequisitionOption = {
  id: number;
  request_no: number;
  dt_request: string;
  project_name: string | null;
  supplier_names: string[];
  pending_lines: number;
};

export type POSourceLine = {
  detailId: number;
  itemId: number;
  itemName: string;
  itemBoundId: number | null;
  unitId: number;
  unitName: string;
  packagingName: string | null;
  qty: number;
  price: number | null;
  remarks: string | null;
  supplierId: number | null;
  supplierName: string | null;
  supplierContact: string | null;
  supplierAccCategoryId: number | null;
};

export type POSource = {
  requisitionId: number;
  requestNo: number;
  accBookId: number | null;
  lines: POSourceLine[];
};

export type PurchaseOrderLineInput = {
  requisitionDetailId: number;
  qty: number;
  price: number;
  discount: number;
  remarks: string;
};

export type PurchaseOrderDraftInput = {
  supplierId: number;
  boundId: number;
  dtPo: string;
  dtDelivery: string;
  terms: number | null;
  attention: string;
  destination: string;
  accCategoryId: number | null;
  accBookId: number | null;
  accSortingId: number | null;
  boolPettyCash: boolean;
  lines: PurchaseOrderLineInput[];
};

export type CreatePurchaseOrdersResult = {
  error?: string;
  created?: { id: number; poNo: number }[];
};

export async function markPurchaseOrderPrinted(poId: number): Promise<{ error?: string }> {
  await requireModule("purchase_order");
  const { error } = await supabaseAdmin
    .from("tbl_Purchase_Order")
    .update({ printed_at: new Date().toISOString() })
    .eq("id", poId);
  if (error) return { error: error.message };
  revalidatePath("/purchase-order");
  revalidatePath(`/purchase-order/${poId}`);
  return {};
}

export async function markPurchaseOrderEmailed(poId: number): Promise<{ error?: string }> {
  await requireModule("purchase_order");
  const { error } = await supabaseAdmin
    .from("tbl_Purchase_Order")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", poId);
  if (error) return { error: error.message };
  revalidatePath("/purchase-order");
  revalidatePath(`/purchase-order/${poId}`);
  return {};
}

/* ---------- reads ---------- */

export async function getPurchaseOrderList(): Promise<PurchaseOrderListRow[]> {
  await requireModule("purchase_order");

  const { data: pos } = await supabaseAdmin
    .from("tbl_Purchase_Order")
    .select("id, po_no, dt_PO, dt_Delivery, supplier_id, requisition_id, printed_at, emailed_at");

  const rows = (pos ?? []) as any[];
  if (rows.length === 0) return [];

  const supplierIds = Array.from(new Set(rows.map((r) => r.supplier_id).filter(Boolean)));
  const reqIds = Array.from(new Set(rows.map((r) => r.requisition_id).filter(Boolean)));
  const poIds = rows.map((r) => r.id);

  const [{ data: suppliers }, { data: reqs }, { data: lines }] = await Promise.all([
    supabaseAdmin.from("tbl_Supplier").select("id, Supplier_Name").in("id", supplierIds),
    supabaseAdmin.from("tbl_Requisition").select("id, request_no").in("id", reqIds),
    supabaseAdmin.from("tbl_PO_details").select("PO_id, bound_id, qty, price, discount").in("PO_id", poIds),
  ]);
  // the bound lives on the PO lines
  const boundIds = Array.from(new Set(((lines ?? []) as any[]).map((l) => l.bound_id).filter(Boolean)));
  const { data: bounds } = boundIds.length
    ? await supabaseAdmin.from("tbl_Item_Bound").select("id, bound_name").in("id", boundIds)
    : { data: [] as any[] };

  const supplierName = new Map<number, string>(((suppliers ?? []) as any[]).map((s): [number, string] => [s.id, s.Supplier_Name]));
  const boundName = new Map<number, string>(((bounds ?? []) as any[]).map((b): [number, string] => [b.id, b.bound_name]));
  const reqNo = new Map<number, number>(((reqs ?? []) as any[]).map((r): [number, number] => [r.id, r.request_no]));

  const totals = new Map<number, { count: number; total: number }>();
  const poBounds = new Map<number, Set<string>>();
  for (const l of (lines ?? []) as any[]) {
    const bn = l.bound_id ? boundName.get(l.bound_id) : null;
    if (bn) poBounds.set(l.PO_id, (poBounds.get(l.PO_id) ?? new Set<string>()).add(bn));
    const t = totals.get(l.PO_id) ?? { count: 0, total: 0 };
    t.count += 1;
    t.total += l.qty * l.price * (1 - (l.discount ?? 0) / 100);
    totals.set(l.PO_id, t);
  }

  const result: PurchaseOrderListRow[] = rows.map((r) => ({
    id: r.id,
    po_no: r.po_no,
    dt_po: r.dt_PO,
    dt_delivery: r.dt_Delivery ?? null,
    supplier_name: supplierName.get(r.supplier_id) ?? null,
    bound_name: poBounds.has(r.id) ? Array.from(poBounds.get(r.id)!).join(", ") : null,
    requisition_no: r.requisition_id ? reqNo.get(r.requisition_id) ?? null : null,
    line_count: totals.get(r.id)?.count ?? 0,
    total: totals.get(r.id)?.total ?? 0,
    printed_at: r.printed_at ?? null,
    emailed_at: r.emailed_at ?? null,
  }));

  result.sort((a, b) => b.dt_po.localeCompare(a.dt_po) || b.po_no - a.po_no);
  return result;
}

/** Approved requisitions that still have at least one line without a PO. */
export async function getApprovedRequisitionsForPO(): Promise<ApprovedRequisitionOption[]> {
  await requireModule("purchase_order");

  const { data: headers } = await supabaseAdmin
    .from("tbl_Requisition")
    .select("id, request_no, dt_request, project_id")
    .eq("status", "APPROVED");

  const hs = (headers ?? []) as any[];
  if (hs.length === 0) return [];

  const ids = hs.map((h) => h.id);
  const projectIds = Array.from(new Set(hs.map((h) => h.project_id).filter(Boolean)));

  const [{ data: pending }, { data: projects }, { data: allDetails }] = await Promise.all([
    supabaseAdmin.from("tbl_Requisition_Details").select("request_id").is("po_id", null).in("request_id", ids),
    supabaseAdmin.from("tbl_Project_ID").select("id, project_name").in("id", projectIds),
    supabaseAdmin
      .from("tbl_Requisition_Details")
      .select("request_id, tbl_Supplier(Supplier_Name)")
      .in("request_id", ids),
  ]);

  const pendingCount = new Map<number, number>();
  for (const p of (pending ?? []) as any[]) {
    pendingCount.set(p.request_id, (pendingCount.get(p.request_id) ?? 0) + 1);
  }
  const projectName = new Map<number, string>(((projects ?? []) as any[]).map((p): [number, string] => [p.id, p.project_name]));

  type DetailRow = { request_id: number; tbl_Supplier: { Supplier_Name: string } | { Supplier_Name: string }[] | null };
  const suppliersByRequest = new Map<number, Set<string>>();
  for (const row of (allDetails ?? []) as unknown as DetailRow[]) {
    const supplier = Array.isArray(row.tbl_Supplier) ? row.tbl_Supplier[0] : row.tbl_Supplier;
    const name = supplier?.Supplier_Name;
    if (!name) continue;
    const set = suppliersByRequest.get(row.request_id) ?? new Set<string>();
    set.add(name);
    suppliersByRequest.set(row.request_id, set);
  }

  return hs
    .filter((h) => (pendingCount.get(h.id) ?? 0) > 0)
    .map((h) => ({
      id: h.id,
      request_no: h.request_no,
      dt_request: h.dt_request,
      project_name: h.project_id ? projectName.get(h.project_id) ?? null : null,
      supplier_names: Array.from(suppliersByRequest.get(h.id) ?? []),
      pending_lines: pendingCount.get(h.id) ?? 0,
    }))
    .sort((a, b) => a.dt_request.localeCompare(b.dt_request) || a.request_no - b.request_no);
}

/** The still-unordered lines of one approved requisition, with everything the PO builder needs. */
export async function getRequisitionLinesForPO(
  requisitionId: number
): Promise<{ error?: string; source?: POSource }> {
  await requireModule("purchase_order");

  const { data: header } = await supabaseAdmin
    .from("tbl_Requisition")
    .select("id, request_no, status, Acc_Book_id")
    .eq("id", requisitionId)
    .maybeSingle();

  if (!header) return { error: "Requisition not found." };
  const h = header as any;
  if (h.status !== "APPROVED") {
    return { error: "Only an approved requisition can generate purchase orders." };
  }

  const { data: detailRows } = await supabaseAdmin
    .from("tbl_Requisition_Details")
    .select("id, item_id, unit_id, qty, price, remarks, supplier_id, item_packaging")
    .eq("request_id", requisitionId)
    .is("po_id", null)
    .order("id");

  const details = (detailRows ?? []) as any[];
  if (details.length === 0) return { source: { requisitionId, requestNo: h.request_no, accBookId: h.Acc_Book_id ?? null, lines: [] } };

  const uniq = (xs: any[]) => Array.from(new Set(xs.filter((x) => x != null)));

  const [{ data: items }, { data: units }, { data: packs }, { data: suppliers }] = await Promise.all([
    supabaseAdmin.from("tbl_Item").select("id, item_name, bound_id, Price").in("id", uniq(details.map((d) => d.item_id))),
    supabaseAdmin.from("tbl_Unit").select("id, unit_name").in("id", uniq(details.map((d) => d.unit_id))),
    supabaseAdmin.from("tbl_Item_packaging").select("id, packaging_name").in("id", uniq(details.map((d) => d.item_packaging))),
    supabaseAdmin
      .from("tbl_Supplier")
      .select("id, Supplier_Name, Contact_Person, Acc_Category_id")
      .in("id", uniq(details.map((d) => d.supplier_id))),
  ]);

  const itemMap = new Map<number, any>(((items ?? []) as any[]).map((i): [number, any] => [i.id, i]));
  const unitMap = new Map<number, string>(((units ?? []) as any[]).map((u): [number, string] => [u.id, u.unit_name]));
  const packMap = new Map<number, string>(((packs ?? []) as any[]).map((p): [number, string] => [p.id, p.packaging_name]));
  const supplierMap = new Map<number, any>(((suppliers ?? []) as any[]).map((s): [number, any] => [s.id, s]));

  const lines: POSourceLine[] = details.map((d) => {
    const item = itemMap.get(d.item_id);
    const supplier = d.supplier_id ? supplierMap.get(d.supplier_id) : null;
    return {
      detailId: d.id,
      itemId: d.item_id,
      itemName: item?.item_name ?? `Item #${d.item_id}`,
      itemBoundId: item?.bound_id ?? null,
      unitId: d.unit_id,
      unitName: unitMap.get(d.unit_id) ?? "",
      packagingName: d.item_packaging ? packMap.get(d.item_packaging) ?? null : null,
      qty: Number(d.qty),
      price: d.price ?? item?.Price ?? null,
      remarks: d.remarks ?? null,
      supplierId: d.supplier_id ?? null,
      supplierName: supplier?.Supplier_Name ?? null,
      supplierContact: supplier?.Contact_Person ?? null,
      supplierAccCategoryId: supplier?.Acc_Category_id ?? null,
    };
  });

  return {
    source: { requisitionId, requestNo: h.request_no, accBookId: h.Acc_Book_id ?? null, lines },
  };
}

/* ---------- write ---------- */

export async function createPurchaseOrders(
  requisitionId: number,
  drafts: PurchaseOrderDraftInput[]
): Promise<CreatePurchaseOrdersResult> {
  const session = await requireModule("purchase_order");

  if (!drafts || drafts.length === 0) return { error: "There are no purchase orders to create." };

  for (const d of drafts) {
    if (!d.supplierId) return { error: "Every purchase order needs a supplier." };
    if (!d.boundId) return { error: "Every purchase order needs an item bound." };
    if (!d.accSortingId) return { error: "Every purchase order needs an accounting sorting." };
    if (!d.dtPo) return { error: "Every purchase order needs a PO date." };
    if (!d.dtDelivery) return { error: "Every purchase order needs an expected delivery date." };
    if (!d.lines || d.lines.length === 0) return { error: "A purchase order needs at least one line." };
    for (const l of d.lines) {
      if (!(l.qty > 0)) return { error: "Every line needs a quantity greater than zero." };
      if (l.price == null || Number.isNaN(l.price) || l.price < 0) return { error: "Every line needs a price." };
      if (l.discount < 0 || l.discount > 100) return { error: "Discount must be between 0 and 100 percent." };
    }
  }

  const { data, error } = await supabaseAdmin.rpc("create_purchase_orders", {
    p_requisition_id: requisitionId,
    p_created_by: session.userId,
    p_pos: drafts.map((d) => ({
      supplier_id: d.supplierId,
      bound_id: d.boundId,
      dt_po: d.dtPo,
      dt_delivery: d.dtDelivery,
      terms: d.terms ?? "",
      attention: d.attention || "",
      destination: d.destination || "",
      acc_category_id: d.accCategoryId ?? "",
      acc_book_id: d.accBookId ?? "",
      acc_sorting_id: d.accSortingId,
      bool_petty_cash: d.boolPettyCash,
      lines: d.lines.map((l) => ({
        requisition_detail_id: l.requisitionDetailId,
        qty: l.qty,
        price: l.price,
        discount: l.discount,
        remarks: l.remarks || "",
      })),
    })),
  });

  if (error || !data) {
    return { error: `Could not create purchase orders: ${error?.message ?? "unknown error"}` };
  }

  revalidatePath("/purchase-order");
  revalidatePath("/requisition");
  return {
    created: (data as { new_po_id: number; new_po_no: number }[]).map((r) => ({
      id: r.new_po_id,
      poNo: r.new_po_no,
    })),
  };
}

/* ---------- follow-up: PO lines still waiting to be received ---------- */

export type FollowUpRow = {
  detailId: number;
  poId: number;
  poNo: number;
  dtPo: string;
  supplierName: string | null;
  itemName: string;
  unitName: string;
  qty: number;
  dtDelivery: string | null;
  remarks: string | null;
};

/** Every PO line with bool_plant_recieved FALSE, oldest purchase order first. */
export async function getFollowUpLines(): Promise<FollowUpRow[]> {
  await requireModule("purchase_order");

  const { data: details } = await supabaseAdmin
    .from("tbl_PO_details")
    .select("id, PO_id, item_id, unit_id, qty, remarks")
    .or("bool_plant_recieved.is.null,bool_plant_recieved.eq.false");

  const ds = (details ?? []) as any[];
  if (ds.length === 0) return [];

  const uniq = (xs: any[]) => Array.from(new Set(xs.filter((x) => x != null)));
  const { data: pos } = await supabaseAdmin
    .from("tbl_Purchase_Order")
    .select("id, po_no, dt_PO, dt_Delivery, supplier_id, created_at")
    .in("id", uniq(ds.map((d) => d.PO_id)));
  const poRows = (pos ?? []) as any[];
  const poMap = new Map<number, any>(poRows.map((p): [number, any] => [p.id, p]));

  const [{ data: suppliers }, { data: items }, { data: units }] = await Promise.all([
    supabaseAdmin.from("tbl_Supplier").select("id, Supplier_Name").in("id", uniq(poRows.map((p) => p.supplier_id))),
    supabaseAdmin.from("tbl_Item").select("id, item_name").in("id", uniq(ds.map((d) => d.item_id))),
    supabaseAdmin.from("tbl_Unit").select("id, unit_name").in("id", uniq(ds.map((d) => d.unit_id))),
  ]);
  const supplierName = new Map<number, string>(((suppliers ?? []) as any[]).map((s): [number, string] => [s.id, s.Supplier_Name]));
  const itemName = new Map<number, string>(((items ?? []) as any[]).map((i): [number, string] => [i.id, i.item_name]));
  const unitName = new Map<number, string>(((units ?? []) as any[]).map((u): [number, string] => [u.id, u.unit_name]));

  const rows = ds
    .filter((d) => poMap.has(d.PO_id))
    .map((d) => {
      const po = poMap.get(d.PO_id);
      return {
        createdAt: (po.created_at as string | null) ?? "",
        row: {
          detailId: d.id as number,
          poId: d.PO_id as number,
          poNo: po.po_no as number,
          dtPo: po.dt_PO as string,
          supplierName: supplierName.get(po.supplier_id) ?? null,
          itemName: itemName.get(d.item_id) ?? `Item #${d.item_id}`,
          unitName: unitName.get(d.unit_id) ?? "",
          qty: Number(d.qty),
          dtDelivery: (po.dt_Delivery as string | null) ?? null,
          remarks: (d.remarks as string | null) ?? null,
        } satisfies FollowUpRow,
      };
    });

  // Oldest created first; lines of the same PO stay together in id order.
  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.row.poId - b.row.poId || a.row.detailId - b.row.detailId);
  return rows.map((r) => r.row);
}

/** Cancels one open PO line: qty -> cancelled_qty, qty = 0, remark stamped, marked done. */
export async function cancelFollowUpLine(
  detailId: number,
  cancelDate: string // yyyy-mm-dd, the user's local date
): Promise<{ error?: string }> {
  await requireModule("purchase_order");

  if (!detailId) return { error: "No PO line selected." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cancelDate)) return { error: "Invalid cancellation date." };

  const { error } = await supabaseAdmin.rpc("cancel_po_line", {
    p_po_detail_id: detailId,
    p_cancel_date: cancelDate,
  });
  if (error) return { error: `Could not cancel this item: ${error.message}` };

  revalidatePath("/purchase-order");
  revalidatePath("/receiving");
  return {};
}

/* ---------- email with the PO as a PDF attachment (Gmail) ---------- */

export type EmailPoInput = {
  poId: number;
  to: string;
  subject: string;
  message: string;
};

/**
 * Sends the purchase order, as a PDF in the company form layout, through Gmail's SMTP server.
 * Needs GMAIL_USER and GMAIL_APP_PASSWORD in the environment (a Google "app password").
 */
export async function emailPurchaseOrder(input: EmailPoInput): Promise<{ error?: string; sentTo?: string }> {
  await requireModule("purchase_order");

  const to = input.to.trim();
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return { error: "Enter one valid email address." };
  if (!input.subject.trim()) return { error: "Enter a subject." };

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return {
      error:
        "Email is not set up yet. Add GMAIL_USER and GMAIL_APP_PASSWORD to the app's environment settings, then restart the app.",
    };
  }

  const { getPoPrintData } = await import("@/lib/po-data");
  const { buildPoPdf } = await import("@/lib/po-pdf");
  const data = await getPoPrintData(input.poId);
  if (!data) return { error: "Purchase order not found." };

  try {
    const pdf = await buildPoPdf(data);
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from: `"${process.env.GMAIL_FROM_NAME ?? "Vitson International"}" <${user}>`,
      to,
      subject: input.subject.trim(),
      text: input.message,
      attachments: [{ filename: `PO-${data.poNo}.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
    });
  } catch (e) {
    return { error: `The email could not be sent: ${e instanceof Error ? e.message : "unknown error"}` };
  }

  await markPurchaseOrderEmailed(input.poId);
  return { sentTo: to };
}

/* ---------- editing a purchase order that is still open ---------- */

export type UpdatePurchaseOrderInput = {
  id: number;
  dtPo: string;
  dtDelivery: string;
  terms: number | null;
  attention: string;
  destination: string;
  accSortingId: number | null;
  boolPettyCash: boolean;
  lines: { id: number; qty: number; price: number; discount: number; remarks: string }[];
};

/**
 * A purchase order can be edited until it is printed or emailed, or any of its lines is received or
 * cancelled. After that it is locked.
 */
export async function updatePurchaseOrder(input: UpdatePurchaseOrderInput): Promise<{ error?: string }> {
  await requireModule("purchase_order");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dtPo) || !/^\d{4}-\d{2}-\d{2}$/.test(input.dtDelivery)) {
    return { error: "PO date and expected delivery date are required." };
  }
  if (input.dtDelivery <= input.dtPo) return { error: "Expected delivery date must be after the PO date." };
  if (!input.accSortingId) return { error: "Select an accounting sorting." };
  if (input.terms != null && (!Number.isInteger(input.terms) || input.terms < 0)) return { error: "Terms must be a whole number of days." };
  for (const l of input.lines) {
    if (!Number.isFinite(l.qty) || l.qty <= 0) return { error: "Every quantity must be greater than zero." };
    if (!Number.isFinite(l.price) || l.price < 0) return { error: "Every line needs a price." };
    if (!Number.isFinite(l.discount) || l.discount < 0 || l.discount > 100) return { error: "Discount must be between 0 and 100 percent." };
  }

  const { data: po } = await supabaseAdmin.from("tbl_Purchase_Order").select("id, printed_at, emailed_at").eq("id", input.id).maybeSingle();
  if (!po) return { error: "Purchase order not found." };
  if ((po as any).printed_at || (po as any).emailed_at) {
    return { error: "This purchase order was printed or emailed, so it is locked and can't be edited." };
  }

  const { data: lineRows } = await supabaseAdmin
    .from("tbl_PO_details")
    .select("id, bool_recieved, bool_plant_recieved, cancelled_qty")
    .eq("PO_id", input.id);
  const existing = (lineRows ?? []) as any[];
  if (existing.some((l) => l.bool_recieved || l.bool_plant_recieved || Number(l.cancelled_qty ?? 0) !== 0)) {
    return { error: "Items on this purchase order were received or cancelled, so it is locked and can't be edited." };
  }
  const ids = new Set(existing.map((l) => l.id));
  for (const l of input.lines) if (!ids.has(l.id)) return { error: "One of the lines does not belong to this purchase order." };

  const { error: hErr } = await supabaseAdmin
    .from("tbl_Purchase_Order")
    .update({
      dt_PO: input.dtPo,
      dt_Delivery: input.dtDelivery,
      terms: input.terms,
      attention: input.attention.trim() || null,
      destination: input.destination.trim() || null,
      Acc_Sorting_id: input.accSortingId,
      bool_petty_cash: input.boolPettyCash,
    })
    .eq("id", input.id);
  if (hErr) return { error: `Could not save: ${hErr.message}` };

  for (const l of input.lines) {
    const { error } = await supabaseAdmin
      .from("tbl_PO_details")
      .update({ qty: l.qty, price: l.price, discount: l.discount, remarks: l.remarks.trim() || null })
      .eq("id", l.id)
      .eq("PO_id", input.id);
    if (error) return { error: `Could not save a line: ${error.message}` };
  }

  revalidatePath("/purchase-order");
  revalidatePath(`/purchase-order/${input.id}`);
  return {};
}
