import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/auth";
import { MASTERS, type MasterField } from "@/lib/admin-masters";
import { MasterManager, type ClientField, type ClientOption } from "@/components/master-manager";

const PAGE = 1000;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function loadAll(table: string, columns: string, orderBy: string, filter?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    let q: any = supabaseAdmin.from(table).select(columns);
    if (filter) q = filter(q);
    const { data, error } = await q.order(orderBy).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function loadOptions(f: MasterField): Promise<ClientOption[]> {
  const o = f.options!;
  const cols = [o.valueCol, o.labelCol, o.suffixCol].filter((c, i, a): c is string => !!c && a.indexOf(c) === i).join(",");
  const rows = await loadAll(o.table, cols, o.labelCol, o.notEmpty ? (q) => q.not(o.valueCol, "is", null).neq(o.valueCol, "") : undefined);
  return rows.map((r) => ({
    value: String(r[o.valueCol]),
    label: o.suffixCol && o.suffixCol !== o.labelCol ? `${r[o.labelCol]} (${r[o.suffixCol]})` : String(r[o.labelCol]),
  }));
}

/** One Administration master-data page: add / edit form on top, double-click listbox below. */
export async function MasterPage({ slug }: { slug: string }) {
  await requireSuperAdmin();
  const cfg = MASTERS[slug];
  if (!cfg) notFound();

  let rows: any[] = [];
  let loadError: string | null = null;
  const options: Record<string, ClientOption[]> = {};
  try {
    const columns = ["id", ...cfg.fields.map((f) => f.name)].join(",");
    rows = await loadAll(cfg.table, columns, cfg.fields[0].name);
    for (const f of cfg.fields) {
      if (f.options) options[f.name] = await loadOptions(f);
    }
  } catch (e: any) {
    loadError = e?.message ?? "unknown error";
  }
  if (loadError) return <p className="text-sm text-danger">Could not load {cfg.title.toLowerCase()}: {loadError}</p>;

  const fields: ClientField[] = cfg.fields.map((f) => ({
    name: f.name, label: f.label, type: f.type, required: f.required, placeholder: f.placeholder, hint: f.hint, defaultValue: f.defaultValue,
  }));

  return <MasterManager slug={cfg.slug} title={cfg.title} singular={cfg.singular} fields={fields} options={options} rows={rows} multiColumn={cfg.multiColumn} />;
}
