import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { InvoicingWorkspace } from "@/components/invoicing-workspace";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("invoicing");
  return (
    <AppShell
      title="Invoicing"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <InvoicingWorkspace />
    </AppShell>
  );
}
