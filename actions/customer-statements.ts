"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { parseYm, round2 } from "@/lib/report-format";
import { groupKeyOf, pricesAllConsistent } from "@/lib/price-check";

const MODULE = "customer_statements" as const;
const PAGE = 1000;
const CHUNK = 200;

export type StatementCustomer = { id: number; name: string; deliveries: number };

export type StatementDelivery = {
  id: number;
  jobOrderId: number;
  deliveryReceipt: number;
  dateDelivery: string;
  receivableTypeId: number;
  invoiceId: number;
  jobTicket: string;
  cusJoNo: string;
  color: string;
  toneId: number | null;
  toneName: string;
  fabricId: number | null;
  fabricName: string;
  dyeId: number | null;
  dyeName: string;
  /** tbl_job_order.unit_price (one job order per delivery) */
  unitPrice: number;
  bodyWt: number;
  bodyCount: number;
  x1Wt: number;
  x1Count: number;
  ccWt: number;
  ccCount: number;
  /** computed: Body + 1x1 + C+C */
  totalWt: number;
  totalRolls: number;
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

/** Customers that have at least one delivery in the month (deliveries are linked to customers through tbl_job_order). */
export async function getStatementCustomers(ym: string): Promise<{ error?: string; customers: StatementCustomer[] }> {
  await requireModule(MODULE);
  const range = parseYm(ym);
  if (!range) return { error: "Select a month and year.", customers: [] };
  try {
    const deliveries = await fetchAll<{ job_order_id: number }>((from, to) =>
      supabaseAdmin
        .from("tbl_Deliveries")
        .select("job_order_id")
        .gte("date_delivery", range.start)
        .lt("date_delivery", range.end)
        .order("id")
        .range(from, to),
    );
    const perJob = new Map<number, number>();
    for (const d of deliveries) perJob.set(d.job_order_id, (perJob.get(d.job_order_id) ?? 0) + 1);

    const perCustomer = new Map<number, number>();
    for (const ids of chunks(Array.from(perJob.keys()))) {
      const { data, error } = await supabaseAdmin.from("tbl_job_order").select("id, customer_id").in("id", ids);
      if (error) return { error: error.message, customers: [] };
      for (const j of (data ?? []) as any[]) perCustomer.set(j.customer_id, (perCustomer.get(j.customer_id) ?? 0) + (perJob.get(j.id) ?? 0));
    }

    const names = new Map<number, string>();
    for (const ids of chunks(Array.from(perCustomer.keys()))) {
      const { data, error } = await supabaseAdmin.from("tbl_Customer").select("id, customer_name").in("id", ids);
      if (error) return { error: error.message, customers: [] };
      for (const c of (data ?? []) as any[]) names.set(c.id, c.customer_name ?? "");
    }

    const customers = Array.from(perCustomer.entries())
      .map(([id, deliveries]) => ({ id, name: names.get(id) ?? `Customer #${id}`, deliveries }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { customers };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the customers.", customers: [] };
  }
}

/** Every delivery of one customer in the period (internal: callers check access first). */
async function loadDeliveries(range: { start: string; end: string }, customerId: number): Promise<StatementDelivery[]> {
  const jobs = await fetchAll<any>((from, to) =>
    supabaseAdmin
      .from("tbl_job_order")
      .select("id, job_ticket, cus_jo_no, color, tone_id, fabric_id, dye_process_id, unit_price")
      .eq("customer_id", customerId)
      .order("id")
      .range(from, to),
  );
  const jobById = new Map<number, any>(jobs.map((j) => [j.id, j]));

  const rows: any[] = [];
  for (const ids of chunks(Array.from(jobById.keys()))) {
    const { data, error } = await supabaseAdmin
      .from("tbl_Deliveries")
      .select(
        "id, job_order_id, delivery_receipt, receivable_type_id, date_delivery, invoice_id, delivered_body_wt, count_body, delivered_1x1_wt, count_1x1, delivered_cc_wt, count_cc",
      )
      .in("job_order_id", ids)
      .gte("date_delivery", range.start)
      .lt("date_delivery", range.end);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }

  const [{ data: tones }, { data: fabrics }, { data: dyes }] = await Promise.all([
    supabaseAdmin.from("tbl_tone").select("id, tone_name").limit(5000),
    supabaseAdmin.from("tbl_Fabric").select("id, fabric_name").limit(5000),
    supabaseAdmin.from("tbl_dye_process_type").select("id, dye_process_name").limit(5000),
  ]);
  const toneName = new Map<number, string>(((tones ?? []) as any[]).map((x) => [x.id, x.tone_name ?? ""]));
  const fabricName = new Map<number, string>(((fabrics ?? []) as any[]).map((x) => [x.id, x.fabric_name ?? ""]));
  const dyeName = new Map<number, string>(((dyes ?? []) as any[]).map((x) => [x.id, x.dye_process_name ?? ""]));

  const deliveries: StatementDelivery[] = rows
    .map((d) => {
      const j = jobById.get(d.job_order_id) ?? {};
      const bodyWt = d.delivered_body_wt ?? 0;
      const x1Wt = d.delivered_1x1_wt ?? 0;
      const ccWt = d.delivered_cc_wt ?? 0;
      const bodyCount = d.count_body ?? 0;
      const x1Count = d.count_1x1 ?? 0;
      const ccCount = d.count_cc ?? 0;
      return {
        id: d.id,
        jobOrderId: d.job_order_id,
        deliveryReceipt: d.delivery_receipt,
        dateDelivery: d.date_delivery,
        receivableTypeId: d.receivable_type_id,
        invoiceId: d.invoice_id ?? 0,
        jobTicket: j.job_ticket ?? "",
        cusJoNo: j.cus_jo_no ?? "",
        color: j.color ?? "",
        toneId: j.tone_id ?? null,
        toneName: toneName.get(j.tone_id) ?? "",
        fabricId: j.fabric_id ?? null,
        fabricName: fabricName.get(j.fabric_id) ?? "",
        dyeId: j.dye_process_id ?? null,
        dyeName: dyeName.get(j.dye_process_id) ?? "",
        unitPrice: j.unit_price ?? 0,
        bodyWt,
        bodyCount,
        x1Wt,
        x1Count,
        ccWt,
        ccCount,
        totalWt: round2(bodyWt + x1Wt + ccWt),
        totalRolls: bodyCount + x1Count + ccCount,
      };
    })
    .sort((a, b) => a.deliveryReceipt - b.deliveryReceipt || a.id - b.id);
  return deliveries;
}

/** Every delivery of one customer in the month, by delivery receipt (ascending), with its job order details and price. */
export async function getStatementDeliveries(ym: string, customerId: number): Promise<{ error?: string; deliveries: StatementDelivery[] }> {
  await requireModule(MODULE);
  const range = parseYm(ym);
  if (!range) return { error: "Select a month and year.", deliveries: [] };
  if (!Number.isSafeInteger(customerId) || customerId <= 0) return { error: "Select a customer.", deliveries: [] };
  try {
    return { deliveries: await loadDeliveries(range, customerId) };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the deliveries.", deliveries: [] };
  }
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type StatementReport = {
  /** e.g. "September 2026" */
  periodLabel: string;
  customerName: string;
  customerNo: string;
  typeName: "Big" | "Small";
  deliveries: StatementDelivery[];
};

/**
 * The data of a printed statement: the customer's Big (rt 1) or Small (rt 2) deliveries of the month.
 * It refuses when the prices of a tone / fabric / dye process group are not all the same, so a report
 * cannot be printed with wrong prices even if the page is opened directly.
 */
export async function getStatementReport(ym: string, customerId: number, rt: number): Promise<{ error?: string; report?: StatementReport }> {
  await requireModule(MODULE);
  const range = parseYm(ym);
  if (!range) return { error: "Select a month and year." };
  if (!Number.isSafeInteger(customerId) || customerId <= 0) return { error: "Select a customer." };
  if (rt !== 1 && rt !== 2) return { error: "Select Big or Small." };
  try {
    const { data: cust, error: cErr } = await supabaseAdmin.from("tbl_Customer").select("customer_name, customer_no").eq("id", customerId).maybeSingle();
    if (cErr) return { error: cErr.message };
    if (!cust) return { error: "This customer no longer exists." };
    const deliveries = (await loadDeliveries(range, customerId)).filter((d) => d.receivableTypeId === rt);
    if (deliveries.length === 0) return { error: `No ${rt === 1 ? "Big" : "Small"} deliveries for this customer in this period.` };
    const rows = deliveries.map((d) => ({ id: d.id, groupKey: groupKeyOf(d.toneId, d.fabricId, d.dyeId), price: d.unitPrice }));
    if (!pricesAllConsistent(rows)) {
      return { error: "The prices of this customer are not all the same within each tone, fabric and dye process group. Correct them on the Customer Statements page first." };
    }
    const month = Number(ym.slice(5, 7));
    return {
      report: {
        periodLabel: `${MONTH_NAMES[month - 1]} ${ym.slice(0, 4)}`,
        customerName: (cust as any).customer_name ?? "",
        customerNo: String((cust as any).customer_no ?? ""),
        typeName: rt === 1 ? "Big" : "Small",
        deliveries,
      },
    };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the statement." };
  }
}

/** Saves corrected prices (tbl_job_order.unit_price). A price of an invoiced delivery cannot be changed. */
export async function saveJobOrderPrices(changes: { jobOrderId: number; price: number }[]): Promise<{ error?: string; saved?: number }> {
  await requireModule(MODULE);
  if (!Array.isArray(changes) || changes.length === 0) return { error: "There are no price changes to save." };
  if (changes.length > 500) return { error: "Too many changes at once. Save fewer prices at a time." };

  const clean = new Map<number, number>();
  for (const c of changes) {
    if (!Number.isSafeInteger(c?.jobOrderId) || c.jobOrderId <= 0) return { error: "A price could not be matched to its job order. Reload the page." };
    if (!Number.isFinite(c.price) || c.price <= 0 || c.price >= 10_000_000) return { error: "Every price must be greater than zero." };
    clean.set(c.jobOrderId, round2(c.price));
  }

  try {
    const ids = Array.from(clean.keys());
    for (const part of chunks(ids)) {
      const { data: invoiced, error } = await supabaseAdmin.from("tbl_Deliveries").select("job_order_id").in("job_order_id", part).neq("invoice_id", 0).limit(1);
      if (error) return { error: error.message };
      if (invoiced && invoiced.length > 0) return { error: "A delivery in this list is already invoiced, so its price cannot be changed." };
      const { data: found, error: fErr } = await supabaseAdmin.from("tbl_job_order").select("id").in("id", part);
      if (fErr) return { error: fErr.message };
      if ((found ?? []).length !== part.length) return { error: "A job order no longer exists. Reload the page." };
    }
    let saved = 0;
    for (const [id, price] of clean) {
      const { error } = await supabaseAdmin.from("tbl_job_order").update({ unit_price: price }).eq("id", id);
      if (error) return { error: `Saved ${saved} price${saved === 1 ? "" : "s"}, then: ${error.message}`, saved };
      saved++;
    }
    return { saved };
  } catch (e: any) {
    return { error: e?.message ?? "Could not save the prices." };
  }
}
