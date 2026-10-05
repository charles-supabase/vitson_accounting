import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type PoPrintLine = {
  qty: number;
  unit: string;
  bound: string;
  item: string;
  description: string;
  price: number;
  discount: number;
  netPrice: number;
  amount: number;
};

export type PoPrintData = {
  poId: number;
  poNo: number;
  date: string; // MM/DD/YYYY
  supplierName: string;
  supplierEmail: string | null;
  attention: string;
  sort: string;
  groupNumber: string;
  groupName: string;
  reference: string;
  terms: string;
  lines: PoPrintLine[];
  total: number;
};

const uniq = (xs: any[]) => Array.from(new Set(xs.filter((x) => x != null)));

/** Everything the printed purchase order shows, gathered for the PDF. Returns null if the PO doesn't exist. */
export async function getPoPrintData(poId: number): Promise<PoPrintData | null> {
  const { data: poRow } = await supabaseAdmin.from("tbl_Purchase_Order").select("*").eq("id", poId).maybeSingle();
  if (!poRow) return null;
  const po = poRow as any;

  const [{ data: sup }, { data: req }, { data: sorting }, { data: book }, { data: lineRows }] = await Promise.all([
    supabaseAdmin.from("tbl_Supplier").select("Supplier_Name, Email").eq("id", po.supplier_id).maybeSingle(),
    po.requisition_id
      ? supabaseAdmin.from("tbl_Requisition").select("request_no").eq("id", po.requisition_id).maybeSingle()
      : Promise.resolve({ data: null }),
    po.Acc_Sorting_id
      ? supabaseAdmin.from("tbl_Acc_Sorting").select("Sort_name").eq("id", po.Acc_Sorting_id).maybeSingle()
      : Promise.resolve({ data: null }),
    po.Acc_Book_id
      ? supabaseAdmin.from("tbl_Acc_Book").select("Book_Name, Book_Number").eq("id", po.Acc_Book_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from("tbl_PO_details")
      .select("id, qty, unit_id, item_id, bound_id, price, discount, remarks")
      .eq("PO_id", poId)
      .order("id"),
  ]);

  const lines = (lineRows ?? []) as any[];
  const [{ data: items }, { data: units }, { data: bounds }] = await Promise.all([
    supabaseAdmin.from("tbl_Item").select("id, item_name").in("id", uniq(lines.map((l) => l.item_id))),
    supabaseAdmin.from("tbl_Unit").select("id, unit_name").in("id", uniq(lines.map((l) => l.unit_id))),
    supabaseAdmin.from("tbl_Item_Bound").select("id, bound_name").in("id", uniq(lines.map((l) => l.bound_id))),
  ]);
  const itemName = new Map<number, string>(((items ?? []) as any[]).map((i): [number, string] => [i.id, i.item_name]));
  const unitName = new Map<number, string>(((units ?? []) as any[]).map((u): [number, string] => [u.id, u.unit_name]));
  const boundName = new Map<number, string>(((bounds ?? []) as any[]).map((b): [number, string] => [b.id, b.bound_name]));

  const printLines: PoPrintLine[] = lines.map((l) => {
    const disc = Number(l.discount ?? 0);
    const net = Number(l.price) * (1 - disc / 100);
    return {
      qty: Number(l.qty),
      unit: unitName.get(l.unit_id) ?? "",
      bound: boundName.get(l.bound_id) ?? "",
      item: itemName.get(l.item_id) ?? `Item #${l.item_id}`,
      description: l.remarks ?? "",
      price: Number(l.price),
      discount: disc,
      netPrice: net,
      amount: Number(l.qty) * net,
    };
  });

  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(po.dt_PO ?? "");
  return {
    poId,
    poNo: po.po_no,
    date: m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : "",
    supplierName: (sup as any)?.Supplier_Name ?? "",
    supplierEmail: (sup as any)?.Email ?? null,
    attention: po.attention ?? "",
    sort: (sorting as any)?.Sort_name ?? "",
    groupNumber: (book as any)?.Book_Number != null ? String((book as any).Book_Number) : "",
    groupName: (book as any)?.Book_Name ?? "",
    reference: (req as any)?.request_no != null ? String((req as any).request_no) : "",
    terms: po.terms != null ? `${po.terms} days` : "",
    lines: printLines,
    total: printLines.reduce((a, l) => a + l.amount, 0),
  };
}
