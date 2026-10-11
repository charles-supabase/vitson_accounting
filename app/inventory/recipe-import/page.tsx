import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { RecipeImportPanel } from "@/components/recipe-import-panel";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("inventory");
  return (
    <AppShell
      title="Recipe Usage · Populate from Access"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <RecipeImportPanel />
    </AppShell>
  );
}
