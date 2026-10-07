import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { ArWorkspace } from "@/components/ar-workspace";
import { getArLookups } from "@/actions/accounts-receivable";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("accounts_receivable");
  const lookups = await getArLookups();
  return (
    <AppShell
      title="Accounts Receivable"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <ArWorkspace customers={lookups.customers} types={lookups.types} />
    </AppShell>
  );
}
