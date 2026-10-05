"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";

/* ---------- types ---------- */

export type PurchaseRow = {
  sorting_name: string;
  bound_name: string;
  item_id: number;
  item_name: string;
  qty: number;
  amount: number;
};

export type RecipeUsageRow = {
  month_start: string;
  sorting_name: string;
  bound_name: string;
  item_id: number;
  item_name: string;
  qty: number;
  amount: number;
};

export type AnalysisRow = {
  sorting_name: string;
  bound_name: string;
  item_id: number;
  item_name: string;
  actual: number;
  daily: number;
  recipe: number;
};

export type MonthlyRow = {
  sorting_name: string;
  bound_name: string;
  item_id: number;
  item_name: string;
  price: number | null;
  balance_forward: number;
  actual: number;
  purchases: number;
  balance: number;
};

export type ItemFilterData = {
  sortings: { id: number; label: string }[];
  bounds: { id: number; label: string; sortingId: number }[];
  items: { id: number; label: string; boundId: number }[];
};

/* ---------- reads ---------- */

export async function getPurchases(year: number, month: number): Promise<PurchaseRow[]> {
  await requireModule("inventory");
  const { data, error } = await supabaseAdmin.rpc("inventory_purchases", { p_year: year, p_month: month });
  if (error) throw new Error(`Could not load purchases: ${error.message}`);
  return (data ?? []) as PurchaseRow[];
}

export async function getRecipeUsage(): Promise<RecipeUsageRow[]> {
  await requireModule("inventory");
  const { data, error } = await supabaseAdmin.rpc("inventory_recipe_usage");
  if (error) throw new Error(`Could not load recipe usage: ${error.message}`);
  return (data ?? []) as RecipeUsageRow[];
}

export async function getAnalysis(year: number, month: number): Promise<AnalysisRow[]> {
  await requireModule("inventory");
  const { data, error } = await supabaseAdmin.rpc("inventory_analysis", { p_year: year, p_month: month });
  if (error) throw new Error(`Could not load analysis: ${error.message}`);
  return (data ?? []) as AnalysisRow[];
}

export async function getMonthlyInventory(year: number, month: number): Promise<MonthlyRow[]> {
  await requireModule("inventory");
  const { data, error } = await supabaseAdmin.rpc("inventory_monthly", { p_year: year, p_month: month });
  if (error) throw new Error(`Could not load monthly inventory: ${error.message}`);
  return (data ?? []) as MonthlyRow[];
}

/** Sorting > bound > item lists for the filter side of the entry screens. */
export async function getItemFilterData(): Promise<ItemFilterData> {
  await requireModule("inventory");

  const [{ data: sortings }, { data: bounds }, { data: items }] = await Promise.all([
    supabaseAdmin.from("tbl_Item_Sorting").select("id, sorting_name").order("sorting_name"),
    supabaseAdmin.from("tbl_Item_Bound").select("id, bound_name, sorting_id").order("bound_name"),
    supabaseAdmin.from("tbl_Item").select("id, item_name, bound_id").order("item_name"),
  ]);

  return {
    sortings: ((sortings ?? []) as any[]).map((s) => ({ id: s.id, label: s.sorting_name })),
    bounds: ((bounds ?? []) as any[])
      .filter((b) => b.sorting_id != null)
      .map((b) => ({ id: b.id, label: b.bound_name, sortingId: b.sorting_id })),
    items: ((items ?? []) as any[])
      .filter((i) => i.bound_id != null)
      .map((i) => ({ id: i.id, label: i.item_name, boundId: i.bound_id })),
  };
}

/* ---------- writes ---------- */

export async function addWithdrawal(input: {
  kind: "daily" | "actual";
  itemId: number;
  dtEntry: string; // yyyy-mm-dd
  qty: number;
}): Promise<{ error?: string }> {
  await requireModule("inventory");

  if (!input.itemId) return { error: "Select an item." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dtEntry)) return { error: "Date is required." };
  if (!Number.isFinite(input.qty) || input.qty <= 0) return { error: "Quantity must be greater than zero." };

  const { error } = await supabaseAdmin.rpc("inventory_add_withdrawal", {
    p_kind: input.kind,
    p_item_id: input.itemId,
    p_dt_entry: input.dtEntry,
    p_qty: input.qty,
  });
  if (error) return { error: `Could not save: ${error.message}` };

  revalidatePath("/inventory", "layout");
  return {};
}

export async function populateRecipe(
  date: string // yyyy-mm-dd, the user's local date
): Promise<{ error?: string; items?: number; rows?: number }> {
  await requireModule("inventory");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Invalid date." };

  const { data, error } = await supabaseAdmin.rpc("recipe_populate", { p_date: date });
  if (error) return { error: `Could not populate: ${error.message}` };

  revalidatePath("/inventory", "layout");
  const row = (data as { items_populated: number; rows_processed: number }[] | null)?.[0];
  return { items: row?.items_populated ?? 0, rows: row?.rows_processed ?? 0 };
}
