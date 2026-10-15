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
  customerId: number;
  customerName: string;
  toneId: number | null;
  fabricId: number | null;
  dyeId: number | null;
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
/** rows of the billing invoice (one per tone, dye process and fabric) */
const MAX_INVOICE_ROWS = 3;

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
export async function getInvoiceDeliveries(
  ym: string,
  aliasId: number,
): Promise<{ error?: string; deliveries: InvoiceDelivery[]; /** customer id -> discounts_rate (a percentage) */ discountRates?: Record<number, number> }> {
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
      const { data, error } = await supabaseAdmin.from("tbl_job_order").select("id, customer_id, job_ticket, cus_jo_no, unit_price, tone_id, fabric_id, dye_process_id").in("id", ids);
      if (error) return { error: error.message, deliveries: [] };
      for (const j of (data ?? []) as any[]) jobs.set(j.id, j);
    }
    const customerNames = new Map<number, string>();
    const discountRates: Record<number, number> = {};
    for (const ids of chunks(Array.from(new Set(Array.from(jobs.values()).map((j) => j.customer_id as number))))) {
      const { data, error } = await supabaseAdmin.from("tbl_Customer").select("id, customer_name, discounts_rate").in("id", ids);
      if (error) return { error: error.message, deliveries: [] };
      for (const c of (data ?? []) as any[]) {
        customerNames.set(c.id, c.customer_name ?? "");
        discountRates[c.id] = Number(c.discounts_rate ?? 0) || 0;
      }
    }
    const deliveries: InvoiceDelivery[] = rows
      .map((d) => {
        const j = jobs.get(d.job_order_id) ?? {};
        return {
          id: d.id,
          deliveryReceipt: d.delivery_receipt,
          dateDelivery: d.date_delivery,
          customerId: j.customer_id ?? 0,
          customerName: customerNames.get(j.customer_id) ?? "",
          toneId: j.tone_id ?? null,
          fabricId: j.fabric_id ?? null,
          dyeId: j.dye_process_id ?? null,
          jobTicket: j.job_ticket ?? "",
          cusJoNo: j.cus_jo_no ?? "",
          totalWt: r2((d.delivered_body_wt ?? 0) + (d.delivered_1x1_wt ?? 0) + (d.delivered_cc_wt ?? 0)),
          unitPrice: j.unit_price ?? 0,
        };
      })
      .sort((a, b) => a.deliveryReceipt - b.deliveryReceipt || a.id - b.id);
    return { deliveries, discountRates };
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
  /** typed amounts, empty = 0 */
  discount: string;
  deduction: string;
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
  const discountText = String(input.discount ?? "").replace(/,/g, "").trim();
  const discount = discountText === "" ? 0 : Number(discountText);
  if (!Number.isFinite(discount) || discount < 0) return { error: "The discount must be zero or more." };
  const deductionText = String(input.deduction ?? "").replace(/,/g, "").trim();
  const deduction = deductionText === "" ? 0 : Number(deductionText);
  if (!Number.isFinite(deduction) || deduction < 0) return { error: "The deduction must be zero or more." };
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
    const kinds = new Map<number, string>(); // job order id -> tone | dye process | fabric
    for (const part of chunks(Array.from(new Set(rows.map((d) => d.job_order_id as number))))) {
      const { data, error } = await supabaseAdmin.from("tbl_job_order").select("id, unit_price, tone_id, fabric_id, dye_process_id").in("id", part);
      if (error) return { error: error.message };
      for (const j of (data ?? []) as any[]) {
        prices.set(j.id, j.unit_price ?? 0);
        kinds.set(j.id, `${j.tone_id ?? 0}|${j.dye_process_id ?? 0}|${j.fabric_id ?? 0}`);
      }
    }
    const lines = rows.map((d) => ({
      weight: (d.delivered_body_wt ?? 0) + (d.delivered_1x1_wt ?? 0) + (d.delivered_cc_wt ?? 0),
      unitPrice: prices.get(d.job_order_id) ?? 0,
    }));
    if (lines.some((l) => !(l.unitPrice > 0))) {
      return { error: "A delivery receipt has no unit price. Set the price in Customer Statements first." };
    }
    // the billing invoice has room for 3 rows: one per tone, dye process and fabric
    const rowsOnInvoice = new Set(rows.map((d) => kinds.get(d.job_order_id) ?? "0|0|0")).size;
    if (rowsOnInvoice > MAX_INVOICE_ROWS) {
      return { error: `A billing invoice can have at most ${MAX_INVOICE_ROWS} rows (different tone, dye process and fabric). These receipts make ${rowsOnInvoice}.` };
    }
    const totals = invoiceTotals(lines, discount, deduction);
    if (totals.discount > totals.gross) return { error: "The discount cannot be more than the gross amount." };
    if (totals.discount + totals.deduction > totals.gross) return { error: "The discount and the deduction together cannot be more than the gross amount." };

    const { error } = await supabaseAdmin.rpc("create_invoice", {
      p_invoice_number: invoiceNumber,
      p_alias_id: input.aliasId,
      p_date: date,
      p_delivery_ids: ids,
      p_invoice_amount: totals.gross,
      p_discount: totals.discount,
      p_deduction: totals.deduction,
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

/** The biggest invoice number saved so far (null when there is none). */
export async function getLastInvoiceNumber(): Promise<{ error?: string; last: number | null }> {
  await requireModule(MODULE);
  const { data, error } = await supabaseAdmin.from("tbl_invoice").select("Invoice_number").order("Invoice_number", { ascending: false }).limit(1);
  if (error) return { error: error.message, last: null };
  const n = (data ?? [])[0]?.Invoice_number;
  return { last: n == null ? null : Number(n) };
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const periodLabel = (ym: string) => `${MONTH_NAMES[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

export type InvoiceRow = {
  id: number;
  invoiceNumber: number;
  dateInvoice: string;
  aliasId: number;
  aliasName: string;
  /** Act Receivable: the gross amount */
  invoiceAmount: number;
  discount: number;
  deduction: number;
  /** Uncollected: the VAT */
  vat: number;
  /** Service Income */
  serviceIncome: number;
};

async function loadInvoices(range: { start: string; end: string }): Promise<InvoiceRow[]> {
  const rows = await fetchAll<any>((from, to) =>
    supabaseAdmin
      .from("tbl_invoice")
      .select("id, Invoice_number, alias_id, date_invoice, invoice_amount, discount, deduction, VAT, sales_amount")
      .gte("date_invoice", range.start)
      .lt("date_invoice", range.end)
      .order("Invoice_number")
      .range(from, to),
  );
  const names = new Map<number, string>();
  for (const ids of chunks(Array.from(new Set(rows.map((r) => r.alias_id as number))))) {
    const { data, error } = await supabaseAdmin.from("tbl_Alias").select("id, alias_name").in("id", ids);
    if (error) throw new Error(error.message);
    for (const a of (data ?? []) as any[]) names.set(a.id, a.alias_name ?? "");
  }
  return rows
    .map((r) => ({
      id: r.id,
      invoiceNumber: Number(r.Invoice_number),
      dateInvoice: r.date_invoice,
      aliasId: r.alias_id,
      aliasName: names.get(r.alias_id) ?? `Alias #${r.alias_id}`,
      invoiceAmount: r.invoice_amount ?? 0,
      discount: r.discount ?? 0,
      deduction: r.deduction ?? 0,
      vat: r.VAT ?? 0,
      serviceIncome: r.sales_amount ?? 0,
    }))
    .sort((a, b) => a.invoiceNumber - b.invoiceNumber || a.dateInvoice.localeCompare(b.dateInvoice));
}

export type InvoiceTotalsRow = { invoiceAmount: number; discount: number; deduction: number; serviceIncome: number; vat: number };
const sumRows = (rows: InvoiceRow[]): InvoiceTotalsRow => ({
  invoiceAmount: r2(rows.reduce((s, r) => s + r.invoiceAmount, 0)),
  discount: r2(rows.reduce((s, r) => s + r.discount, 0)),
  deduction: r2(rows.reduce((s, r) => s + r.deduction, 0)),
  serviceIncome: r2(rows.reduce((s, r) => s + r.serviceIncome, 0)),
  vat: r2(rows.reduce((s, r) => s + r.vat, 0)),
});

/** The invoices of a month by invoice number then date (used by the list on the Invoicing page and by report 1). */
export async function getInvoiceList(ym: string): Promise<{ error?: string; periodLabel?: string; invoices: InvoiceRow[]; totals?: InvoiceTotalsRow }> {
  await requireModule(MODULE);
  const range = parseYm(ym);
  if (!range) return { error: "Select a month and year.", invoices: [] };
  try {
    const invoices = await loadInvoices(range);
    return { periodLabel: periodLabel(ym), invoices, totals: sumRows(invoices) };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the invoices.", invoices: [] };
  }
}

export type InvoiceCustomerGroup = { customerId: number; customerNo: string; customerName: string; rows: InvoiceRow[]; totals: InvoiceTotalsRow };

/**
 * Report 2: the invoices of a month grouped by customer. An invoice belongs to the customer of its delivery receipts
 * (through the job orders); if the receipts belong to several customers, to the one with the most receipts.
 */
export async function getInvoiceCustomerReport(ym: string): Promise<{
  error?: string;
  periodLabel?: string;
  groups: InvoiceCustomerGroup[];
  grand?: InvoiceTotalsRow;
}> {
  await requireModule(MODULE);
  const range = parseYm(ym);
  if (!range) return { error: "Select a month and year.", groups: [] };
  try {
    const invoices = await loadInvoices(range);
    const jobOf = new Map<number, number[]>(); // invoice id -> job order ids of its receipts
    for (const ids of chunks(invoices.map((i) => i.id))) {
      const { data, error } = await supabaseAdmin.from("tbl_Deliveries").select("invoice_id, job_order_id").in("invoice_id", ids);
      if (error) return { error: error.message, groups: [] };
      for (const d of (data ?? []) as any[]) jobOf.set(d.invoice_id, [...(jobOf.get(d.invoice_id) ?? []), d.job_order_id]);
    }
    const customerOfJob = new Map<number, number>();
    for (const ids of chunks(Array.from(new Set(Array.from(jobOf.values()).flat())))) {
      const { data, error } = await supabaseAdmin.from("tbl_job_order").select("id, customer_id").in("id", ids);
      if (error) return { error: error.message, groups: [] };
      for (const j of (data ?? []) as any[]) customerOfJob.set(j.id, j.customer_id);
    }
    const customerOfInvoice = new Map<number, number>();
    for (const inv of invoices) {
      const count = new Map<number, number>();
      for (const jid of jobOf.get(inv.id) ?? []) {
        const c = customerOfJob.get(jid);
        if (c != null) count.set(c, (count.get(c) ?? 0) + 1);
      }
      const best = Array.from(count.entries()).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      customerOfInvoice.set(inv.id, best ? best[0] : 0);
    }
    const customers = new Map<number, { no: string; name: string }>();
    for (const ids of chunks(Array.from(new Set(Array.from(customerOfInvoice.values()).filter((c) => c > 0))))) {
      const { data, error } = await supabaseAdmin.from("tbl_Customer").select("id, customer_name, customer_no").in("id", ids);
      if (error) return { error: error.message, groups: [] };
      for (const c of (data ?? []) as any[]) customers.set(c.id, { no: String(c.customer_no ?? ""), name: c.customer_name ?? "" });
    }
    const byCustomer = new Map<number, InvoiceRow[]>();
    for (const inv of invoices) {
      const cid = customerOfInvoice.get(inv.id) ?? 0;
      byCustomer.set(cid, [...(byCustomer.get(cid) ?? []), inv]);
    }
    const groups: InvoiceCustomerGroup[] = Array.from(byCustomer.entries())
      .map(([cid, rows]) => ({
        customerId: cid,
        customerNo: customers.get(cid)?.no ?? "",
        customerName: customers.get(cid)?.name ?? "(no customer)",
        rows,
        totals: sumRows(rows),
      }))
      .sort((a, b) => (Number(a.customerNo) || 1e12) - (Number(b.customerNo) || 1e12) || a.customerName.localeCompare(b.customerName));
    return { periodLabel: periodLabel(ym), groups, grand: sumRows(invoices) };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the report.", groups: [] };
  }
}

export type InvoicePrint = {
  invoiceNumber: number;
  dateInvoice: string;
  aliasName: string;
  aliasAddress: string;
  /** digits only */
  aliasTin: string;
  lines: { quantity: number; dyeName: string; description: string; unitPrice: number; amount: number }[];
  grossAmount: number;
  discount: number;
  deduction: number;
  vat: number;
  /** Service Income */
  vatable: number;
};

/** The data of the printed billing invoice. Receipts are summed by dye process, fabric, tone and unit price. */
export async function getInvoicePrint(invoiceId: number): Promise<{ error?: string; invoice?: InvoicePrint }> {
  await requireModule(MODULE);
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return { error: "Select an invoice." };
  try {
    const { data: inv, error } = await supabaseAdmin
      .from("tbl_invoice")
      .select("id, Invoice_number, alias_id, date_invoice, invoice_amount, discount, deduction, VAT, sales_amount")
      .eq("id", invoiceId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!inv) return { error: "This invoice no longer exists." };
    const [{ data: alias }, { data: dels, error: dErr }] = await Promise.all([
      supabaseAdmin.from("tbl_Alias").select("alias_name, TIN_number, alias_address").eq("id", (inv as any).alias_id).maybeSingle(),
      supabaseAdmin.from("tbl_Deliveries").select("job_order_id, delivered_body_wt, delivered_1x1_wt, delivered_cc_wt").eq("invoice_id", invoiceId).limit(5000),
    ]);
    if (dErr) return { error: dErr.message };
    const jobs = new Map<number, any>();
    for (const ids of chunks(Array.from(new Set(((dels ?? []) as any[]).map((d) => d.job_order_id as number))))) {
      const { data, error: jErr } = await supabaseAdmin.from("tbl_job_order").select("id, tone_id, fabric_id, dye_process_id, unit_price").in("id", ids);
      if (jErr) return { error: jErr.message };
      for (const j of (data ?? []) as any[]) jobs.set(j.id, j);
    }
    const [{ data: tones }, { data: fabrics }, { data: dyes }] = await Promise.all([
      supabaseAdmin.from("tbl_tone").select("id, tone_name").limit(5000),
      supabaseAdmin.from("tbl_Fabric").select("id, fabric_name").limit(5000),
      supabaseAdmin.from("tbl_dye_process_type").select("id, dye_process_name").limit(5000),
    ]);
    const toneName = new Map<number, string>(((tones ?? []) as any[]).map((x) => [x.id, x.tone_name ?? ""]));
    const fabricName = new Map<number, string>(((fabrics ?? []) as any[]).map((x) => [x.id, x.fabric_name ?? ""]));
    const dyeName = new Map<number, string>(((dyes ?? []) as any[]).map((x) => [x.id, x.dye_process_name ?? ""]));

    // one row per tone, dye process and fabric: the weights are summed and so are the amounts
    const map = new Map<string, { quantity: number; amount: number; dyeName: string; description: string }>();
    for (const d of (dels ?? []) as any[]) {
      const j = jobs.get(d.job_order_id) ?? {};
      const weight = (d.delivered_body_wt ?? 0) + (d.delivered_1x1_wt ?? 0) + (d.delivered_cc_wt ?? 0);
      const key = `${j.tone_id ?? 0}|${j.dye_process_id ?? 0}|${j.fabric_id ?? 0}`;
      const g = map.get(key) ?? {
        quantity: 0,
        amount: 0,
        dyeName: dyeName.get(j.dye_process_id) ?? "",
        description: [fabricName.get(j.fabric_id) ?? "", toneName.get(j.tone_id) ?? ""].filter(Boolean).join(" "),
      };
      g.quantity += weight;
      g.amount += weight * (j.unit_price ?? 0);
      map.set(key, g);
    }
    const lines = Array.from(map.values())
      .map((g) => {
        const quantity = r2(g.quantity);
        const amount = r2(g.amount);
        return { quantity, dyeName: g.dyeName, description: g.description, amount, unitPrice: quantity > 0 ? r2(amount / quantity) : 0 };
      })
      .sort((a, b) => a.dyeName.localeCompare(b.dyeName) || a.description.localeCompare(b.description));
    const a = alias as any;
    const i = inv as any;
    return {
      invoice: {
        invoiceNumber: Number(i.Invoice_number),
        dateInvoice: i.date_invoice,
        aliasName: a?.alias_name ?? "",
        aliasAddress: a?.alias_address ?? "",
        aliasTin: a?.TIN_number == null ? "" : String(a.TIN_number),
        lines,
        grossAmount: i.invoice_amount ?? 0,
        discount: i.discount ?? 0,
        deduction: i.deduction ?? 0,
        vat: i.VAT ?? 0,
        vatable: i.sales_amount ?? 0,
      },
    };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the invoice." };
  }
}

/** Stores the percentage as the customer's default discount rate (tbl_Customer.discounts_rate, 5 = 5%). */
export async function setCustomerDiscountRate(customerId: number, ratePercent: number): Promise<{ error?: string }> {
  await requireModule(MODULE);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) return { error: "Select the customer first." };
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) return { error: "The discount rate must be between 0 and 100." };
  const { error } = await supabaseAdmin.from("tbl_Customer").update({ discounts_rate: ratePercent }).eq("id", customerId);
  if (error) {
    if (/integer/i.test(error.message)) {
      return { error: "The discount rate column only holds whole numbers, so a rate with decimals cannot be saved as the default." };
    }
    return { error: error.message };
  }
  return {};
}
