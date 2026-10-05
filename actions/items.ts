"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";

export type ItemFormState = { error?: string; id?: number; name?: string };

export async function createItem(
  _prev: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  // Reachable both from Admin (super admins) and the Requisition quick-add flow.
  await requireModule("requisition");

  const itemName = String(formData.get("itemName") ?? "").trim();
  const priceRaw = String(formData.get("price") ?? "").trim();
  const boundId = String(formData.get("boundId") ?? "").trim() || null;
  const shadeId = String(formData.get("shadeId") ?? "").trim() || null;

  if (!itemName) {
    return { error: "Item name is required." };
  }

  let price: number | null = null;
  if (priceRaw) {
    price = Number(priceRaw);
    if (Number.isNaN(price)) {
      return { error: "Price must be a number." };
    }
  }

  const { data: created, error } = await supabaseAdmin
    .from("tbl_Item")
    .insert({
      item_name: itemName,
      Price: price,
      bound_id: boundId ? Number(boundId) : null,
      Shade_id: shadeId ? Number(shadeId) : null,
    })
    .select("id, item_name")
    .single();

  if (error || !created) {
    return { error: `Could not save item: ${error?.message ?? "unknown error"}` };
  }

  revalidatePath("/admin/items");
  return { id: created.id, name: created.item_name };
}
