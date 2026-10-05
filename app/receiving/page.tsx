import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { ReceivingWorkspace } from "@/components/receiving-workspace";
import { getSuppliersWithOpenLines } from "@/actions/receiving";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("receiving");
  const suppliers = await getSuppliersWithOpenLines();

  return (
    <AppShell title="Receiving" session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}>
      <ReceivingWorkspace suppliers={suppliers} />
    </AppShell>
  );
}
