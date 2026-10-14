"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { customerNoToNumber, formatCustomerNos, parseCustomerNos } from "@/lib/alias-customers";

const ALIAS_MODULE = "aliases" as const;

export type AliasRow = {
  id: number;
  aliasName: string;
  /** kept as text so it is shown exactly as typed */
  tinNumber: string;
  address: string;
  /** the customer numbers (tbl_Customer.customer_no) parsed from tbl_Alias.associated_customer */
  customerNos: number[];
};

/** `no` is the customer number (customer_no without leading zeros): that is what associated_customer stores. */
export type AliasLookups = { customers: { no: number; name: string }[] };

export async function getAliasLookups(): Promise<AliasLookups> {
  await requireModule(ALIAS_MODULE);
  const { data } = await supabaseAdmin.from("tbl_Customer").select("customer_name, customer_no").order("customer_name").limit(5000);
  const customers: AliasLookups["customers"] = [];
  for (const c of data ?? []) {
    const no = customerNoToNumber((c as any).customer_no);
    if (no != null) customers.push({ no, name: (c as any).customer_name });
  }
  return { customers };
}

/** Every alias (a row with id 0, if one still exists, is hidden). */
export async function listAliases(): Promise<{ error?: string; aliases: AliasRow[] }> {
  await requireModule(ALIAS_MODULE);
  const { data, error } = await supabaseAdmin
    .from("tbl_Alias")
    .select("id, alias_name, TIN_number, associated_customer, alias_address")
    .neq("id", 0)
    .order("alias_name")
    .limit(5000);
  if (error) return { error: error.message, aliases: [] };
  return {
    aliases: (data ?? []).map((a: any) => ({
      id: a.id,
      aliasName: a.alias_name ?? "",
      tinNumber: a.TIN_number == null ? "" : String(a.TIN_number),
      address: a.alias_address ?? "",
      customerNos: parseCustomerNos(a.associated_customer),
    })),
  };
}

/** Adds an alias (id null) or updates one. The selected customer numbers are stored in associated_customer, comma separated. */
export async function saveAlias(input: {
  id: number | null;
  aliasName: string;
  tinNumber: string;
  address: string;
  customerNos: number[];
}): Promise<{ error?: string; id?: number }> {
  await requireModule(ALIAS_MODULE);

  const name = String(input.aliasName ?? "").trim();
  if (!name) return { error: "Enter the alias name." };
  if (name.length > 200) return { error: "The alias name is too long (200 characters at most)." };

  const tin = String(input.tinNumber ?? "").trim();
  if (!/^\d{1,15}$/.test(tin)) return { error: "Enter the TIN number using digits only (up to 15 digits)." };

  const address = String(input.address ?? "").trim();
  if (!address) return { error: "Enter the alias address." };
  if (address.length > 500) return { error: "The address is too long (500 characters at most)." };

  const nos = Array.from(new Set((input.customerNos ?? []).filter((n) => Number.isSafeInteger(n) && n > 0)));
  if (nos.length === 0) return { error: "Select at least one customer for this alias." };

  try {
    // every selected customer number must still belong to a customer
    const { data: custs, error: cErr } = await supabaseAdmin.from("tbl_Customer").select("customer_no").limit(5000);
    if (cErr) return { error: cErr.message };
    const known = new Set<number>((custs ?? []).map((c: any) => customerNoToNumber(c.customer_no)).filter((n: number | null): n is number => n != null));
    if (nos.some((n) => !known.has(n))) {
      return { error: "One of the selected customers no longer exists. Reload the page and try again." };
    }

    // an alias name is used once (the customers it covers go in associated_customer)
    const { data: all, error: aErr } = await supabaseAdmin.from("tbl_Alias").select("id, alias_name").limit(5000);
    if (aErr) return { error: aErr.message };
    const clash = (all ?? []).find((a: any) => a.id !== input.id && String(a.alias_name).trim().toLowerCase() === name.toLowerCase());
    if (clash) return { error: `An alias named "${clash.alias_name}" already exists. Select it from the list to change its customers.` };

    const row = { alias_name: name, TIN_number: Number(tin), associated_customer: formatCustomerNos(nos), alias_address: address };

    if (input.id == null) {
      const { data, error } = await supabaseAdmin.from("tbl_Alias").insert(row).select("id").single();
      if (error) return { error: error.message };
      revalidatePath("/aliases");
      return { id: data.id as number };
    }
    if (input.id === 0) return { error: "This alias cannot be changed." };

    const { data: exists } = await supabaseAdmin.from("tbl_Alias").select("id").eq("id", input.id).maybeSingle();
    if (!exists) return { error: "This alias no longer exists. Reload the page." };
    const { error } = await supabaseAdmin.from("tbl_Alias").update(row).eq("id", input.id);
    if (error) return { error: error.message };
    revalidatePath("/aliases");
    return { id: input.id };
  } catch (e: any) {
    return { error: e?.message ?? "Could not save the alias." };
  }
}
