"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { verifyAppPassword } from "@/lib/app-password";
import { round2 } from "@/lib/report-format";
import { customerNoToNumber, parseCustomerNos } from "@/lib/alias-customers";

export type DeliveryLookups = {
  types: { id: number; name: string }[];
  /** every customer, for adding a new job order; `no` is the customer number (customer_no without leading zeros) */
  customers: { id: number; name: string; no: number | null }[];
  /** every alias with the customer numbers parsed from associated_customer (id 0 = "no alias", used by small delivery receipts) */
  aliases: { id: number; name: string; customerNos: number[] }[];
  tones: { id: number; name: string }[];
  fabrics: { id: number; name: string }[];
  dyes: { id: number; name: string }[];
};

export type AvailableTicket = {
  id: number;
  jobTicket: string;
  totalWeight: number;
  totalRolls: number;
  unitPrice: number;
};

const PAGE = 1000;
const CHUNK = 100;

/** Job orders that have no row in tbl_Deliveries yet, optionally for one customer. */
async function loadAvailable(customerId: number | null): Promise<(AvailableTicket & { customerId: number })[]> {
  const jobs: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabaseAdmin
      .from("tbl_job_order")
      .select("id, job_ticket, total_weight, total_rolls, unit_price, customer_id")
      .order("id")
      .range(from, from + PAGE - 1);
    if (customerId != null) q = q.eq("customer_id", customerId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    jobs.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  // job orders that already have a delivery
  const delivered = new Set<number>();
  const ids = jobs.map((j) => j.id as number);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabaseAdmin
      .from("tbl_Deliveries")
      .select("job_order_id")
      .in("job_order_id", ids.slice(i, i + CHUNK));
    if (error) throw new Error(error.message);
    for (const d of data ?? []) delivered.add(d.job_order_id);
  }

  return jobs
    .filter((j) => !delivered.has(j.id))
    .map((j) => ({
      id: j.id,
      jobTicket: j.job_ticket ?? "",
      totalWeight: j.total_weight ?? 0,
      totalRolls: j.total_rolls ?? 0,
      unitPrice: j.unit_price ?? 0,
      customerId: j.customer_id,
    }))
    .sort((a, b) => a.jobTicket.localeCompare(b.jobTicket, undefined, { numeric: true }));
}

export async function getDeliveryLookups(): Promise<DeliveryLookups> {
  await requireModule("deliveries");
  const [t, c, a, tone, fab, dye] = await Promise.all([
    supabaseAdmin.from("tbl_receivable_type").select("id, receivable_type").order("id"),
    supabaseAdmin.from("tbl_Customer").select("id, customer_name, customer_no").order("customer_name"),
    supabaseAdmin.from("tbl_Alias").select("id, alias_name, associated_customer").order("alias_name").limit(5000),
    supabaseAdmin.from("tbl_tone").select("id, tone_name").order("tone_name"),
    supabaseAdmin.from("tbl_Fabric").select("id, fabric_name").order("fabric_name"),
    supabaseAdmin.from("tbl_dye_process_type").select("id, dye_process_name").order("dye_process_name"),
  ]);
  return {
    types: (t.data ?? []).map((x: any) => ({ id: x.id, name: x.receivable_type })),
    customers: (c.data ?? []).map((x: any) => ({ id: x.id, name: x.customer_name, no: customerNoToNumber(x.customer_no) })),
    aliases: (a.data ?? []).map((x: any) => ({ id: x.id, name: x.alias_name ?? "", customerNos: parseCustomerNos(x.associated_customer) })),
    tones: (tone.data ?? []).map((x: any) => ({ id: x.id, name: x.tone_name })),
    fabrics: (fab.data ?? []).map((x: any) => ({ id: x.id, name: x.fabric_name })),
    dyes: (dye.data ?? []).map((x: any) => ({ id: x.id, name: x.dye_process_name })),
  };
}

/** Customers that still have at least one job ticket without a delivery. */
export async function getCustomersWithTickets(): Promise<{ error?: string; customers?: { id: number; name: string }[] }> {
  await requireModule("deliveries");
  try {
    const available = await loadAvailable(null);
    const ids = Array.from(new Set(available.map((a) => a.customerId)));
    if (ids.length === 0) return { customers: [] };
    const { data, error } = await supabaseAdmin.from("tbl_Customer").select("id, customer_name").in("id", ids).order("customer_name");
    if (error) return { error: error.message };
    return { customers: (data ?? []).map((c: any) => ({ id: c.id, name: c.customer_name })) };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the customers." };
  }
}

/** Job tickets of the customer whose job order id is not in tbl_Deliveries. */
export async function getAvailableTickets(customerId: number): Promise<{ error?: string; tickets?: AvailableTicket[] }> {
  await requireModule("deliveries");
  if (!customerId) return { tickets: [] };
  try {
    const list = await loadAvailable(customerId);
    return { tickets: list.map(({ customerId: _c, ...t }) => t) };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the job tickets." };
  }
}

/**
 * The alias of a delivery must be an alias whose associated_customer lists the customer's customer_no.
 * "No alias" (id 0) is for small delivery receipts. A value that is already saved on the delivery may stay as it is.
 * Returns an error text, or null when the alias is fine.
 */
async function checkAlias(
  aliasId: number | null,
  customerId: number,
  receivableTypeId: number | null,
  currentAliasId: number | null,
): Promise<string | null> {
  if (aliasId == null || aliasId === currentAliasId) return null;
  const { data: alias, error } = await supabaseAdmin.from("tbl_Alias").select("id, associated_customer").eq("id", aliasId).maybeSingle();
  if (error) return error.message;
  if (!alias) return "The selected alias no longer exists.";
  if (aliasId === 0) {
    const { data: type } = await supabaseAdmin.from("tbl_receivable_type").select("receivable_type").eq("id", receivableTypeId ?? 0).maybeSingle();
    return /small/i.test(String(type?.receivable_type ?? "")) ? null : "NO ALIAS can only be used for a small delivery receipt.";
  }
  const { data: cust } = await supabaseAdmin.from("tbl_Customer").select("customer_no").eq("id", customerId).maybeSingle();
  const no = customerNoToNumber(cust?.customer_no);
  if (no == null || !parseCustomerNos(alias.associated_customer).includes(no)) return "The selected alias is not linked to this customer.";
  return null;
}

export async function saveDelivery(input: {
  jobOrderId: number | null;
  dateDelivery: string;
  deliveryReceipt: number;
  receivableTypeId: number | null;
  totalDeliveredWt: number;
  totalRollCount: number;
}): Promise<{ error?: string }> {
  await requireModule("deliveries");
  const { jobOrderId, dateDelivery, deliveryReceipt, receivableTypeId, totalDeliveredWt, totalRollCount } = input;
  if (!jobOrderId) return { error: "Select a job ticket." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDelivery) || Number.isNaN(Date.parse(dateDelivery))) return { error: "Enter the delivery date." };
  if (!Number.isInteger(deliveryReceipt) || deliveryReceipt <= 0) return { error: "Enter the delivery receipt number." };
  if (!receivableTypeId) return { error: "Select the receivable type." };
  if (!(totalDeliveredWt > 0)) return { error: "Enter a delivered weight greater than zero." };
  if (!Number.isInteger(totalRollCount) || totalRollCount <= 0) return { error: "Enter the number of rolls delivered." };

  const { data: dup, error: dupErr } = await supabaseAdmin.from("tbl_Deliveries").select("id").eq("job_order_id", jobOrderId).limit(1);
  if (dupErr) return { error: dupErr.message };
  if (dup && dup.length > 0) return { error: "This job ticket already has a delivery." };

  // invoice_id is 0 until the delivery is invoiced
  const { error } = await supabaseAdmin.from("tbl_Deliveries").insert({
    job_order_id: jobOrderId,
    delivery_receipt: deliveryReceipt,
    receivable_type_id: receivableTypeId,
    date_delivery: dateDelivery,
    total_delivered_wt: round2(totalDeliveredWt),
    total_roll_count: totalRollCount,
    invoice_id: 0,
  });
  if (error) return { error: error.message };
  revalidatePath("/deliveries");
  return {};
}

export type DeliveryRecord = {
  id: number;
  jobOrderId: number;
  deliveryReceipt: number;
  dateDelivery: string;
  receivableTypeId: number;
  totalDeliveredWt: number;
  totalRollCount: number;
  jobTicket: string;
  ticketWeight: number;
  ticketRolls: number;
  customerId: number;
  customerName: string;
  /** CusJONo of the job order (empty when tbl_job_order has no cus_jo_no yet) */
  cusJoNo: string;
  /** customer number (customer_no without leading zeros): the aliases of the delivery are those that list it */
  customerNo: number | null;
  aliasId: number | null;
  /** from the job order */
  color: string;
  toneId: number | null;
  toneName: string;
  fabricId: number | null;
  fabricName: string;
  dyeProcessId: number | null;
  dyeProcessName: string;
};

async function loadPaged(table: string, columns: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Every delivery with its job ticket, customer and CusJONo, newest delivery receipt first. */
export async function getDeliveryIndex(): Promise<{ error?: string; records?: DeliveryRecord[] }> {
  await requireModule("deliveries");
  try {
    const probe = await supabaseAdmin.from("tbl_job_order").select("cus_jo_no").limit(1);
    const hasCusJo = !probe.error;
    const [deliveries, jobs, customers, tones, fabrics, dyes] = await Promise.all([
      loadPaged("tbl_Deliveries", "id, job_order_id, delivery_receipt, date_delivery, receivable_type_id, total_delivered_wt, total_roll_count, alias_id"),
      loadPaged("tbl_job_order", "id, job_ticket, total_weight, total_rolls, customer_id, color, tone_id, fabric_id, dye_process_id" + (hasCusJo ? ", cus_jo_no" : "")),
      loadPaged("tbl_Customer", "id, customer_name, customer_no"),
      loadPaged("tbl_tone", "id, tone_name"),
      loadPaged("tbl_Fabric", "id, fabric_name"),
      loadPaged("tbl_dye_process_type", "id, dye_process_name"),
    ]);
    const jobById = new Map<number, any>(jobs.map((j) => [j.id, j]));
    const nameById = new Map<number, string>(customers.map((c) => [c.id, c.customer_name]));
    const noById = new Map<number, number | null>(customers.map((c) => [c.id, customerNoToNumber(c.customer_no)]));
    const toneById = new Map<number, string>(tones.map((x) => [x.id, x.tone_name]));
    const fabricById = new Map<number, string>(fabrics.map((x) => [x.id, x.fabric_name]));
    const dyeById = new Map<number, string>(dyes.map((x) => [x.id, x.dye_process_name]));
    const records: DeliveryRecord[] = deliveries
      .map((d) => {
        const j = jobById.get(d.job_order_id);
        return {
          id: d.id,
          jobOrderId: d.job_order_id,
          deliveryReceipt: d.delivery_receipt,
          dateDelivery: d.date_delivery,
          receivableTypeId: d.receivable_type_id,
          totalDeliveredWt: d.total_delivered_wt ?? 0,
          totalRollCount: d.total_roll_count ?? 0,
          jobTicket: j?.job_ticket ?? "",
          ticketWeight: j?.total_weight ?? 0,
          ticketRolls: j?.total_rolls ?? 0,
          customerId: j?.customer_id ?? 0,
          customerName: nameById.get(j?.customer_id) ?? "",
          cusJoNo: j?.cus_jo_no ?? "",
          customerNo: noById.get(j?.customer_id) ?? null,
          aliasId: d.alias_id ?? null,
          color: j?.color ?? "",
          toneId: j?.tone_id ?? null,
          toneName: toneById.get(j?.tone_id) ?? "",
          fabricId: j?.fabric_id ?? null,
          fabricName: fabricById.get(j?.fabric_id) ?? "",
          dyeProcessId: j?.dye_process_id ?? null,
          dyeProcessName: dyeById.get(j?.dye_process_id) ?? "",
        };
      })
      .sort((a, b) => b.deliveryReceipt - a.deliveryReceipt || b.id - a.id);
    return { records };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the deliveries." };
  }
}

const DELIVERY_PASSWORD_KEYS = ["delivery_edit_password", "check_cancel_password"];

/** Checks the password that unlocks editing of a saved delivery. */
export async function verifyDeliveryPassword(password: string): Promise<{ error?: string }> {
  await requireModule("deliveries");
  const check = await verifyAppPassword(DELIVERY_PASSWORD_KEYS, password);
  return check.ok ? {} : { error: check.error };
}

/** Changes a saved delivery. The unlock password is checked again here. */
export async function updateDelivery(input: {
  id: number;
  dateDelivery: string;
  deliveryReceipt: number;
  receivableTypeId: number | null;
  totalDeliveredWt: number;
  totalRollCount: number;
  /** the alias of the delivery; null = none */
  aliasId: number | null;
  password: string;
}): Promise<{ error?: string }> {
  await requireModule("deliveries");
  const check = await verifyAppPassword(DELIVERY_PASSWORD_KEYS, input.password);
  if (!check.ok) return { error: check.error };

  const { id, dateDelivery, deliveryReceipt, receivableTypeId, totalDeliveredWt, totalRollCount } = input;
  if (!id) return { error: "Select a delivery." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDelivery) || Number.isNaN(Date.parse(dateDelivery))) return { error: "Enter the delivery date." };
  if (!Number.isInteger(deliveryReceipt) || deliveryReceipt <= 0) return { error: "Enter the delivery receipt number." };
  if (!receivableTypeId) return { error: "Select the receivable type." };
  if (!(totalDeliveredWt > 0)) return { error: "Enter a delivered weight greater than zero." };
  if (!Number.isInteger(totalRollCount) || totalRollCount <= 0) return { error: "Enter the number of rolls delivered." };

  // the alias must belong to the delivery's customer
  const { data: current, error: curErr } = await supabaseAdmin.from("tbl_Deliveries").select("job_order_id, alias_id").eq("id", id).maybeSingle();
  if (curErr) return { error: curErr.message };
  if (!current) return { error: "This delivery no longer exists. Reload the page." };
  const { data: job } = await supabaseAdmin.from("tbl_job_order").select("customer_id").eq("id", current.job_order_id).maybeSingle();
  const aliasError = await checkAlias(input.aliasId ?? null, job?.customer_id ?? 0, receivableTypeId, current.alias_id ?? null);
  if (aliasError) return { error: aliasError };

  const { error } = await supabaseAdmin
    .from("tbl_Deliveries")
    .update({
      delivery_receipt: deliveryReceipt,
      receivable_type_id: receivableTypeId,
      date_delivery: dateDelivery,
      total_delivered_wt: round2(totalDeliveredWt),
      total_roll_count: totalRollCount,
      alias_id: input.aliasId ?? null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/deliveries");
  return {};
}

/**
 * Adds a delivery that has no job order in the app yet: the job order and its delivery are created together.
 * access_sales_id is 0 and access_job_order_link_id is a negative number, so they can never clash with Access ids.
 */
export async function addJobOrderWithDelivery(input: {
  customerId: number | null;
  jobTicket: string;
  cusJoNo: string;
  ticketWeight: number;
  ticketRolls: number;
  unitPrice: number;
  dateDelivery: string;
  deliveryReceipt: number;
  receivableTypeId: number | null;
  totalDeliveredWt: number;
  totalRollCount: number;
  /** the alias of the delivery; null = none */
  aliasId: number | null;
  /** job order details */
  color: string;
  toneId: number | null;
  fabricId: number | null;
  dyeProcessId: number | null;
}): Promise<{ error?: string; deliveryId?: number }> {
  await requireModule("deliveries");
  const jobTicket = input.jobTicket.trim();
  const cusJoNo = input.cusJoNo.trim();
  if (!input.customerId) return { error: "Select the customer." };
  if (!jobTicket) return { error: "Enter the job ticket." };
  if (!cusJoNo) return { error: "Enter the Customer Job Order." };
  if (!(input.ticketWeight > 0)) return { error: "Enter the ticket weight." };
  if (!Number.isInteger(input.ticketRolls) || input.ticketRolls <= 0) return { error: "Enter the ticket rolls." };
  if (!(input.unitPrice > 0)) return { error: "Enter the unit price." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateDelivery) || Number.isNaN(Date.parse(input.dateDelivery))) return { error: "Enter the delivery date." };
  if (!Number.isInteger(input.deliveryReceipt) || input.deliveryReceipt <= 0) return { error: "Enter the delivery receipt number." };
  if (!input.receivableTypeId) return { error: "Select the receivable type." };
  if (!(input.totalDeliveredWt > 0)) return { error: "Enter a delivered weight greater than zero." };
  if (!Number.isInteger(input.totalRollCount) || input.totalRollCount <= 0) return { error: "Enter the number of rolls delivered." };

  const color = input.color.trim();
  if (color.length > 100) return { error: "The color is too long (100 characters at most)." };
  for (const [table, id, label] of [
    ["tbl_tone", input.toneId, "tone"],
    ["tbl_Fabric", input.fabricId, "fabric"],
    ["tbl_dye_process_type", input.dyeProcessId, "dye process"],
  ] as const) {
    if (id == null) continue;
    const { data: ref } = await supabaseAdmin.from(table).select("id").eq("id", id).maybeSingle();
    if (!ref) return { error: `The selected ${label} no longer exists. Reload the page.` };
  }
  const aliasError = await checkAlias(input.aliasId ?? null, input.customerId, input.receivableTypeId, null);
  if (aliasError) return { error: aliasError };

  const { data: dup, error: dupErr } = await supabaseAdmin.from("tbl_job_order").select("id").eq("job_ticket", jobTicket).limit(1);
  if (dupErr) return { error: dupErr.message };
  if (dup && dup.length > 0) return { error: `Job ticket ${jobTicket} already exists.` };

  const { data: lowest, error: linkErr } = await supabaseAdmin
    .from("tbl_job_order")
    .select("access_job_order_link_id")
    .order("access_job_order_link_id", { ascending: true })
    .limit(1);
  if (linkErr) return { error: linkErr.message };
  const linkId = Math.min(lowest?.[0]?.access_job_order_link_id ?? 0, 0) - 1;

  const { data: job, error: jobErr } = await supabaseAdmin
    .from("tbl_job_order")
    .insert({
      job_ticket: jobTicket,
      total_weight: round2(input.ticketWeight),
      total_rolls: input.ticketRolls,
      unit_price: round2(input.unitPrice),
      access_sales_id: 0,
      access_job_order_link_id: linkId,
      customer_id: input.customerId,
      cus_jo_no: cusJoNo,
      color: color || null,
      tone_id: input.toneId,
      fabric_id: input.fabricId,
      dye_process_id: input.dyeProcessId,
    })
    .select("id")
    .single();
  if (jobErr || !job) return { error: jobErr?.message ?? "Could not add the job order." };

  const { data: del, error: delErr } = await supabaseAdmin
    .from("tbl_Deliveries")
    .insert({
      job_order_id: job.id,
      delivery_receipt: input.deliveryReceipt,
      receivable_type_id: input.receivableTypeId,
      date_delivery: input.dateDelivery,
      total_delivered_wt: round2(input.totalDeliveredWt),
      total_roll_count: input.totalRollCount,
      alias_id: input.aliasId ?? null,
      invoice_id: 0,
    })
    .select("id")
    .single();
  if (delErr || !del) {
    // undo the job order so nothing half-finished is left behind
    await supabaseAdmin.from("tbl_job_order").delete().eq("id", job.id);
    return { error: delErr?.message ?? "Could not add the delivery." };
  }
  revalidatePath("/deliveries");
  return { deliveryId: del.id };
}
