"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { parseYm } from "@/lib/report-format";
import { AccessError, field, fieldAny, getRowsAsync, isoDate, num, openAccessFile, text } from "@/lib/access-reader";

/** The local MS Access database with the recipe lines. Set ACCESS_RECIPE_PATH in .env.local to use another location. */
const RECIPE_PATH = "C:\\Users\\User\\Documents\\link_recipe";
/** The job orders database (also used by the Job Orders populate): its tblJobOrders table holds DateRecipe. */
const JOBS_PATH = "C:\\Users\\User\\Documents\\link_job_orders";

export type RecipePopulateResult = {
  path: string;
  label: string;
  /** job tickets of the period found in tblJobOrders */
  tickets: number;
  /** earlier recipe rows of the period that were removed before copying again */
  deleted: number;
  /** rows added to tbl_Item_Inventory (one per item and recipe date) */
  inserted: number;
  /** items from Access that are not in the app's items, so they were not copied */
  skippedItems: { itemId: number; quantity: number }[];
};

export type RecipeListItem = { itemId: number; itemName: string; qty: number };
export type RecipeListBound = { boundId: number; boundName: string; items: RecipeListItem[]; total: number };
export type RecipeListSorting = { sortingId: number; sortingName: string; bounds: RecipeListBound[]; total: number };

const PAGE = 1000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

async function loadPaged(table: string, columns: string, apply?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q: any = supabaseAdmin.from(table).select(columns).order("id").range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Inventory rows of the period that carry a recipe quantity. */
const recipeRowsOfPeriod = (start: string, end: string, columns: string) =>
  loadPaged("tbl_Item_Inventory", columns, (q) => q.gte("dt_entry", start).lt("dt_entry", end).neq("recipe_withdrawn_qty", 0));

/**
 * Copies the recipes of one month from the Access database link_recipe into tbl_Item_Inventory.
 * Every tblJobOrders record with DateRecipe in the month brings its tblDyeRecipe and tblFinRecipe lines (linked by
 * jobticketno), grouped by numItemID and DateRecipe:
 * item_id = numItemID, recipe_withdrawn_qty = sum(quantity), price = average Price, dt_entry = DateRecipe.
 *
 * When the month already has recipe rows (dt_entry in the month and recipe_withdrawn_qty not 0), nothing happens until
 * the caller confirms (replace = true): those rows are then removed and the month is copied again.
 */
export async function populateRecipes(
  ym: string,
  replace: boolean
): Promise<{ error?: string; needsConfirm?: boolean; existing?: number; label?: string; result?: RecipePopulateResult }> {
  await requireModule("inventory");
  const range = parseYm(ym);
  if (!range) return { error: "Select a month and year to populate." };

  try {
    const old = await recipeRowsOfPeriod(range.start, range.end, "id, purchased_qty, actual_withdrawn_qty, daily_withdrawn_qty");
    if (old.length > 0 && !replace) return { needsConfirm: true, existing: old.length, label: range.label };

    // ---- read Access first, so nothing is removed when a file cannot be read
    // job tickets and their DateRecipe: tblJobOrders of the job orders database
    const jobsDb = await openAccessFile(process.env.ACCESS_JOB_ORDERS_PATH || JOBS_PATH);
    const jobRows = await getRowsAsync(jobsDb, ["tblJobOrders", "tblJobOrder"]);
    if (jobRows.length > 0 && !Object.keys(jobRows[0]).some((k) => k.toLowerCase() === "daterecipe")) {
      throw new AccessError(
        `The table tblJobOrders in ${jobsDb.path} has no DateRecipe field. Fields found: ${Object.keys(jobRows[0]).join(", ")}.`
      );
    }
    const ticketDate = new Map<string, string>(); // jobticketno -> DateRecipe, for the period only
    for (const r of jobRows) {
      const ticket = text(field(r, "jobticketno"));
      const date = isoDate(field(r, "DateRecipe"));
      if (!ticket || !date || date < range.start || date >= range.end) continue;
      if (!ticketDate.has(ticket)) ticketDate.set(ticket, date);
    }

    // the recipe lines (dye and finishing): the recipe database
    const recipeDb = await openAccessFile(process.env.ACCESS_RECIPE_PATH || RECIPE_PATH);
    const path = `${jobsDb.path} and ${recipeDb.path}`;

    const sums = new Map<string, { itemId: number; date: string; qty: number; priceSum: number; priceCount: number }>();
    for (const names of [["tblDyeRecipe"], ["tblFinRecipe"]]) {
      for (const r of await getRowsAsync(recipeDb, names)) {
        const date = ticketDate.get(text(field(r, "jobticketno")));
        if (!date) continue;
        const itemId = num(fieldAny(r, ["numItemID", "numitemid"]));
        if (!itemId) continue;
        const key = `${itemId}|${date}`;
        const cur = sums.get(key) ?? { itemId, date, qty: 0, priceSum: 0, priceCount: 0 };
        cur.qty += num(field(r, "quantity"));
        const price = field(r, "Price");
        if (price != null && price !== "") {
          cur.priceSum += num(price);
          cur.priceCount += 1;
        }
        sums.set(key, cur);
      }
    }

    // items must exist in the app
    const itemIds = new Set<number>((await loadPaged("tbl_Item", "id")).map((i) => i.id as number));
    const rows: any[] = [];
    const skippedByItem = new Map<number, number>();
    for (const s of Array.from(sums.values()).sort((a, b) => a.date.localeCompare(b.date) || a.itemId - b.itemId)) {
      if (s.qty === 0) continue;
      if (!itemIds.has(s.itemId)) {
        skippedByItem.set(s.itemId, (skippedByItem.get(s.itemId) ?? 0) + s.qty);
        continue;
      }
      rows.push({
        item_id: s.itemId,
        purchased_qty: 0,
        actual_withdrawn_qty: 0,
        daily_withdrawn_qty: 0,
        recipe_withdrawn_qty: round6(s.qty),
        price: s.priceCount > 0 ? round6(s.priceSum / s.priceCount) : 0,
        dt_entry: s.date,
      });
    }

    // ---- add the new rows first, then clear the old ones: a failure never leaves the period empty
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabaseAdmin.from("tbl_Item_Inventory").insert(rows.slice(i, i + 500));
      if (error) return { error: `Could not add the recipes: ${error.message}` };
    }
    // a row that only carries a recipe quantity is deleted; one that also carries purchases or usage keeps those
    const isPure = (r: any) => !(r.purchased_qty ?? 0) && !(r.actual_withdrawn_qty ?? 0) && !(r.daily_withdrawn_qty ?? 0);
    const deleteIds = old.filter(isPure).map((r) => r.id as number);
    const zeroIds = old.filter((r) => !isPure(r)).map((r) => r.id as number);
    for (let i = 0; i < deleteIds.length; i += 200) {
      const { error } = await supabaseAdmin.from("tbl_Item_Inventory").delete().in("id", deleteIds.slice(i, i + 200));
      if (error) return { error: `The new recipes were added, but the previous ones could not be deleted: ${error.message}` };
    }
    for (let i = 0; i < zeroIds.length; i += 200) {
      const { error } = await supabaseAdmin.from("tbl_Item_Inventory").update({ recipe_withdrawn_qty: 0 }).in("id", zeroIds.slice(i, i + 200));
      if (error) return { error: `The new recipes were added, but the previous ones could not be cleared: ${error.message}` };
    }

    revalidatePath("/inventory");
    return {
      result: {
        path,
        label: range.label,
        tickets: ticketDate.size,
        deleted: old.length,
        inserted: rows.length,
        skippedItems: Array.from(skippedByItem.entries()).map(([itemId, quantity]) => ({ itemId, quantity: round6(quantity) })),
      },
    };
  } catch (e: any) {
    if (e instanceof AccessError) return { error: e.message };
    return { error: `Populate failed: ${e?.message ?? "unknown error"}` };
  }
}

/** The recipe quantities of the period, grouped by sorting, then bound, then item (summed over the period). */
export async function getRecipeList(ym: string): Promise<{ error?: string; groups?: RecipeListSorting[] }> {
  await requireModule("inventory");
  const range = parseYm(ym);
  if (!range) return { error: "Select a month and year." };
  try {
    const rows = await recipeRowsOfPeriod(range.start, range.end, "id, item_id, recipe_withdrawn_qty");
    const qtyByItem = new Map<number, number>();
    for (const r of rows) qtyByItem.set(r.item_id, (qtyByItem.get(r.item_id) ?? 0) + (r.recipe_withdrawn_qty ?? 0));

    const [items, bounds, sortings] = await Promise.all([
      loadPaged("tbl_Item", "id, item_name, bound_id"),
      loadPaged("tbl_Item_Bound", "id, bound_name, sorting_id"),
      loadPaged("tbl_Item_Sorting", "id, sorting_name"),
    ]);
    const itemById = new Map<number, any>(items.map((i) => [i.id, i]));
    const boundById = new Map<number, any>(bounds.map((b) => [b.id, b]));
    const sortingById = new Map<number, string>(sortings.map((s) => [s.id, s.sorting_name]));

    const tree = new Map<number, Map<number, RecipeListItem[]>>(); // sorting id -> bound id -> items
    for (const [itemId, qty] of qtyByItem) {
      const item = itemById.get(itemId);
      const bound = boundById.get(item?.bound_id);
      const sortingId: number = bound?.sorting_id ?? 0;
      const boundId: number = bound?.id ?? 0;
      const byBound = tree.get(sortingId) ?? new Map<number, RecipeListItem[]>();
      byBound.set(boundId, [...(byBound.get(boundId) ?? []), { itemId, itemName: item?.item_name ?? `Item ${itemId}`, qty: round6(qty) }]);
      tree.set(sortingId, byBound);
    }

    const groups: RecipeListSorting[] = Array.from(tree.entries())
      .map(([sortingId, byBound]) => {
        const boundList: RecipeListBound[] = Array.from(byBound.entries())
          .map(([boundId, list]) => ({
            boundId,
            boundName: boundById.get(boundId)?.bound_name ?? "(no bound)",
            items: list.sort((a, b) => a.itemName.localeCompare(b.itemName)),
            total: round6(list.reduce((s, i) => s + i.qty, 0)),
          }))
          .sort((a, b) => a.boundName.localeCompare(b.boundName));
        return {
          sortingId,
          sortingName: sortingById.get(sortingId) ?? "(no sorting)",
          bounds: boundList,
          total: round6(boundList.reduce((s, b) => s + b.total, 0)),
        };
      })
      .sort((a, b) => a.sortingName.localeCompare(b.sortingName));
    return { groups };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the recipe list." };
  }
}
