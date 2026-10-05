import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { BankWorkspace } from "@/components/bank-workspace";
import { getBanks } from "@/actions/bank";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await requireModule("bank");
  const banks = await getBanks();

  return (
    <AppShell title="Bank" session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}>
      <BankWorkspace banks={banks} />
    </AppShell>
  );
}
