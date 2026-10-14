import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { CustomerStatementsWorkspace } from "@/components/customer-statements-workspace";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("customer_statements");
  return (
    <AppShell
      title="Customer Statements"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <CustomerStatementsWorkspace />
    </AppShell>
  );
}
