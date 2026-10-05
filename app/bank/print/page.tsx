import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBankLedger, type BankFilter } from "@/actions/bank";
import { AutoPrint } from "@/components/auto-print";
import { formatDate } from "@/lib/format";
import { fmtMoney, monthLabel } from "@/lib/inventory-format";

export const dynamic = "force-dynamic";

export default async function BankPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModule("bank");
  const sp = await searchParams;
  const bankId = typeof sp.bank === "string" ? Number(sp.bank) : NaN;
  if (!Number.isInteger(bankId)) notFound();

  const { data: bank } = await supabaseAdmin.from("tbl_Bank").select("bank_name").eq("id", bankId).maybeSingle();
  if (!bank) notFound();

  const year = typeof sp.year === "string" ? Number(sp.year) : NaN;
  const month = typeof sp.month === "string" ? Number(sp.month) : NaN;
  const filter: BankFilter | null = Number.isInteger(year) ? { year, month: Number.isInteger(month) ? month : null } : null;

  const ledger = await getBankLedger(bankId, filter);
  // unused checks and DMs (no date, no amounts) are not printed
  const printRows = ledger.rows.filter((r) => r.dtCheck != null || r.deposit != null || r.withdrawal != null);
  const totalDeposit = (ledger.balanceForward ?? 0) + printRows.reduce((a, r) => a + (r.deposit ?? 0), 0);
  const totalWithdrawal = printRows.reduce((a, r) => a + (r.withdrawal ?? 0), 0);

  let running = ledger.balanceForward ?? 0;
  const withBalance = printRows.map((r) => {
    running += (r.deposit ?? 0) - (r.withdrawal ?? 0);
    return { ...r, balance: running };
  });
  const bf = ledger.balanceForward;
  const period = filter ? (filter.month != null ? monthLabel(filter.year, filter.month) : `Year ${filter.year}`) : "All transactions";

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-sm text-black">
      <AutoPrint />
      <header className="mb-4 border-b border-black pb-2">
        <h1 className="text-xl font-semibold">{(bank as any).bank_name}</h1>
        <div className="text-neutral-700">
          {period}
        </div>
      </header>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1 pr-2 font-medium">Check No</th>
            <th className="py-1 pr-2 font-medium">Date</th>
            <th className="py-1 pr-2 font-medium">Payee</th>
            <th className="py-1 pr-2 text-right font-medium">Deposit</th>
            <th className="py-1 pr-2 text-right font-medium">Withdrawn</th>
            <th className="py-1 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody>
          {bf != null && (
            <tr className="border-b border-neutral-300 font-medium">
              <td colSpan={3} className="py-1 pr-2">
                BALANCE FORWARD
              </td>
              <td className="py-1 pr-2 text-right">{fmtMoney(bf)}</td>
              <td />
              <td className="py-1 text-right">{fmtMoney(bf)}</td>
            </tr>
          )}
          {withBalance.map((r) => (
            <tr key={r.id} className="border-b border-neutral-300">
              <td className="py-1 pr-2 font-mono">{r.checkNo}</td>
              <td className="py-1 pr-2">{formatDate(r.dtCheck)}</td>
              <td className="py-1 pr-2">{r.payee ?? ""}</td>
              <td className="py-1 pr-2 text-right">{r.deposit != null ? fmtMoney(r.deposit) : ""}</td>
              <td className="py-1 pr-2 text-right">{r.withdrawal != null ? fmtMoney(r.withdrawal) : ""}</td>
              <td className="py-1 text-right">{fmtMoney(r.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-black font-medium">
            <td colSpan={3} className="pt-2">
              Total{bf != null ? " (including balance forward)" : ""}
            </td>
            <td className="pt-2 pr-2 text-right">{fmtMoney(totalDeposit)}</td>
            <td className="pt-2 pr-2 text-right">{fmtMoney(totalWithdrawal)}</td>
            <td />
          </tr>
          <tr className="font-semibold">
            <td colSpan={3} className="pt-1">
              Balance (deposits - withdrawals)
            </td>
            <td colSpan={3} className="pt-1 text-right">
              {fmtMoney(totalDeposit - totalWithdrawal)}
            </td>
          </tr>
        </tfoot>
      </table>
      {ledger.truncated && <p className="mt-2 text-xs text-neutral-600">Only the first 2,000 rows are shown.</p>}
    </div>
  );
}
