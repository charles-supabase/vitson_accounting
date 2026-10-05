import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppShell } from "@/components/app-shell";
import { RequisitionDecisionButtons } from "@/components/requisition-decision-buttons";
import { RequisitionEditor } from "@/components/requisition-editor";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireModule("requisition");
  const { id } = await params;
  const requisitionId = Number(id);
  if (!requisitionId) notFound();

  const [{ data: header, error: headerError }, { data: details, error: detailsError }] =
    await Promise.all([
      supabaseAdmin
        .from("tbl_Requisition")
        .select(
          "id, request_no, dt_request, remark, status, approved_at, tbl_Project_ID(project_name), tbl_Acc_Book(Book_Name), created_by_user:tbl_User!tbl_Requisition_created_by_fkey(user_login_name), approved_by_user:tbl_User!tbl_Requisition_approved_by_fkey(user_login_name)"
        )
        .eq("id", requisitionId)
        .maybeSingle(),
      supabaseAdmin
        .from("tbl_Requisition_Details")
        .select(
          "id, qty, on_Hand, on_Hand_Recipe, on_Hand_Daily, bool_rush, remarks, tbl_Item(item_name), tbl_Unit(unit_name), tbl_Supplier(Supplier_Name), tbl_Item_packaging(packaging_name)"
        )
        .eq("request_id", requisitionId),
    ]);

  if (headerError || !header) notFound();

  // the plain values the editor below needs
  const [{ data: editHead }, { data: editLines }, { data: units }, { data: packagings }, { data: suppliers }, { data: projects }, { data: accBooks }] =
    await Promise.all([
      supabaseAdmin.from("tbl_Requisition").select("dt_request, remark, project_id, Acc_Book_id").eq("id", requisitionId).maybeSingle(),
      supabaseAdmin
        .from("tbl_Requisition_Details")
        .select("id, qty, unit_id, item_packaging, supplier_id, bool_rush, price, remarks, tbl_Item(item_name)")
        .eq("request_id", requisitionId)
        .order("id"),
      supabaseAdmin.from("tbl_Unit").select("id, unit_name").order("unit_name"),
      supabaseAdmin.from("tbl_Item_packaging").select("id, packaging_name").order("packaging_name"),
      supabaseAdmin.from("tbl_Supplier").select("id, Supplier_Name").order("Supplier_Name"),
      supabaseAdmin.from("tbl_Project_ID").select("id, project_name").order("project_name"),
      supabaseAdmin.from("tbl_Acc_Book").select("id, Book_Name").order("Book_Name"),
    ]);
  const eh = (editHead ?? {}) as any;

  return (
    <AppShell
      title={`Requisition #${header.request_no}`}
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <div className="mb-8 rounded border border-line bg-paper-raised p-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="ledger-label">Date</p>
            <p className="text-sm text-ink">{formatDate(header.dt_request)}</p>
          </div>
          <div>
            <p className="ledger-label">Project</p>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <p className="text-sm text-ink">{(header as any).tbl_Project_ID?.project_name ?? "\u2014"}</p>
          </div>
          <div>
            <p className="ledger-label">Account book</p>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <p className="text-sm text-ink">{(header as any).tbl_Acc_Book?.Book_Name ?? "\u2014"}</p>
          </div>
          <div>
            <p className="ledger-label">Requested by</p>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <p className="text-sm text-ink">{(header as any).created_by_user?.user_login_name ?? "\u2014"}</p>
          </div>
          <div>
            <p className="ledger-label">Status</p>
            <p className="text-sm text-ink">{header.status}</p>
          </div>
          {header.status !== "PENDING" && (
            <div>
              <p className="ledger-label">Decided by</p>
              <p className="text-sm text-ink">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(header as any).approved_by_user?.user_login_name ?? "\u2014"}
              </p>
            </div>
          )}
          {header.remark && (
            <div className="col-span-2 sm:col-span-4">
              <p className="ledger-label">Remark</p>
              <p className="text-sm text-ink">{header.remark}</p>
            </div>
          )}
        </div>

        {header.status === "PENDING" && (
          <div className="mt-6 border-t border-line pt-4">
            <RequisitionDecisionButtons requisitionId={header.id} />
          </div>
        )}
      </div>

      <h2 className="mb-4 font-display text-lg font-semibold text-ink">Items</h2>
      {detailsError ? (
        <p className="text-sm text-danger">Could not load items: {detailsError.message}</p>
      ) : !details || details.length === 0 ? (
        <p className="text-sm text-ink-soft">No items on this requisition.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-line bg-paper-raised">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left ledger-label">
                <th className="px-4 py-2 font-normal">Item</th>
                <th className="px-4 py-2 font-normal">Qty</th>
                <th className="px-4 py-2 font-normal">Unit</th>
                <th className="px-4 py-2 font-normal">Packaging</th>
                <th className="px-4 py-2 font-normal">Supplier</th>
                <th className="px-4 py-2 font-normal">Rush</th>
                <th className="px-4 py-2 font-normal">On hand</th>
                <th className="px-4 py-2 font-normal">On hand (recipe)</th>
                <th className="px-4 py-2 font-normal">On hand (daily)</th>
                <th className="px-4 py-2 font-normal">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(details as any[]).map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 font-medium text-ink">{d.tbl_Item?.item_name ?? "\u2014"}</td>
                  <td className="px-4 py-2 font-mono text-ink-soft">{d.qty}</td>
                  <td className="px-4 py-2 text-ink-soft">{d.tbl_Unit?.unit_name ?? "\u2014"}</td>
                  <td className="px-4 py-2 text-ink-soft">{d.tbl_Item_packaging?.packaging_name ?? "\u2014"}</td>
                  <td className="px-4 py-2 text-ink-soft">{d.tbl_Supplier?.Supplier_Name ?? "\u2014"}</td>
                  <td className="px-4 py-2 text-ink-soft">{d.bool_rush ? "yes" : "no"}</td>
                  <td className="px-4 py-2 font-mono text-ink-soft">{d.on_Hand ?? "\u2014"}</td>
                  <td className="px-4 py-2 font-mono text-ink-soft">{d.on_Hand_Recipe ?? "\u2014"}</td>
                  <td className="px-4 py-2 font-mono text-ink-soft">{d.on_Hand_Daily ?? "\u2014"}</td>
                  <td className="px-4 py-2 text-ink-soft">{d.remarks ?? "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RequisitionEditor
        id={header.id}
        status={header.status}
        dtRequest={eh.dt_request ?? header.dt_request}
        accBookId={eh.Acc_Book_id ?? null}
        projectId={eh.project_id ?? null}
        remark={eh.remark ?? ""}
        lines={((editLines ?? []) as any[]).map((l) => ({
          id: l.id,
          itemName: l.tbl_Item?.item_name ?? "",
          qty: Number(l.qty),
          unitId: l.unit_id ?? null,
          packagingId: l.item_packaging ?? null,
          supplierId: l.supplier_id ?? null,
          boolRush: !!l.bool_rush,
          price: l.price ?? null,
          remarks: l.remarks ?? "",
        }))}
        units={(units ?? []).map((u: any) => ({ id: u.id, label: u.unit_name }))}
        packagings={(packagings ?? []).map((p: any) => ({ id: p.id, label: p.packaging_name }))}
        suppliers={(suppliers ?? []).map((x: any) => ({ id: x.id, label: x.Supplier_Name }))}
        projects={(projects ?? []).map((p: any) => ({ id: p.id, label: p.project_name }))}
        accBooks={(accBooks ?? []).map((b: any) => ({ id: b.id, label: b.Book_Name }))}
      />
    </AppShell>
  );
}
