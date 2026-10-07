"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { parseYm, round2 } from "@/lib/report-format";

// The module key must also be added to lib/modules.ts (ModuleKey + MODULES) so it can be granted in Admin > Users.
const AR_MODULE = "accounts_receivable" as Parameters<typeof requireModule>[0];

export type ArLookups = {
  customers: { id: number; name: string }[];
  types: { id: number; name: string }[];
};

export type ArReportRow = {
  id: number;
  customerId: number;
  customerName: string;
  receivableId: number | null;
  salesAmount: number;
  /** every collection deduction except EWT */
  totalDeductions: number;
  ewt: number;
  /** check amounts collected for this customer and month (bounced checks left out) */
  totalCollected: number;
};

export type ArGroup = {
  receivableId: number | null;
  typeName: string;
  rows: ArReportRow[];
  totalSales: number;
  totalDeductions: number;
  totalEwt: number;
  totalCollected: number;
};

export type ArReport = {
  ym: string;
  label: string;
  groups: ArGroup[];
  grand: { totalSales: number; totalDeductions: number; totalEwt: number; totalCollected: number };
};

const CHUNK = 100;
const uniq = (xs: any[]) => Array.from(new Set(xs.filter((x) => x != null)));
const isEwt = (name: string) => /\bewt\b/i.test(name);

export async function getArLookups(): Promise<ArLookups> {
  await requireModule(AR_MODULE);
  const [c, t] = await Promise.all([
    supabaseAdmin.from("tbl_Customer").select("id, customer_name").order("customer_name"),
    supabaseAdmin.from("tbl_receivable_type").select("id, receivable_type").order("id"),
  ]);
  return {
    customers: (c.data ?? []).map((x: any) => ({ id: x.id, name: x.customer_name })),
    types: (t.data ?? []).map((x: any) => ({ id: x.id, name: x.receivable_type })),
  };
}

/** Sales entries of the month with what was collected for the same customer and month. */
export async function getArReport(ym: string): Promise<{ error?: string; data?: ArReport }> {
  await requireModule(AR_MODULE);
  const range = parseYm(ym);
  if (!range) return { error: "Choose a month and year." };

  try {
    const { data: ar, error } = await supabaseAdmin
      .from("tbl_Account_Receivables")
      .select("id, for_month_of, sales_amount, customer_id, receivable_id")
      .eq("for_month_of", range.ym)
      .limit(5000);
    if (error) return { error: error.message };
    const entries = ar ?? [];
    const custIds = uniq(entries.map((e: any) => e.customer_id)) as number[];

    const [custs, types, dedTypes] = await Promise.all([
      supabaseAdmin.from("tbl_Customer").select("id, customer_name").in("id", custIds),
      supabaseAdmin.from("tbl_receivable_type").select("id, receivable_type").order("id"),
      supabaseAdmin.from("tbl_Collection_Deductions_type").select("id, collection_deductions_name"),
    ]);
    const cname = new Map<number, string>((custs.data ?? []).map((c: any) => [c.id, c.customer_name]));
    const typeRows = (types.data ?? []) as { id: number; receivable_type: string }[];
    const ewtTypeIds = new Set<number>(
      (dedTypes.data ?? []).filter((d: any) => isEwt(String(d.collection_deductions_name))).map((d: any) => d.id),
    );

    // collections for those customers in that month, not bounced
    const { data: cols, error: colErr } = custIds.length
      ? await supabaseAdmin
          .from("tbl_Collections")
          .select("id, customer_id, check_amount, bool_bounce")
          .eq("for_month_of", range.ym)
          .in("customer_id", custIds)
          .limit(5000)
      : { data: [], error: null };
    if (colErr) return { error: colErr.message };
    const collections = (cols ?? []).filter((c: any) => !c.bool_bounce);
    const colCustomer = new Map<number, number>(collections.map((c: any) => [c.id, c.customer_id]));

    const collectedBy = new Map<number, number>();
    for (const c of collections) collectedBy.set(c.customer_id, (collectedBy.get(c.customer_id) ?? 0) + (c.check_amount ?? 0));

    const dedBy = new Map<number, number>();
    const ewtBy = new Map<number, number>();
    const colIds = collections.map((c: any) => c.id as number);
    for (let i = 0; i < colIds.length; i += CHUNK) {
      const { data: ds, error: dErr } = await supabaseAdmin
        .from("tbl_Collection_Deductions")
        .select("collection_id, collection_deduction_id, deducted_amount")
        .in("collection_id", colIds.slice(i, i + CHUNK));
      if (dErr) return { error: dErr.message };
      for (const d of ds ?? []) {
        const cust = colCustomer.get(d.collection_id);
        if (cust == null) continue;
        const target = ewtTypeIds.has(d.collection_deduction_id) ? ewtBy : dedBy;
        target.set(cust, (target.get(cust) ?? 0) + (d.deducted_amount ?? 0));
      }
    }

    // One entry per customer and month is enforced when saving, so a customer's collections are never counted twice.
    const rows: ArReportRow[] = entries
      .map((e: any) => ({
        id: e.id,
        customerId: e.customer_id,
        customerName: cname.get(e.customer_id) ?? "",
        receivableId: e.receivable_id ?? null,
        salesAmount: round2(e.sales_amount ?? 0),
        totalDeductions: round2(dedBy.get(e.customer_id) ?? 0),
        ewt: round2(ewtBy.get(e.customer_id) ?? 0),
        totalCollected: round2(collectedBy.get(e.customer_id) ?? 0),
      }))
      .sort((a: ArReportRow, b: ArReportRow) => a.customerName.localeCompare(b.customerName));

    const sum = (rs: ArReportRow[], f: (r: ArReportRow) => number) => round2(rs.reduce((s, r) => s + f(r), 0));
    const mk = (receivableId: number | null, typeName: string, rs: ArReportRow[]): ArGroup => ({
      receivableId,
      typeName,
      rows: rs,
      totalSales: sum(rs, (r) => r.salesAmount),
      totalDeductions: sum(rs, (r) => r.totalDeductions),
      totalEwt: sum(rs, (r) => r.ewt),
      totalCollected: sum(rs, (r) => r.totalCollected),
    });

    const groups: ArGroup[] = typeRows.map((t) => mk(t.id, t.receivable_type, rows.filter((r) => r.receivableId === t.id)));
    const loose = rows.filter((r) => r.receivableId == null || !typeRows.some((t) => t.id === r.receivableId));
    if (loose.length) groups.push(mk(null, "Unassigned", loose));

    return {
      data: {
        ym: range.ym,
        label: range.label,
        groups,
        grand: {
          totalSales: sum(rows, (r) => r.salesAmount),
          totalDeductions: sum(rows, (r) => r.totalDeductions),
          totalEwt: sum(rows, (r) => r.ewt),
          totalCollected: sum(rows, (r) => r.totalCollected),
        },
      },
    };
  } catch (e: any) {
    return { error: e?.message ?? "Could not load the report." };
  }
}

export async function saveReceivable(input: {
  id: number | null;
  year: number;
  month: number;
  customerId: number | null;
  salesAmount: number;
  receivableId: number | null;
}): Promise<{ error?: string; ym?: string }> {
  await requireModule(AR_MODULE);
  const { id, year, month, customerId, salesAmount, receivableId } = input;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { error: "Enter a valid year." };
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Choose a month." };
  if (!customerId) return { error: "Select a customer." };
  if (!receivableId) return { error: "Select the receivable type (Big or Small)." };
  if (!(salesAmount > 0)) return { error: "Enter a sales amount greater than zero." };
  const forMonthOf = `${year}-${String(month).padStart(2, "0")}`;

  // one sales entry per customer and month
  let dupQ = supabaseAdmin
    .from("tbl_Account_Receivables")
    .select("id")
    .eq("customer_id", customerId)
    .eq("for_month_of", forMonthOf)
    .limit(1);
  if (id) dupQ = dupQ.neq("id", id);
  const { data: dup, error: dupErr } = await dupQ;
  if (dupErr) return { error: dupErr.message };
  if (dup && dup.length > 0) {
    return { error: "This customer already has a sales entry for that month. Click it in the list to change it." };
  }

  const row = { for_month_of: forMonthOf, sales_amount: round2(salesAmount), customer_id: customerId, receivable_id: receivableId };
  const { error } = id
    ? await supabaseAdmin.from("tbl_Account_Receivables").update(row).eq("id", id)
    : await supabaseAdmin.from("tbl_Account_Receivables").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/accounts-receivable");
  return { ym: forMonthOf };
}

export async function deleteReceivable(id: number): Promise<{ error?: string }> {
  await requireModule(AR_MODULE);
  const { error } = await supabaseAdmin.from("tbl_Account_Receivables").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/accounts-receivable");
  return {};
}
