import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { InventoryBack } from "@/components/inventory-back";
import { InventoryWithdrawalEntry } from "@/components/inventory-withdrawal-entry";
import { getItemFilterData } from "@/actions/inventory";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("inventory");
  const data = await getItemFilterData();
  return (
    <AppShell
      title="Inventory · Daily Usage"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <InventoryBack />
      <InventoryWithdrawalEntry kind="daily" data={data} />
    </AppShell>
  );
}
