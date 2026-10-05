import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { InventoryBack } from "@/components/inventory-back";
import { RecipeWorkspace } from "@/components/recipe-workspace";
import { getRecipeUsage } from "@/actions/inventory";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("inventory");
  const rows = await getRecipeUsage();
  return (
    <AppShell
      title="Inventory · Recipe Usage"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <InventoryBack />
      <RecipeWorkspace rows={rows} />
    </AppShell>
  );
}
