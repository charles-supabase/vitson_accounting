import { requireModule } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AppShell } from "@/components/app-shell";
import { PoWorkspace } from "@/components/po-workspace";
import { getApprovedRequisitionsForPO, getFollowUpLines, getPurchaseOrderList } from "@/actions/purchase-orders";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderPage() {
  const session = await requireModule("purchase_order");

  const [list, approved, followUp, { data: accBooks }, { data: accCategories }, { data: bounds }, { data: accSortings }] = await Promise.all([
    getPurchaseOrderList(),
    getApprovedRequisitionsForPO(),
    getFollowUpLines(),
    supabaseAdmin.from("tbl_Acc_Book").select("id, Book_Name").order("Book_Name"),
    supabaseAdmin.from("tbl_Acc_Category").select("id, Acc_Category_Name").order("Acc_Category_Name"),
    supabaseAdmin.from("tbl_Item_Bound").select("id, bound_name").order("bound_name"),
    supabaseAdmin.from("tbl_Acc_Sorting").select("id, Sort_name").order("Sort_name"),
  ]);

  return (
    <AppShell
      title="Purchase Order"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <PoWorkspace
        initialList={list}
        followUp={followUp}
        approvedRequisitions={approved}
        accBooks={(accBooks ?? []).map((b: any) => ({ id: b.id, label: b.Book_Name }))}
        accCategories={(accCategories ?? []).map((c: any) => ({ id: c.id, label: c.Acc_Category_Name }))}
        accSortings={(accSortings ?? []).map((a: any) => ({ id: a.id, label: a.Sort_name }))}
        bounds={(bounds ?? []).map((b: any) => ({ id: b.id, label: b.bound_name }))}
      />
    </AppShell>
  );
}
