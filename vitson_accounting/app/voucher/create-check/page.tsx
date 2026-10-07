import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { CreateCheckWorkspace } from "@/components/create-check-workspace";
import { getCheckLookups, getOpenVouchers } from "@/actions/voucher-check";
import { getVoucherOptions } from "@/actions/voucher";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireModule("voucher");
  const sp = await searchParams;
  const voucherNo = typeof sp.voucher === "string" && /^\d+-[AB]$/.test(sp.voucher) ? sp.voucher : null;

  const [vouchers, lookups, voucherOptions] = await Promise.all([getOpenVouchers(), getCheckLookups(), getVoucherOptions()]);

  return (
    <AppShell
      title="Voucher · Create Check"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <CreateCheckWorkspace
        initialVouchers={vouchers}
        payables={lookups.payables}
        banks={lookups.banks}
        voucherOptions={voucherOptions}
        initialVoucherNo={voucherNo}
      />
    </AppShell>
  );
}
