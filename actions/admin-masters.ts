"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth";
import { MASTERS, type MasterField } from "@/lib/admin-masters";

export type SaveMasterResult = { error?: string; id?: number };

function parseField(f: MasterField, raw: string): { value?: unknown; error?: string } {
  const v = raw.trim();
  if (f.type === "bool") return { value: v === "true" };
  if (!v) {
    if (f.required) return { error: `${f.label} is required.` };
    return { value: null };
  }
  switch (f.type) {
    case "text":
      return { value: v };
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { value: v } : { error: `${f.label} does not look like a valid email address.` };
    case "int": {
      if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v))) return { error: `${f.label} must be numbers only (no dashes or spaces).` };
      return { value: Number(v) };
    }
    case "numeric": {
      const n = Number(v);
      if (!Number.isFinite(n)) return { error: `${f.label} must be a number.` };
      if (f.min != null && n < f.min) return { error: `${f.label} must be at least ${f.min}.` };
      if (f.max != null && n > f.max) return { error: `${f.label} must be at most ${f.max}.` };
      return { value: n };
    }
    case "select": {
      if (!/^\d+$/.test(v)) return { error: `${f.label} is not a valid choice.` };
      return { value: Number(v) };
    }
    case "multi": {
      const parts = Array.from(new Set(v.split(",").map((p) => p.trim()).filter(Boolean)));
      return { value: parts.length ? parts.join(",") : null };
    }
  }
}

/** Adds (id = null) or updates (id given) one record of an Administration master table. Super admins only. */
export async function saveMaster(slug: string, id: number | null, values: Record<string, string>): Promise<SaveMasterResult> {
  await requireSuperAdmin();
  const cfg = MASTERS[slug];
  if (!cfg) return { error: "Unknown form." };
  if (id != null && (!Number.isInteger(id) || id <= 0)) return { error: "Invalid record." };

  const payload: Record<string, unknown> = {};
  for (const f of cfg.fields) {
    const r = parseField(f, String(values?.[f.name] ?? ""));
    if (r.error) return { error: r.error };
    payload[f.name] = r.value;
  }

  const q =
    id == null
      ? supabaseAdmin.from(cfg.table).insert(payload).select("id").single()
      : supabaseAdmin.from(cfg.table).update(payload).eq("id", id).select("id").single();
  const { data, error } = await q;
  if (error || !data) {
    if (error?.code === "23505") return { error: `This ${cfg.singular} cannot be saved because the same name or number already exists.` };
    if (error?.code === "23503") return { error: `A selected value no longer exists in its list. Reload the page and try again.` };
    if (error?.code === "PGRST116") return { error: "That record no longer exists. Reload the page." };
    return { error: `Could not save the ${cfg.singular}: ${error?.message ?? "unknown error"}` };
  }

  revalidatePath(`/admin/${slug}`);
  return { id: data.id as number };
}
