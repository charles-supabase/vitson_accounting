import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/print-button";
import { PoEditor } from "@/components/po-editor";
import { EmailButton } from "@/components/email-button";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireModule("purchase_order");
  const { id } = await params;
  const poId = Number(id);
  if (!poId) notFound();

  const { data: poRow } = await supabaseAdmin
    .from("tbl_Purchase_Order")
    .select("*")
    .eq("id", poId)
    .maybeSingle();
  if (!poRow) notFound();
  const po = poRow as any;

  const [
    { data: supplier },
    { data: requisition },
    { data: accBook },
    { data: accCategory },
    { data: lineRows },
    { data: accSorting },
    { data: accBookFull },
  ] = await Promise.all([
    supabaseAdmin.from("tbl_Supplier").select("Supplier_Name, Contact_Person, Phone, supplier_TIN, Email").eq("id", po.supplier_id).maybeSingle(),
    po.requisition_id
      ? supabaseAdmin.from("tbl_Requisition").select("id, request_no").eq("id", po.requisition_id).maybeSingle()
      : Promise.resolve({ data: null }),
    po.Acc_Book_id
      ? supabaseAdmin.from("tbl_Acc_Book").select("Book_Name").eq("id", po.Acc_Book_id).maybeSingle()
      : Promise.resolve({ data: null }),
    po.Acc_Category_id
      ? supabaseAdmin.from("tbl_Acc_Category").select("Acc_Category_Name").eq("id", po.Acc_Category_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from("tbl_PO_details")
      .select("id, qty, unit_id, item_id, bound_id, price, discount, remarks")
      .eq("PO_id", poId)
      .order("id"),
    po.Acc_Sorting_id
      ? supabaseAdmin.from("tbl_Acc_Sorting").select("Sort_name").eq("id", po.Acc_Sorting_id).maybeSingle()
      : Promise.resolve({ data: null }),
    po.Acc_Book_id
      ? supabaseAdmin.from("tbl_Acc_Book").select("Book_Name, Book_Number").eq("id", po.Acc_Book_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const lines = (lineRows ?? []) as any[];
  const uniq = (xs: any[]) => Array.from(new Set(xs.filter((x) => x != null)));
  const [{ data: items }, { data: units }] = await Promise.all([
    supabaseAdmin.from("tbl_Item").select("id, item_name").in("id", uniq(lines.map((l) => l.item_id))),
    supabaseAdmin.from("tbl_Unit").select("id, unit_name").in("id", uniq(lines.map((l) => l.unit_id))),
  ]);
  const { data: boundRows } = await supabaseAdmin
    .from("tbl_Item_Bound")
    .select("id, bound_name")
    .in("id", uniq(lines.map((l) => l.bound_id)));
  const boundName = new Map<number, string>(((boundRows ?? []) as any[]).map((b): [number, string] => [b.id, b.bound_name]));
  const itemName = new Map<number, string>(((items ?? []) as any[]).map((i): [number, string] => [i.id, i.item_name]));
  const unitName = new Map<number, string>(((units ?? []) as any[]).map((u): [number, string] => [u.id, u.unit_name]));

  const lineTotal = (l: any) => l.qty * l.price * (1 - (l.discount ?? 0) / 100);

  const { data: sortingRows } = await supabaseAdmin.from("tbl_Acc_Sorting").select("id, Sort_name").order("Sort_name");
  const { data: lockRows } = await supabaseAdmin
    .from("tbl_PO_details")
    .select("bool_recieved, bool_plant_recieved, cancelled_qty")
    .eq("PO_id", poId);
  const receivingStarted = ((lockRows ?? []) as any[]).some(
    (l) => l.bool_recieved || l.bool_plant_recieved || Number(l.cancelled_qty ?? 0) !== 0
  );
  const poLocked = !!po.printed_at || !!po.emailed_at || receivingStarted;
  const poLockedReason = po.printed_at || po.emailed_at
    ? "This purchase order was printed or emailed, so it can no longer be edited."
    : receivingStarted
      ? "Items on this purchase order were received or cancelled, so it can no longer be edited."
      : null;
  const grand = lines.reduce((s, l) => s + lineTotal(l), 0);

  const sup = supplier as any;

  return (
    <AppShell
      title={`Purchase Order #${po.po_no}`}
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href="/purchase-order" className="text-sm text-ink-soft underline hover:text-ink">
          Back to purchase orders
        </Link>
        <div className="flex items-center gap-2">
          <EmailButton
            poId={po.id}
            to={sup?.Email ?? null}
            subject={`Purchase Order No. ${po.po_no} - Vitson International, Inc.`}
            body={`Dear ${sup?.Supplier_Name ?? "Supplier"},\n\nPlease find attached Purchase Order #${po.po_no}, dated ${formatDate(
              po.dt_PO
            )}, with expected delivery by ${formatDate(po.dt_Delivery)}.\n\nThank you.`}
            emailed={!!po.emailed_at}
          />
          <PrintButton poId={po.id} printed={!!po.printed_at} />
        </div>
      </div>

      <style>{"@page { margin: 8mm; }"}</style>

      <div className="hidden print:block">
        <div className="mx-auto w-full bg-white text-black">
          <h1 className="text-center font-serif text-[22px] font-semibold tracking-wide">VITSON INTERNATIONAL, INCORPORATED</h1>
          <h2 className="mb-4 mt-3 text-center font-serif text-[15px] tracking-wide">PURCHASE ORDER</h2>

          <div className="grid grid-cols-[1fr_17rem] gap-x-10 text-[13px]">
            <div className="space-y-1">
              <div className="flex items-end gap-4">
                <span className="w-20 font-serif">To :</span>
                <span className="flex-1 border-b border-black pb-0.5 font-sans">{sup?.Supplier_Name ?? ""}</span>
              </div>
              <div className="flex items-end gap-4">
                <span className="w-20 font-serif">Attention</span>
                <span className="flex-1 border-b border-black pb-0.5 font-sans">{po.attention ?? "\u00a0"}</span>
              </div>
              <div className="flex items-end gap-4">
                <span className="w-20 font-serif">Sort</span>
                <span className="flex-1 border-b border-black pb-0.5 font-sans">{(accSorting as any)?.Sort_name ?? "\u00a0"}</span>
              </div>
              <div className="flex items-end gap-4">
                <span className="w-20 font-serif">Group</span>
                <span className="flex-1 border-b border-black pb-0.5 font-sans">
                  {(accBookFull as any)?.Book_Number ?? ""}
                  <span className="ml-8">{(accBookFull as any)?.Book_Name ?? ""}</span>
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-end gap-3">
                <span className="w-20 font-serif">No.</span>
                <span className="flex-1 border-b border-black pb-0.5 text-right font-sans">{po.po_no}</span>
              </div>
              <div className="flex items-end gap-3">
                <span className="w-20 font-serif">Date</span>
                <span className="flex-1 border-b border-black pb-0.5 font-sans">{formatDate(po.dt_PO)}</span>
              </div>
              <div className="flex items-end gap-3">
                <span className="w-20 font-serif">Reference</span>
                <span className="flex-1 border-b border-black pb-0.5 font-sans">{(requisition as any)?.request_no ?? "\u00a0"}</span>
              </div>
              <div className="flex items-end gap-3">
                <span className="w-20 font-serif">Terms</span>
                <span className="flex-1 border-b border-black pb-0.5 font-sans">{po.terms != null ? `${po.terms} days` : "\u00a0"}</span>
              </div>
            </div>
          </div>

          <table className="mt-3 w-full border-collapse border border-black text-[12px]">
            <thead>
              <tr className="font-serif">
                <th className="border border-black px-1 py-1 text-center">Qty</th>
                <th className="border border-black px-1 py-1 text-center">Unit</th>
                <th className="border border-black px-1 py-1 text-center">Bound</th>
                <th className="border border-black px-1 py-1 text-center">Item</th>
                <th className="border border-black px-1 py-1 text-center">Description</th>
                <th className="border border-black px-1 py-1 text-center">Price</th>
                <th className="border border-black px-1 py-1 text-center">Disc</th>
                <th className="border border-black px-1 py-1 text-center">Price</th>
                <th className="border border-black px-1 py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="font-sans">
              {lines.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="h-9 border border-black px-1 py-0.5 text-center">{l.qty}</td>
                  <td className="border border-black px-1 py-0.5 text-center">{unitName.get(l.unit_id) ?? ""}</td>
                  <td className="border border-black px-1 py-0.5">{boundName.get(l.bound_id) ?? ""}</td>
                  <td className="border border-black px-1 py-0.5">{itemName.get(l.item_id) ?? `#${l.item_id}`}</td>
                  <td className="border border-black px-1 py-0.5">{l.remarks ?? ""}</td>
                  <td className="border border-black px-1 py-0.5 text-right">{fmt(l.price)}</td>
                  <td className="border border-black px-1 py-0.5 text-center">{l.discount ?? 0}%</td>
                  <td className="border border-black px-1 py-0.5 text-right">{fmt(l.price * (1 - (l.discount ?? 0) / 100))}</td>
                  <td className="border border-black px-1 py-0.5 text-right">{fmt(lineTotal(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-1 flex items-center justify-end gap-6 text-[13px]">
            <span className="font-serif italic font-semibold">Total</span>
            <span className="w-40 border border-black px-1 py-0.5 text-right font-sans">{fmt(grand)}</span>
          </div>

          <div className="mt-6 grid grid-cols-[1fr_17rem] gap-x-10 text-[11px]">
            <p className="font-serif italic leading-snug">
              The above order must be delivered as per specs/sample submitted. Our receiving officer has the right to reject any
              delivery which is not in confirmity with specs/sample submitted. Please indicate PO Number on all copies of invoice.
            </p>
            <div className="font-serif text-[13px]">Vitson International Inc.</div>
          </div>
          <div className="mt-8 grid grid-cols-[1fr_17rem] gap-x-10 text-[13px]">
            <div className="flex items-end gap-3 font-serif">
              <span>CONFIRMED :</span>
              <span className="w-56 border-b border-black">&nbsp;</span>
            </div>
            <div className="border-t border-black pt-1 text-center font-serif">Authorized Signature</div>
          </div>
        </div>
      </div>

      <div className="mb-8 rounded border border-line bg-paper-raised p-6 print:hidden">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="ledger-label">PO date</p>
            <p className="text-sm text-ink">{formatDate(po.dt_PO)}</p>
          </div>
          <div>
            <p className="ledger-label">Expected delivery</p>
            <p className="text-sm text-ink">{formatDate(po.dt_Delivery)}</p>
          </div>
          <div>
            <p className="ledger-label">Terms</p>
            <p className="text-sm text-ink">{po.terms != null ? `${po.terms} days` : "\u2014"}</p>
          </div>
          <div>
            <p className="ledger-label">Requisition</p>
            <p className="text-sm text-ink">
              {requisition ? (
                <Link
                  href={`/requisition/${(requisition as any).id}`}
                  className="font-mono underline print:no-underline"
                >
                  #{(requisition as any).request_no}
                </Link>
              ) : (
                "\u2014"
              )}
            </p>
          </div>
          <div className="col-span-2">
            <p className="ledger-label">Supplier</p>
            <p className="text-sm font-medium text-ink">{sup?.Supplier_Name ?? "\u2014"}</p>
            <p className="text-xs text-ink-soft">
              {[sup?.Contact_Person, sup?.Email, sup?.Phone, sup?.supplier_TIN ? `TIN ${sup.supplier_TIN}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div>
            <p className="ledger-label">Attention</p>
            <p className="text-sm text-ink">{po.attention ?? "\u2014"}</p>
          </div>
          <div>
            <p className="ledger-label">Destination</p>
            <p className="text-sm text-ink">{po.destination ?? "\u2014"}</p>
          </div>
          <div>
            <p className="ledger-label">Bound</p>
            <p className="text-sm text-ink">{Array.from(new Set(lines.map((l) => boundName.get(l.bound_id)).filter(Boolean))).join(", ") || "\u2014"}</p>
          </div>
          <div>
            <p className="ledger-label">Account sorting</p>
            <p className="text-sm text-ink">{(accSorting as any)?.Sort_name ?? "\u2014"}</p>
          </div>
          <div>
            <p className="ledger-label">Petty cash</p>
            <p className="text-sm text-ink">{po.bool_petty_cash ? "Yes (received under SM PETTY CASH)" : "No"}</p>
          </div>
          <div>
            <p className="ledger-label">Account book</p>
            <p className="text-sm text-ink">{(accBook as any)?.Book_Name ?? "\u2014"}</p>
          </div>
          <div>
            <p className="ledger-label">Account category</p>
            <p className="text-sm text-ink">{(accCategory as any)?.Acc_Category_Name ?? "\u2014"}</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-line bg-paper-raised print:hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left ledger-label">
              <th className="px-4 py-2 font-normal">Item</th>
              <th className="px-4 py-2 font-normal">Unit</th>
              <th className="px-4 py-2 text-right font-normal">Qty</th>
              <th className="px-4 py-2 text-right font-normal">Price</th>
              <th className="px-4 py-2 text-right font-normal">Disc %</th>
              <th className="px-4 py-2 text-right font-normal">Total</th>
              <th className="px-4 py-2 font-normal">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2 font-medium text-ink">{itemName.get(l.item_id) ?? `#${l.item_id}`}</td>
                <td className="px-4 py-2 text-ink-soft">{unitName.get(l.unit_id) ?? ""}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-soft">{l.qty}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-soft">{fmt(l.price)}</td>
                <td className="px-4 py-2 text-right font-mono text-ink-soft">{l.discount ?? 0}</td>
                <td className="px-4 py-2 text-right font-mono text-ink">{fmt(lineTotal(l))}</td>
                <td className="px-4 py-2 text-ink-soft">{l.remarks ?? ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line">
              <td colSpan={5} className="px-4 py-2 text-right text-xs text-ink-soft">
                Total
              </td>
              <td className="px-4 py-2 text-right font-mono font-medium text-ink">{fmt(grand)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <PoEditor
        id={po.id}
        locked={poLocked}
        lockedReason={poLockedReason}
        dtPo={po.dt_PO}
        dtDelivery={po.dt_Delivery}
        terms={po.terms ?? null}
        attention={po.attention ?? ""}
        destination={po.destination ?? ""}
        accSortingId={po.Acc_Sorting_id ?? null}
        boolPettyCash={!!po.bool_petty_cash}
        lines={lines.map((l) => ({
          id: l.id,
          itemName: itemName.get(l.item_id) ?? `Item #${l.item_id}`,
          unitName: unitName.get(l.unit_id) ?? "",
          qty: Number(l.qty),
          price: Number(l.price),
          discount: Number(l.discount ?? 0),
          remarks: l.remarks ?? "",
        }))}
        accSortings={((sortingRows ?? []) as any[]).map((a) => ({ id: a.id, label: a.Sort_name }))}
      />
    </AppShell>
  );
}
