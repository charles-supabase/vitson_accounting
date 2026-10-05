import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { getVoucherDetail } from "@/actions/voucher";
import { getAssignedCheck } from "@/actions/voucher-check";
import { AutoPrint } from "@/components/auto-print";
import { amountInWords } from "@/lib/amount-words";
import { formatDate } from "@/lib/format";
import { fmtMoney } from "@/lib/inventory-format";

export const dynamic = "force-dynamic";

export default async function PrintCheckPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("voucher");
  const { id } = await params;
  const voucher = await getVoucherDetail({ id: Number(id) });
  if (!voucher) notFound();
  const check = await getAssignedCheck(voucher.id);
  if (!check) notFound();

  // the check is made out to the supplier unless a payee was picked
  const payee = check.payableName ?? voucher.supplierName;
  const amount = check.amount ?? voucher.net;

  return (
    <div className="mx-auto w-[820px] bg-white p-6 text-black">
      <AutoPrint />

      <div className="relative h-[330px] border border-neutral-400 print:border-0">
        <div className="absolute right-6 top-6 text-base">{formatDate(check.dtCheck)}</div>

        <div className="absolute left-6 top-24 text-lg font-medium">{payee.toUpperCase()}</div>
        <div className="absolute right-6 top-24 text-lg font-semibold">**{fmtMoney(amount)}**</div>

        <div className="absolute left-6 right-6 top-40 text-base">{amountInWords(amount)}</div>

        <div className="absolute bottom-4 left-6 text-xs text-neutral-500 print:hidden">
          Check {check.checkNo} · {check.bankName ?? ""} · Voucher {voucher.voucherNo}
        </div>
      </div>
    </div>
  );
}
