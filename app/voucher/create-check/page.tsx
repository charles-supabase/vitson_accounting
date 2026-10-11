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

  // which tab the user came from: ?type=1 (Original) or 2 (Duplicate); otherwise from the voucher number's suffix
  const voucherType: 1 | 2 = sp.type === "2" ? 2 : sp.type === "1" ? 1 : voucherNo?.endsWith("-B") ? 2 : 1;

  const [vouchers, lookups, allOptions] = await Promise.all([getOpenVouchers(voucherType), getCheckLookups(), getVoucherOptions()]);
  const voucherOptions = allOptions.filter((v) => v.typeId === voucherType);

  return (
    <AppShell
      title="Voucher · Create Check"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <CreateCheckWorkspace
        key={voucherType}
        voucherType={voucherType}
        initialVouchers={vouchers}
        payables={lookups.payables}
        banks={lookups.banks}
        voucherOptions={voucherOptions}
        initialVoucherNo={voucherNo}
      />
    </AppShell>
  );
}
