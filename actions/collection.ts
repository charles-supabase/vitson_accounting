"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireModule } from "@/lib/auth";
import { verifyAppPassword } from "@/lib/app-password";

/* ---------- types ---------- */

type Option = { id: number; label: string };

export type CollectionLookups = {
  customers: Option[];
  customerBanks: Option[];
  deductionTypes: Option[];
  banks: Option[];
};

export type CheckOption = { id: number; checkNo: string; customerName: string; amount: number };

export type CollectionListRow = {
  id: number;
  customerName: string;
  checkNo: string;
  checkDate: string;
  checkAmount: number;
  forMonthOf: string;
  dateDeposited: string | null;
};

export type CollectionDetail = {
  id: number;
  dateCollected: string;
  customerId: number;
  customerName: string;
  customerBankId: number;
  checkNo: string;
  checkDate: string;
  checkAmount: number;
  forMonthOf: string;
  remarks: string | null;
  dateDeposited: string | null;
  bankId: number | null;
  bankName: string | null;
  deductions: { typeId: number; amount: number; remarks: string }[];
};

export type SaveCollectionInput = {
  id: number | null;
  dateCollected: string;
  customerId: number;
  customerBankId: number;
  checkNo: string;
  checkDate: string;
  checkAmount: number;
  forMonthOf: string; // YYYY-MM
  remarks: string;
  deductions: { typeId: number; amount: number; remarks: string }[];
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const uniq = (xs: any[]) => Array.from(new Set(xs.filter((x) => x != null)));

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function toListRows(rows: any[]): Promise<CollectionListRow[]> {
  if (rows.length === 0) return [];
  const { data: customers } = await supabaseAdmin
    .from("tbl_Customer")
    .select("id, customer_name")
    .in("id", uniq(rows.map((r) => r.customer_id)));
  const name = new Map<number, string>(((customers ?? []) as any[]).map((c): [number, string] => [c.id, c.customer_name]));
  return rows.map((r) => ({
    id: r.id,
    customerName: name.get(r.customer_id) ?? `Customer #${r.customer_id}`,
    checkNo: String(r.check_no),
    checkDate: r.check_date,
    checkAmount: Number(r.check_amount),
    forMonthOf: r.for_month_of,
    dateDeposited: r.date_deposited ?? null,
  }));
}

const LIST_COLS = "id, customer_id, check_no, check_date, check_amount, for_month_of, date_deposited";

/* ---------- reads ---------- */

export async function getCollectionLookups(): Promise<CollectionLookups> {
  await requireModule("collection");

  const customers = await fetchAllRows<any>((from, to) =>
    supabaseAdmin.from("tbl_Customer").select("id, customer_name").order("customer_name").range(from, to)
  );
  const [{ data: customerBanks }, { data: types }, { data: banks }] = await Promise.all([
    supabaseAdmin.from("tbl_Customer_Banks").select("id, customer_bank_name").order("customer_bank_name"),
    supabaseAdmin.from("tbl_Collection_Deductions_type").select("id, collection_deductions_name").order("collection_deductions_name"),
    supabaseAdmin.from("tbl_Bank").select("id, bank_name, active").order("bank_name"),
  ]);

  return {
    customers: customers.map((c) => ({ id: c.id, label: c.customer_name })),
    customerBanks: ((customerBanks ?? []) as any[]).map((b) => ({ id: b.id, label: b.customer_bank_name })),
    deductionTypes: ((types ?? []) as any[]).map((t) => ({ id: t.id, label: t.collection_deductions_name })),
    banks: ((banks ?? []) as any[]).filter((b) => b.active !== false).map((b) => ({ id: b.id, label: b.bank_name })),
  };
}

/** Checks not yet deposited whose check date is today, past, or within the next 3 days. */
export async function getAlmostDue(today: string): Promise<CollectionListRow[]> {
  await requireModule("collection");
  if (!ISO.test(today)) throw new Error("Invalid date.");

  const { data, error } = await supabaseAdmin
    .from("tbl_Collections")
    .select(LIST_COLS)
    .is("date_deposited", null)
    .lte("check_date", addDays(today, 3))
    .order("check_date", { ascending: true })
    .order("id", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  return toListRows((data ?? []) as any[]);
}

/** Search every collection (deposited or not) by check number, check amount and/or customer name. */
export async function searchCollections(filters: {
  checkNo: string;
  amount: string;
  customerId: number | null;
}): Promise<CollectionListRow[]> {
  await requireModule("collection");

  let q = supabaseAdmin.from("tbl_Collections").select(LIST_COLS);

  const checkNo = filters.checkNo.trim();
  if (checkNo) q = q.eq("check_no", checkNo);

  const amountText = filters.amount.trim().replace(/,/g, "");
  if (amountText) {
    const amount = Number(amountText);
    if (!Number.isFinite(amount)) throw new Error("Check amount must be a number.");
    q = q.gte("check_amount", amount - 0.005).lte("check_amount", amount + 0.005);
  }

  if (filters.customerId != null) q = q.eq("customer_id", filters.customerId);

  const { data, error } = await q.order("check_date", { ascending: false }).order("id", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return toListRows((data ?? []) as any[]);
}

/** Every recorded check number, for the check number filter dropdown. */
export async function getCheckOptions(): Promise<CheckOption[]> {
  await requireModule("collection");

  const rows = await fetchAllRows<any>((from, to) =>
    supabaseAdmin
      .from("tbl_Collections")
      .select("id, customer_id, check_no, check_amount")
      .order("id", { ascending: false })
      .range(from, to)
  );
  if (rows.length === 0) return [];

  const names = new Map<number, string>();
  const customerIds = uniq(rows.map((r) => r.customer_id));
  for (let i = 0; i < customerIds.length; i += 200) {
    const { data } = await supabaseAdmin.from("tbl_Customer").select("id, customer_name").in("id", customerIds.slice(i, i + 200));
    for (const c of (data ?? []) as any[]) names.set(c.id, c.customer_name);
  }

  return rows.map((r) => ({
    id: r.id,
    checkNo: String(r.check_no),
    customerName: names.get(r.customer_id) ?? "",
    amount: Number(r.check_amount),
  }));
}

export async function getCollection(id: number): Promise<CollectionDetail | null> {
  await requireModule("collection");

  const { data: c } = await supabaseAdmin
    .from("tbl_Collections")
    .select("id, date_collected, customer_id, customer_bank_id, check_no, check_date, check_amount, for_month_of, remarks, date_deposited, bank_id")
    .eq("id", id)
    .maybeSingle();
  const row = c as any;
  if (!row) return null;

  const [{ data: customer }, { data: bank }, { data: deds }] = await Promise.all([
    supabaseAdmin.from("tbl_Customer").select("customer_name").eq("id", row.customer_id).maybeSingle(),
    row.bank_id != null
      ? supabaseAdmin.from("tbl_Bank").select("bank_name").eq("id", row.bank_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from("tbl_Collection_Deductions")
      .select("collection_deduction_id, deducted_amount, remarks")
      .eq("collection_id", id)
      .order("id"),
  ]);

  return {
    id: row.id,
    dateCollected: row.date_collected,
    customerId: row.customer_id,
    customerName: (customer as any)?.customer_name ?? "",
    customerBankId: row.customer_bank_id,
    checkNo: String(row.check_no),
    checkDate: row.check_date,
    checkAmount: Number(row.check_amount),
    forMonthOf: row.for_month_of,
    remarks: row.remarks ?? null,
    dateDeposited: row.date_deposited ?? null,
    bankId: row.bank_id ?? null,
    bankName: (bank as any)?.bank_name ?? null,
    deductions: ((deds ?? []) as any[]).map((d) => ({
      typeId: d.collection_deduction_id,
      amount: Number(d.deducted_amount),
      remarks: d.remarks ?? "",
    })),
  };
}

/* ---------- writes ---------- */

/** Adds a customer bank typed in by the user (or returns the existing one with the same name). */
export async function createCustomerBank(name: string): Promise<{ error?: string; option?: Option }> {
  await requireModule("collection");

  const clean = name.trim();
  if (!clean) return { error: "Enter the bank name." };

  const { data: existing } = await supabaseAdmin
    .from("tbl_Customer_Banks")
    .select("id, customer_bank_name")
    .ilike("customer_bank_name", clean.replace(/[%_]/g, " "))
    .limit(1);
  const hit = ((existing ?? []) as any[]).find((b) => String(b.customer_bank_name).trim().toLowerCase() === clean.toLowerCase());
  if (hit) return { option: { id: hit.id, label: hit.customer_bank_name } };

  const { data, error } = await supabaseAdmin
    .from("tbl_Customer_Banks")
    .insert({ customer_bank_name: clean })
    .select("id, customer_bank_name")
    .single();
  if (error || !data) return { error: `Could not save the bank: ${error?.message ?? "unknown error"}` };

  revalidatePath("/collection");
  return { option: { id: (data as any).id, label: (data as any).customer_bank_name } };
}

export async function saveCollection(input: SaveCollectionInput): Promise<{ error?: string; id?: number }> {
  await requireModule("collection");

  if (!input.customerId) return { error: "Select a customer." };
  if (!input.customerBankId) return { error: "Select the customer's bank." };
  input = { ...input, checkNo: input.checkNo.trim() };
  if (!input.checkNo) return { error: "Enter the check number." };
  if (input.checkNo.length > 40) return { error: "The check number is too long." };
  if (!ISO.test(input.checkDate)) return { error: "Check date is required." };
  if (!ISO.test(input.dateCollected)) return { error: "Date collected is required." };
  if (!Number.isFinite(input.checkAmount) || input.checkAmount <= 0) return { error: "Check amount must be greater than zero." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.forMonthOf)) return { error: "Choose the year and month the payment is for." };
  for (const d of input.deductions) {
    if (!d.typeId) return { error: "Choose a type for every deduction row." };
    if (!Number.isFinite(d.amount) || d.amount <= 0) return { error: "Every deduction needs an amount greater than zero." };
  }

  // the same check number from the same customer bank is almost certainly a double entry
  let dup = supabaseAdmin
    .from("tbl_Collections")
    .select("id")
    .eq("customer_bank_id", input.customerBankId)
    .eq("check_no", input.checkNo);
  if (input.id != null) dup = dup.neq("id", input.id);
  const { data: dupRows } = await dup.limit(1);
  if (((dupRows ?? []) as any[]).length > 0) return { error: "This check number is already recorded for that bank." };

  const fields = {
    date_collected: input.dateCollected,
    customer_id: input.customerId,
    customer_bank_id: input.customerBankId,
    check_no: input.checkNo,
    check_date: input.checkDate,
    check_amount: input.checkAmount,
    for_month_of: input.forMonthOf,
    remarks: input.remarks.trim() || null,
  };
  const dedRows = (collectionId: number) =>
    input.deductions.map((d) => ({
      collection_id: collectionId,
      collection_deduction_id: d.typeId,
      deducted_amount: d.amount,
      remarks: d.remarks.trim() || null,
    }));

  if (input.id == null) {
    const { data, error } = await supabaseAdmin.from("tbl_Collections").insert(fields).select("id").single();
    if (error || !data) return { error: `Could not save: ${error?.message ?? "unknown error"}` };
    const newId = (data as any).id as number;

    if (input.deductions.length > 0) {
      const { error: dErr } = await supabaseAdmin.from("tbl_Collection_Deductions").insert(dedRows(newId));
      if (dErr) {
        await supabaseAdmin.from("tbl_Collections").delete().eq("id", newId);
        return { error: `Could not save the deductions: ${dErr.message}` };
      }
    }
    revalidatePath("/collection");
    return { id: newId };
  }

  // editing: only while the check is not deposited
  const { data: cur } = await supabaseAdmin.from("tbl_Collections").select("date_deposited").eq("id", input.id).maybeSingle();
  if (!cur) return { error: "Collection not found." };
  if ((cur as any).date_deposited) return { error: "This check is deposited and locked. Undo the deposit before editing." };

  const { error: uErr } = await supabaseAdmin.from("tbl_Collections").update(fields).eq("id", input.id);
  if (uErr) return { error: `Could not save: ${uErr.message}` };

  const { data: oldDeds } = await supabaseAdmin
    .from("tbl_Collection_Deductions")
    .select("collection_id, collection_deduction_id, deducted_amount, remarks")
    .eq("collection_id", input.id);
  await supabaseAdmin.from("tbl_Collection_Deductions").delete().eq("collection_id", input.id);
  if (input.deductions.length > 0) {
    const { error: dErr } = await supabaseAdmin.from("tbl_Collection_Deductions").insert(dedRows(input.id));
    if (dErr) {
      if (oldDeds && oldDeds.length) await supabaseAdmin.from("tbl_Collection_Deductions").insert(oldDeds as any[]);
      return { error: `Could not save the deductions: ${dErr.message}` };
    }
  }
  revalidatePath("/collection");
  return { id: input.id };
}

/** Records the deposit in the bank transactions and marks the collection deposited. */
export async function depositCollection(
  id: number,
  dateDeposited: string,
  bankId: number
): Promise<{ error?: string }> {
  await requireModule("collection");

  if (!ISO.test(dateDeposited)) return { error: "Enter the date deposited." };
  if (!bankId) return { error: "Select the bank." };

  const { data: c } = await supabaseAdmin
    .from("tbl_Collections")
    .select("id, customer_id, check_no, check_amount, for_month_of, date_deposited")
    .eq("id", id)
    .maybeSingle();
  const row = c as any;
  if (!row) return { error: "Collection not found." };
  if (row.date_deposited) return { error: "This check is already deposited." };

  const { data: customer } = await supabaseAdmin.from("tbl_Customer").select("customer_name").eq("id", row.customer_id).maybeSingle();
  const payee = `${(customer as any)?.customer_name ?? ""} - C${row.id} - ${row.for_month_of}`;

  const { data: tx, error: txErr } = await supabaseAdmin
    .from("tbl_Bank_Transactions")
    .insert({
      Check_No: String(row.check_no),
      bank_id: bankId,
      dt_check: dateDeposited,
      Payee: payee,
      Deposit: row.check_amount,
    })
    .select("id")
    .single();
  if (txErr || !tx) {
    const clash = (txErr as any)?.code === "23505";
    return {
      error: clash
        ? `Check number ${row.check_no} already exists in the bank transactions, so it can't be deposited again.`
        : `Could not record the deposit: ${txErr?.message ?? "unknown error"}`,
    };
  }

  const { error: uErr } = await supabaseAdmin
    .from("tbl_Collections")
    .update({ date_deposited: dateDeposited, bank_id: bankId })
    .eq("id", id);
  if (uErr) {
    await supabaseAdmin.from("tbl_Bank_Transactions").delete().eq("id", (tx as any).id);
    return { error: `Could not mark the check as deposited: ${uErr.message}` };
  }

  revalidatePath("/collection");
  revalidatePath("/bank");
  return {};
}

/**
 * Unlocks a deposited check. Needs the undo-deposit password (tbl_App_Settings: undo_deposit_password,
 * falling back to check_cancel_password). Removes the matching deposit from the bank transactions.
 */
export async function undoDeposit(id: number, password: string): Promise<{ error?: string; removed?: number }> {
  await requireModule("collection");

  const pw = await verifyAppPassword(["undo_deposit_password", "check_cancel_password"], password);
  if (!pw.ok) return { error: pw.error };

  const { data: c } = await supabaseAdmin
    .from("tbl_Collections")
    .select("id, check_no, date_deposited, bank_id")
    .eq("id", id)
    .maybeSingle();
  const row = c as any;
  if (!row) return { error: "Collection not found." };
  if (!row.date_deposited || row.bank_id == null) return { error: "This check is not deposited." };

  // only the deposit row is removed (never a check the company issued, which has a withdrawal)
  const { data: removed, error: dErr } = await supabaseAdmin
    .from("tbl_Bank_Transactions")
    .delete()
    .eq("Check_No", String(row.check_no))
    .eq("bank_id", row.bank_id)
    .not("Deposit", "is", null)
    .select("id");
  if (dErr) return { error: `Could not remove the bank deposit: ${dErr.message}` };

  const { error: uErr } = await supabaseAdmin
    .from("tbl_Collections")
    .update({ date_deposited: null, bank_id: null })
    .eq("id", id);
  if (uErr) return { error: `The bank deposit was removed but the check could not be unlocked: ${uErr.message}` };

  revalidatePath("/collection");
  revalidatePath("/bank");
  return { removed: ((removed ?? []) as any[]).length };
}
