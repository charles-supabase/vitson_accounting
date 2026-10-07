import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { DeliveriesWorkspace } from "@/components/deliveries-workspace";
import { getDeliveryLookups } from "@/actions/deliveries";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("deliveries");
  const lookups = await getDeliveryLookups();
  return (
    <AppShell
      title="Deliveries"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <DeliveriesWorkspace types={lookups.types} />
    </AppShell>
  );
}
