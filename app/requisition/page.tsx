import { requireModule } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppShell } from "@/components/app-shell";
import { RequisitionWorkspace } from "@/components/requisition-workspace";
import { getRequisitionList } from "@/actions/requisitions";

export const dynamic = "force-dynamic";

export default async function RequisitionPage() {
  const session = await requireModule("requisition");

  const [
    list,
    { data: items },
    { data: units },
    { data: suppliers },
    { data: packagings },
    { data: accBooks },
    { data: projects },
    { data: bounds },
    { data: shades },
  ] = await Promise.all([
    getRequisitionList(),
    supabaseAdmin.from("tbl_Item").select("id, item_name").order("item_name"),
    supabaseAdmin.from("tbl_Unit").select("id, unit_name").order("unit_name"),
    supabaseAdmin.from("tbl_Supplier").select("id, Supplier_Name").order("Supplier_Name"),
    supabaseAdmin.from("tbl_Item_packaging").select("id, packaging_name").order("packaging_name"),
    supabaseAdmin.from("tbl_Acc_Book").select("id, Book_Name").order("Book_Name"),
    supabaseAdmin.from("tbl_Project_ID").select("id, project_name").order("project_name"),
    supabaseAdmin.from("tbl_Item_Bound").select("id, bound_name").order("bound_name"),
    supabaseAdmin.from("tbl_Shade_Classification").select("id, Shade_name").order("Shade_name"),
  ]);

  return (
    <AppShell
      title="Requisition"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <RequisitionWorkspace
        initialList={list}
        items={(items ?? []).map((i) => ({ id: i.id, label: i.item_name }))}
        units={(units ?? []).map((u) => ({ id: u.id, label: u.unit_name }))}
        suppliers={(suppliers ?? []).map((s) => ({ id: s.id, label: s.Supplier_Name }))}
        packagings={(packagings ?? []).map((p) => ({ id: p.id, label: p.packaging_name }))}
        accBooks={(accBooks ?? []).map((b) => ({ id: b.id, label: b.Book_Name }))}
        projects={(projects ?? []).map((p) => ({ id: p.id, label: p.project_name }))}
        bounds={(bounds ?? []).map((b) => ({ id: b.id, label: b.bound_name }))}
        shades={(shades ?? []).map((s) => ({ id: s.id, label: s.Shade_name }))}
      />
    </AppShell>
  );
}
