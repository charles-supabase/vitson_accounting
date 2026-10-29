"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getRecipeClient } from "@/lib/supabase/recipe";
import { requireModule } from "@/lib/auth";
import { parseYm, round2 } from "@/lib/report-format";
import type { PopulateResult, JobOrderOut, JobOrderChange, DeliveryOut } from "@/actions/job-orders";

type Row = Record<string, any>;
const PAGE = 1000;
const CHUNK = 100;
const text = (v: unknown) => (v == null ? "" : String(v).trim());
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toId = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const m2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shownList = (list: string[]) => list.slice(0, 5).join(", ") + (list.length > 5 ? ` and ${list.length - 5} more` : "");

/** Every row of a table, page by page (Supabase returns at most 1000 rows per request). */
async function loadAll(client: any, table: string, columns: string, filter?: (q: any) => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = client.from(table).select(columns);
    if (filter) q = filter(q);
    const { data, error } = await q.order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Every row whose `column` is one of `ids` (ids are sent in chunks, each chunk paged). */
async function loadIn(client: any, table: string, columns: string, column: string, ids: number[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    out.push(...(await loadAll(client, table, columns, (q) => q.in(column, ids.slice(i, i + CHUNK)))));
  }
  return out;
}

/**
 * Copies one month of deliveries from the Supabase project "vitson-recipe" into this app.
 *
 * Picks tbl_Delivery records with date_delivery in the month and copied = false. For their job orders it fills
 * tbl_job_order, and for the deliveries tbl_Deliveries; then sets copied = true on the picked tbl_Delivery records.
 *
 * Job order: job_ticket, access_job_order_link_id = vitson-recipe job order id, access_sales_id = sales_id,
 * customer_id and cus_jo_no from tbl_Sales_Confirmation (by sales_id), color = tbl_color.color_name (by color_id),
 * tone_id / fabric_id / dye_process_id as they are, total_weight = sum(roll_wt) and total_rolls = count(roll_wt)
 * of tbl_fabric_info (by job order). unit_price = the ticket's own price; when it is empty, the price in
 * tbl_customer_price for customer + dye process + fabric + tone.
 *
 * Delivery: delivery_receipt, receivable_type_id, date_delivery, alias_id (Big only), invoice_id = 0, and from
 * tbl_fabric_info_delivered (by delivery_id): roll_type_id 1 = Body, 2 = 1x1, anything else = C+C (weight sum, roll count).
 *
 * Duplicates: access_job_order_link_id and access_sales_id may repeat (Access ids and vitson-recipe ids can be equal).
 * job_ticket may not: a ticket that is already in the app is replaced in place (same row, never a second one), and two
 * job orders of the same run with the same job_ticket are not both copied.
 */
export async function populateFromSupabase(ym: string): Promise<{ error?: string; result?: PopulateResult }> {
  await requireModule("job_orders");
  const range = parseYm(ym);
  if (!range) return { error: "Select a month and year to populate." };

  try {
    const rc = getRecipeClient();

    // ---- vitson-recipe: the deliveries of the month
    const monthDel = await loadAll(
      rc,
      "tbl_Delivery",
      "id, job_order_id, delivery_receipt, receivable_type_id, date_delivery, alias_id, copied",
      (q) => q.gte("date_delivery", range.start).lt("date_delivery", range.end)
    );
    const alreadyCopied = monthDel.filter((d) => d.copied === true).length;
    const pending = monthDel.filter((d) => d.copied !== true);

    // the app keeps one delivery per job order: the latest one is copied, others are reported and stay uncopied
    pending.sort((a, b) => (a.date_delivery < b.date_delivery ? 1 : a.date_delivery > b.date_delivery ? -1 : b.id - a.id));
    const chosen = new Map<number, Row>(); // job order id -> delivery
    const extras: Row[] = [];
    for (const d of pending) {
      if (chosen.has(d.job_order_id)) extras.push(d);
      else chosen.set(d.job_order_id, d);
    }
    const jobIds = Array.from(chosen.keys());
    const deliveryIds = Array.from(chosen.values()).map((d) => d.id as number);

    // ---- vitson-recipe: job orders, sales confirmations, colors, roll totals, prices
    const jobs = new Map<number, Row>();
    for (const j of await loadIn(rc, "tbl_job_order", "id, sales_id, job_ticket, dye_process_id, fabric_id, tone_id, color_id, unit_price", "id", jobIds)) jobs.set(j.id, j);
    const salesIds = Array.from(new Set(Array.from(jobs.values()).map((j) => j.sales_id).filter((v) => v != null))) as number[];
    const sales = new Map<number, Row>();
    for (const s of await loadIn(rc, "tbl_Sales_Confirmation", "id, customer_id, cus_jo_no", "id", salesIds)) sales.set(s.id, s);
    const colorIds = Array.from(new Set(Array.from(jobs.values()).map((j) => j.color_id).filter((v) => v != null))) as number[];
    const colors = new Map<number, string>();
    for (const c of await loadIn(rc, "tbl_color", "id, color_name", "id", colorIds)) colors.set(c.id, text(c.color_name));

    const ticketTotals = new Map<number, { weight: number; rolls: number }>(); // job order id -> totals of tbl_fabric_info
    for (const r of await loadIn(rc, "tbl_fabric_info", "id, job_order_id, roll_wt", "job_order_id", jobIds)) {
      if (r.roll_wt == null) continue;
      const t = ticketTotals.get(r.job_order_id) ?? { weight: 0, rolls: 0 };
      t.weight += num(r.roll_wt);
      t.rolls += 1;
      ticketTotals.set(r.job_order_id, t);
    }
    type Del = { body: { w: number; n: number }; x1: { w: number; n: number }; cc: { w: number; n: number } };
    const delTotals = new Map<number, Del>(); // delivery id -> delivered totals by roll type
    for (const r of await loadIn(rc, "tbl_fabric_info_delivered", "id, delivery_id, roll_wt, roll_type_id", "delivery_id", deliveryIds)) {
      if (r.roll_wt == null) continue;
      const t = delTotals.get(r.delivery_id) ?? { body: { w: 0, n: 0 }, x1: { w: 0, n: 0 }, cc: { w: 0, n: 0 } };
      const bucket = r.roll_type_id === 1 ? t.body : r.roll_type_id === 2 ? t.x1 : t.cc;
      bucket.w += num(r.roll_wt);
      bucket.n += 1;
      delTotals.set(r.delivery_id, t);
    }
    // price list: customer + dye process + fabric + tone -> unit price (rows without a customer are not usable)
    const priceOf = new Map<string, number>();
    for (const p of await loadAll(rc, "tbl_customer_price", "id, customer_id, dye_process_id, fabric_id, tone_id, unit_price")) {
      if (p.customer_id == null || p.unit_price == null) continue;
      const key = `${p.customer_id}|${p.dye_process_id}|${p.fabric_id}|${p.tone_id}`;
      if (!priceOf.has(key)) priceOf.set(key, num(p.unit_price));
    }

    // ---- app side
    const appCustomers = new Map<number, string>();
    for (const c of await loadAll(supabaseAdmin, "tbl_Customer", "id, customer_name")) appCustomers.set(c.id, c.customer_name);
    const idSet = async (table: string) => new Set<number>((await loadAll(supabaseAdmin, table, "id")).map((r) => r.id as number));
    const appDyes = await idSet("tbl_dye_process_type");
    const appFabrics = await idSet("tbl_Fabric");
    const appTones = await idSet("tbl_tone");
    const appAliasIds = await idSet("tbl_Alias");

    const existingByTicket = new Map<string, Row>();
    for (const j of await loadAll(
      supabaseAdmin,
      "tbl_job_order",
      "id, job_ticket, total_weight, total_rolls, unit_price, access_sales_id, access_job_order_link_id, customer_id, dye_process_id, fabric_id, color, tone_id, cus_jo_no"
    )) {
      existingByTicket.set(j.job_ticket, j);
    }

    // ---- job orders
    const newRows: Row[] = [];
    const newOut: JobOrderOut[] = [];
    const replaceRows: Row[] = [];
    const replaceOut: JobOrderChange[] = [];
    const skipped: PopulateResult["skipped"] = [];
    const warnings: string[] = [];
    const seenTickets = new Set<string>();
    const built: { d: Row; ticket: string; customerName: string }[] = [];

    for (const [jobId, d] of chosen) {
      const job = jobs.get(jobId);
      if (!job) {
        skipped.push({ jobTicket: "", reason: `Job order ${jobId} (delivery ${d.delivery_receipt}) was not found in vitson-recipe.` });
        continue;
      }
      const ticket = text(job.job_ticket);
      if (!ticket) {
        skipped.push({ jobTicket: "", reason: `Job order ${jobId} has no job ticket number.` });
        continue;
      }
      const sc = job.sales_id != null ? sales.get(job.sales_id) : undefined;
      if (!sc) {
        skipped.push({ jobTicket: ticket, reason: "No sales confirmation found for this job order." });
        continue;
      }
      const customerId = toId(sc.customer_id);
      if (customerId == null || !appCustomers.has(customerId)) {
        skipped.push({ jobTicket: ticket, reason: `Customer id ${sc.customer_id ?? "(empty)"} of the sales confirmation is not in the app's customers.` });
        continue;
      }
      const dyeId = toId(job.dye_process_id);
      const fabricId = toId(job.fabric_id);
      const toneId = toId(job.tone_id);
      const missingRef: string[] = [];
      if (dyeId == null || !appDyes.has(dyeId)) missingRef.push(`dye process ${job.dye_process_id ?? "(empty)"}`);
      if (fabricId == null || !appFabrics.has(fabricId)) missingRef.push(`fabric ${job.fabric_id ?? "(empty)"}`);
      if (toneId == null || !appTones.has(toneId)) missingRef.push(`tone ${job.tone_id ?? "(empty)"}`);
      if (missingRef.length > 0) {
        skipped.push({ jobTicket: ticket, reason: `Not in the app's lists: ${missingRef.join(", ")}.` });
        continue;
      }
      const color = job.color_id != null ? colors.get(job.color_id) ?? "" : "";
      if (!color) {
        skipped.push({ jobTicket: ticket, reason: "The job order has no color." });
        continue;
      }
      // unit price: the ticket's own price, else the customer price list
      let unitPrice: number;
      if (job.unit_price != null) {
        unitPrice = round2(num(job.unit_price));
      } else {
        const p = priceOf.get(`${customerId}|${dyeId}|${fabricId}|${toneId}`);
        if (p == null) {
          skipped.push({
            jobTicket: ticket,
            reason: `No unit price on the ticket and none in tbl_customer_price for customer ${customerId}, dye process ${dyeId}, fabric ${fabricId}, tone ${toneId}.`,
          });
          continue;
        }
        unitPrice = round2(p);
      }

      // job_ticket must stay unique: an existing ticket is replaced in place, and a ticket can only be copied once per run
      if (seenTickets.has(ticket)) {
        skipped.push({ jobTicket: ticket, reason: "Another job order copied in this run has the same job ticket number; only the first one was copied." });
        continue;
      }
      seenTickets.add(ticket);
      const old = existingByTicket.get(ticket);

      const t = ticketTotals.get(jobId) ?? { weight: 0, rolls: 0 };
      const customerName = appCustomers.get(customerId) ?? "";
      const next = {
        job_ticket: ticket,
        unit_price: unitPrice,
        access_sales_id: sc.id as number,
        access_job_order_link_id: jobId,
        customer_id: customerId,
        cus_jo_no: text(sc.cus_jo_no),
        total_weight: round2(t.weight),
        total_rolls: t.rolls,
        dye_process_id: dyeId as number,
        fabric_id: fabricId as number,
        color,
        tone_id: toneId as number,
      };
      built.push({ d, ticket, customerName });

      if (!old) {
        newRows.push(next);
        newOut.push({ linkId: jobId, jobTicket: ticket, customerName, unitPrice: next.unit_price, totalWeight: next.total_weight, totalRolls: next.total_rolls });
        continue;
      }
      const changes: JobOrderChange["changes"] = [];
      if (Math.abs(old.unit_price - next.unit_price) >= 0.005) changes.push({ label: "Unit price", before: m2(old.unit_price), after: m2(next.unit_price) });
      if (Math.abs(old.total_weight - next.total_weight) >= 0.005) changes.push({ label: "Total weight", before: m2(old.total_weight), after: m2(next.total_weight) });
      if (old.total_rolls !== next.total_rolls) changes.push({ label: "Total rolls", before: String(old.total_rolls), after: String(next.total_rolls) });
      if (old.customer_id !== next.customer_id) changes.push({ label: "Customer", before: appCustomers.get(old.customer_id) ?? String(old.customer_id), after: customerName });
      if (old.access_sales_id !== next.access_sales_id) changes.push({ label: "Sales record", before: String(old.access_sales_id), after: String(next.access_sales_id) });
      if ((old.cus_jo_no ?? "") !== next.cus_jo_no) changes.push({ label: "CusJONo", before: old.cus_jo_no ?? "", after: next.cus_jo_no });
      if (old.dye_process_id !== next.dye_process_id) changes.push({ label: "Dye process", before: String(old.dye_process_id ?? ""), after: String(next.dye_process_id) });
      if (old.fabric_id !== next.fabric_id) changes.push({ label: "Fabric", before: String(old.fabric_id ?? ""), after: String(next.fabric_id) });
      if (old.tone_id !== next.tone_id) changes.push({ label: "Tone", before: String(old.tone_id ?? ""), after: String(next.tone_id) });
      if ((old.color ?? "") !== next.color) changes.push({ label: "Color", before: old.color ?? "", after: next.color });
      replaceRows.push({ id: old.id, ...next });
      replaceOut.push({ linkId: jobId, jobTicket: ticket, customerName, changes });
    }

    for (let i = 0; i < newRows.length; i += 500) {
      const { error } = await supabaseAdmin.from("tbl_job_order").insert(newRows.slice(i, i + 500));
      if (error) return { error: `Could not add the new job orders: ${error.message}` };
    }
    for (let i = 0; i < replaceRows.length; i += 500) {
      const { error } = await supabaseAdmin.from("tbl_job_order").upsert(replaceRows.slice(i, i + 500), { onConflict: "id" });
      if (error) return { error: `Could not replace the existing job orders: ${error.message}` };
    }

    // ---- deliveries
    const appJobByTicket = new Map<string, number>();
    for (const j of await loadAll(supabaseAdmin, "tbl_job_order", "id, job_ticket")) appJobByTicket.set(j.job_ticket, j.id);
    const delivered = new Set<number>();
    for (const x of await loadAll(supabaseAdmin, "tbl_Deliveries", "id, job_order_id")) delivered.add(x.job_order_id);

    const dSkipped: PopulateResult["deliveries"]["skipped"] = [];
    for (const d of extras) {
      const j = jobs.get(d.job_order_id);
      dSkipped.push({ jobTicket: text(j?.job_ticket), reason: `DR ${d.delivery_receipt}: the app keeps one delivery per job order, so this one was not copied (it stays uncopied).` });
    }
    const dRows: Row[] = [];
    const dOut: DeliveryOut[] = [];
    let alreadyInApp = 0;
    const doneDeliveries: number[] = [];
    const aliasProblems = new Set<string>();

    for (const b of built) {
      const d = b.d;
      const appJobId = appJobByTicket.get(b.ticket);
      if (!appJobId) {
        dSkipped.push({ jobTicket: b.ticket, reason: "The job order could not be found in the app." });
        continue;
      }
      if (delivered.has(appJobId)) {
        alreadyInApp++;
        doneDeliveries.push(d.id);
        continue;
      }
      const receipt = Number(d.delivery_receipt);
      if (!Number.isInteger(receipt) || receipt <= 0) {
        dSkipped.push({ jobTicket: b.ticket, reason: `Delivery receipt "${d.delivery_receipt}" is not a valid number.` });
        continue;
      }
      if (d.receivable_type_id !== 1 && d.receivable_type_id !== 2) {
        dSkipped.push({ jobTicket: b.ticket, reason: `Receivable type ${d.receivable_type_id} is not Big (1) or Small (2).` });
        continue;
      }
      const t = delTotals.get(d.id);
      if (!t || t.body.n + t.x1.n + t.cc.n === 0) {
        dSkipped.push({ jobTicket: b.ticket, reason: "No delivered rolls found for this delivery." });
        continue;
      }
      // alias only for Big receipts; an id that is not in tbl_Alias is left empty and reported
      let aliasId: number | null = null;
      const wanted = toId(d.alias_id);
      if (d.receivable_type_id === 1 && wanted != null) {
        if (appAliasIds.has(wanted)) aliasId = wanted;
        else aliasProblems.add(b.ticket);
      }
      const row = {
        job_order_id: appJobId,
        delivery_receipt: receipt,
        receivable_type_id: d.receivable_type_id as number,
        date_delivery: d.date_delivery as string,
        delivered_body_wt: round2(t.body.w),
        count_body: t.body.n,
        delivered_1x1_wt: round2(t.x1.w),
        count_1x1: t.x1.n,
        delivered_cc_wt: round2(t.cc.w),
        count_cc: t.cc.n,
        alias_id: aliasId,
        invoice_id: 0,
      };
      dRows.push(row);
      dOut.push({
        jobTicket: b.ticket,
        customerName: b.customerName,
        deliveryReceipt: row.delivery_receipt,
        receivableTypeId: row.receivable_type_id,
        dateDelivery: row.date_delivery,
        totalWeight: round2(row.delivered_body_wt + row.delivered_1x1_wt + row.delivered_cc_wt),
        totalRolls: row.count_body + row.count_1x1 + row.count_cc,
      });
      doneDeliveries.push(d.id);
    }
    if (aliasProblems.size > 0) {
      warnings.push(`The alias id is not in tbl_Alias, so the delivery's alias was left empty (job ticket${aliasProblems.size === 1 ? "" : "s"} ${shownList(Array.from(aliasProblems))}).`);
    }
    for (let i = 0; i < dRows.length; i += 500) {
      const { error } = await supabaseAdmin.from("tbl_Deliveries").insert(dRows.slice(i, i + 500));
      if (error) return { error: `The job orders were copied, but the deliveries could not be added: ${error.message}` };
    }

    // ---- tell vitson-recipe which deliveries are copied
    let markError: string | null = null;
    for (let i = 0; i < doneDeliveries.length && !markError; i += CHUNK) {
      const { error } = await rc.from("tbl_Delivery").update({ copied: true } as never).in("id", doneDeliveries.slice(i, i + CHUNK));
      if (error) markError = error.message;
    }

    revalidatePath("/job-orders");
    revalidatePath("/deliveries");
    return {
      result: {
        path: "vitson-recipe (Supabase)",
        label: range.label,
        tickets: chosen.size,
        alreadyCopied,
        newRecords: newOut,
        changedRecords: replaceOut,
        skipped,
        marked: markError ? 0 : doneDeliveries.length,
        markError,
        cusJoBackfilled: 0,
        deliveries: { added: dOut, alreadyInApp, skipped: dSkipped, warnings },
      },
    };
  } catch (e: any) {
    return { error: `Populate from Supabase failed: ${e?.message ?? "unknown error"}` };
  }
}
