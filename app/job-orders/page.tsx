import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { JobOrdersWorkspace } from "@/components/job-orders-workspace";
import { getJobOrderCount } from "@/actions/job-orders";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("job_orders");
  const count = await getJobOrderCount();
  return (
    <AppShell
      title="Job Orders"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <JobOrdersWorkspace initialCount={count} />
    </AppShell>
  );
}
