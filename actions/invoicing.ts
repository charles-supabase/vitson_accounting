"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { parseYm } from "@/lib/report-format";
import { invoiceTotals } from "@/lib/invoice-totals";

const MODULE = "invoicing" as const;
const PAGE = 1000;
const CHUNK = 200;

export type InvoiceAlias = { id: number; name: string; deliveries: number };

export type InvoiceDelivery = {
  id: number;
  deliveryReceipt: number;
  dateDelivery: string;
  customerName: string;
  jobTicket: string;
  cusJoNo: string;
  /** Body + 1x1 + C+C */
  totalWt: number;
  /** tbl_job_order.unit_price */
  unitPrice: number;
};

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

function chunks<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Aliases that have delivery receipts in the month that are not invoiced yet. Also counts Big receipts that have no alias (they cannot be invoiced). */
export async function getInvoiceAliases(ym: string): Promise<{ error?: string; aliases: InvoiceAlias[]; withoutAlias: number }> {
  await requireModule(MODULE);
  const range = parseYm(ym);
  if (!range) return { error: "Select a month and year.", aliases: [], withoutAlias: 0 };
  try {
    const rows = await fetchAll<{ alias_id: number | null; receivable_type_id: number | null }>((from, to) =>
      supabaseAdmin
        .from("tbl_Deliveries")
        .select("alias_id, receivable_type_id")
        .gte("date_delivery", range.start)
        .lt("date_delivery", range.end)
        .eq("invoice_id", 0)
        .order("id")
        .range(from, to),
    );
    const counts = new Map<number, number>();
    let withoutAlias = 0;
    for (const r of rows) {
      if (r.alias_id != null) counts.set(r.alias_id, (counts.get(r.alias_id) ?? 0) + 1);
      else if (r.receivable_type_id === 1) withoutAlias++;
    }
    const names = new Map<number, string>();
    for (const ids of chunks(Array.from(counts.keys()))) {
      const { data, error } = await supabaseAdmin.from("tbl_Alias").select("id, alias_name").in("id", ids);
      if (error) return { error: error.message, aliases: [], withoutAlias: 0 };
      for (const a of (data ?? []) as any[]) names.set(a.id, a.alias_name ?? "");
    }
    const aliases = Array.from(counts.entries())
      .map(([id, deliveries]) => ({ id, name: names.get(id) ?? `Alias #${id}`, deliveries }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { aliases, withoutAlias };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the aliases.", aliases: [], withoutAlias: 0 };
  }
}

/** The delivery receipts of the month that have this alias and are not invoiced yet, by delivery receipt. */
export async function getInvoiceDeliveries(ym: string, aliasId: number): Promise<{ error?: string; deliveries: InvoiceDelivery[] }> {
  await requireModule(MODULE);
  const range = parseYm(ym);
  if (!range) return { error: "Select a month and year.", deliveries: [] };
  if (!Number.isSafeInteger(aliasId) || aliasId <= 0) return { error: "Select an alias.", deliveries: [] };
  try {
    const rows = await fetchAll<any>((from, to) =>
      supabaseAdmin
        .from("tbl_Deliveries")
        .select("id, job_order_id, delivery_receipt, date_delivery, delivered_body_wt, delivered_1x1_wt, delivered_cc_wt")
        .eq("alias_id", aliasId)
        .eq("invoice_id", 0)
        .gte("date_delivery", range.start)
        .lt("date_delivery", range.end)
        .order("id")
        .range(from, to),
    );
    const jobs = new Map<number, any>();
    for (const ids of chunks(Array.from(new Set(rows.map((r) => r.job_order_id as number))))) {
      const { data, error } = await supabaseAdmin.from("tbl_job_order").select("id, customer_id, job_ticket, cus_jo_no, unit_price").in("id", ids);
      if (error) return { error: error.message, deliveries: [] };
      for (const j of (data ?? []) as any[]) jobs.set(j.id, j);
    }
    const customerNames = new Map<number, string>();
    for (const ids of chunks(Array.from(new Set(Array.from(jobs.values()).map((j) => j.customer_id as number))))) {
      const { data, error } = await supabaseAdmin.from("tbl_Customer").select("id, customer_name").in("id", ids);
      if (error) return { error: error.message, deliveries: [] };
      for (const c of (data ?? []) as any[]) customerNames.set(c.id, c.customer_name ?? "");
    }
    const deliveries: InvoiceDelivery[] = rows
      .map((d) => {
        const j = jobs.get(d.job_order_id) ?? {};
        return {
          id: d.id,
          deliveryReceipt: d.delivery_receipt,
          dateDelivery: d.date_delivery,
          customerName: customerNames.get(j.customer_id) ?? "",
          jobTicket: j.job_ticket ?? "",
          cusJoNo: j.cus_jo_no ?? "",
          totalWt: r2((d.delivered_body_wt ?? 0) + (d.delivered_1x1_wt ?? 0) + (d.delivered_cc_wt ?? 0)),
          unitPrice: j.unit_price ?? 0,
        };
      })
      .sort((a, b) => a.deliveryReceipt - b.deliveryReceipt || a.id - b.id);
    return { deliveries };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the delivery receipts.", deliveries: [] };
  }
}

/**
 * Saves the invoice (tbl_invoice) and marks the delivery receipts as invoiced, in one database transaction.
 * The amounts are worked out here from the database (never taken from the browser):
 * invoice_amount = Gross, VAT = Gross x 0.12 / 1.12, sales_amount = Service Income = Gross - VAT.
 */
export async function saveInvoice(input: {
  invoiceNumber: string;
  dateInvoice: string;
  aliasId: number;
  deliveryIds: number[];
}): Promise<{ error?: string; invoiceNumber?: number }> {
  await requireModule(MODULE);

  if (!/^\d{1,12}$/.test(String(input.invoiceNumber ?? "").trim()) || Number(input.invoiceNumber) <= 0) {
    return { error: "Enter the invoice number (digits only)." };
  }
  const invoiceNumber = Number(String(input.invoiceNumber).trim());
  const date = String(input.dateInvoice ?? "");
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const valid = t && new Date(Date.UTC(+t[1], +t[2] - 1, +t[3])).toISOString().slice(0, 10) === date;
  if (!valid) return { error: "Enter the invoice date." };
  if (!Number.isSafeInteger(input.aliasId) || input.aliasId <= 0) return { error: "Select an alias." };
  const ids = Array.from(new Set((input.deliveryIds ?? []).filter((n) => Number.isSafeInteger(n) && n > 0)));
  if (ids.length === 0) return { error: "Process at least one delivery receipt first." };
  if (ids.length > 500) return { error: "Too many delivery receipts for one invoice (500 at most)." };

  try {
    const rows: any[] = [];
    for (const part of chunks(ids)) {
      const { data, error } = await supabaseAdmin
        .from("tbl_Deliveries")
        .select("id, job_order_id, alias_id, invoice_id, delivered_body_wt, delivered_1x1_wt, delivered_cc_wt")
        .in("id", part);
      if (error) return { error: error.message };
      rows.push(...(data ?? []));
    }
    if (rows.length !== ids.length || rows.some((d) => d.alias_id !== input.aliasId || d.invoice_id !== 0)) {
      return { error: "One of the delivery receipts is no longer available for this alias. Reload and select again." };
    }
    const prices = new Map<number, number>();
    for (const part of chunks(Array.from(new Set(rows.map((d) => d.job_order_id as number))))) {
      const { data, error } = await supabaseAdmin.from("tbl_job_order").select("id, unit_price").in("id", part);
      if (error) return { error: error.message };
      for (const j of (data ?? []) as any[]) prices.set(j.id, j.unit_price ?? 0);
    }
    const lines = rows.map((d) => ({
      weight: (d.delivered_body_wt ?? 0) + (d.delivered_1x1_wt ?? 0) + (d.delivered_cc_wt ?? 0),
      unitPrice: prices.get(d.job_order_id) ?? 0,
    }));
    if (lines.some((l) => !(l.unitPrice > 0))) {
      return { error: "A delivery receipt has no unit price. Set the price in Customer Statements first." };
    }
    const totals = invoiceTotals(lines);

    const { error } = await supabaseAdmin.rpc("create_invoice", {
      p_invoice_number: invoiceNumber,
      p_alias_id: input.aliasId,
      p_date: date,
      p_delivery_ids: ids,
      p_invoice_amount: totals.gross,
      p_vat: totals.vat,
      p_sales_amount: totals.serviceIncome,
    });
    if (error) {
      if (error.message.includes("INVOICE_NUMBER_EXISTS")) return { error: `Invoice number ${invoiceNumber} already exists.` };
      if (error.message.includes("DELIVERIES_NOT_AVAILABLE")) return { error: "One of the delivery receipts was invoiced in the meantime. Reload and select again." };
      return { error: error.message };
    }
    return { invoiceNumber };
  } catch (e: any) {
    return { error: e?.message ?? "Could not save the invoice." };
  }
}
