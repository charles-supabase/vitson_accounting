"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { round2 } from "@/lib/report-format";

export type DeliveryLookups = {
  types: { id: number; name: string }[];
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
  const { data } = await supabaseAdmin.from("tbl_receivable_type").select("id, receivable_type").order("id");
  return { types: (data ?? []).map((t: any) => ({ id: t.id, name: t.receivable_type })) };
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

export async function saveDelivery(input: {
  jobOrderId: number | null;
  dateDelivery: string;
  deliveryReceipt: number;
  receivableTypeId: number | null;
  totalDeliveredWt: number;
}): Promise<{ error?: string }> {
  await requireModule("deliveries");
  const { jobOrderId, dateDelivery, deliveryReceipt, receivableTypeId, totalDeliveredWt } = input;
  if (!jobOrderId) return { error: "Select a job ticket." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDelivery) || Number.isNaN(Date.parse(dateDelivery))) return { error: "Enter the delivery date." };
  if (!Number.isInteger(deliveryReceipt) || deliveryReceipt <= 0) return { error: "Enter the delivery receipt number." };
  if (!receivableTypeId) return { error: "Select the receivable type." };
  if (!(totalDeliveredWt > 0)) return { error: "Enter a delivered weight greater than zero." };

  const { data: dup, error: dupErr } = await supabaseAdmin.from("tbl_Deliveries").select("id").eq("job_order_id", jobOrderId).limit(1);
  if (dupErr) return { error: dupErr.message };
  if (dup && dup.length > 0) return { error: "This job ticket already has a delivery." };

  // invoice_id is required by the table; 0 means "not invoiced yet"
  const { error } = await supabaseAdmin.from("tbl_Deliveries").insert({
    job_order_id: jobOrderId,
    delivery_receipt: deliveryReceipt,
    receivable_type_id: receivableTypeId,
    date_delivery: dateDelivery,
    total_delivered_wt: round2(totalDeliveredWt),
    invoice_id: 0,
  });
  if (error) return { error: error.message };
  revalidatePath("/deliveries");
  return {};
}
