import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { AliasesWorkspace } from "@/components/aliases-workspace";
import { getAliasLookups, listAliases } from "@/actions/aliases";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("aliases");
  const [lookups, list] = await Promise.all([getAliasLookups(), listAliases()]);
  return (
    <AppShell
      title="Aliases"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <AliasesWorkspace customers={lookups.customers} initialAliases={list.aliases} initialError={list.error ?? null} />
    </AppShell>
  );
}
