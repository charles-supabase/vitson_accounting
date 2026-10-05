import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { VoucherWorkspace } from "@/components/voucher-workspace";
import { getVoucherLookups } from "@/actions/voucher";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("voucher");
  const lookups = await getVoucherLookups();

  return (
    <AppShell title="Voucher" session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}>
      <VoucherWorkspace lookups={lookups} />
    </AppShell>
  );
}
