import { requireModule } from "@/lib/auth";
import { PrintToolbar } from "@/components/print-toolbar";
import { getBankMonthlySummary } from "@/actions/bank-reports";
import { formatDate } from "@/lib/format";
import { money, round2 } from "@/lib/report-format";

export const dynamic = "force-dynamic";

const th = "border border-black px-2 py-1 text-left font-semibold";
const thR = "border border-black px-2 py-1 text-right font-semibold";
const td = "border border-black px-2 py-1";
const tdR = "border border-black px-2 py-1 text-right font-mono";

/** Summary of all banks for a month or a whole year: print route. Use /bank/summary?ym=2026-10 or ?ym=2026 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModule("bank");
  const sp = await searchParams;
  const ym = typeof sp.ym === "string" ? sp.ym : "";
  const res = await getBankMonthlySummary(ym);
  const rows = res.data?.rows ?? [];
  const total = (f: (r: (typeof rows)[number]) => number) => round2(rows.reduce((s, r) => s + f(r), 0));

  return (
    <div className="min-h-screen bg-white p-6 text-black">
      <PrintToolbar autoPrint={!!res.data} />
      <div className="mb-3">
        <div className="text-base font-bold">VITSON INTERNATIONAL, INCORPORATED</div>
        <div className="text-sm font-semibold">
          Bank Summary{res.data ? ` · ${res.data.label}` : ""}
        </div>
        {res.data && (
          <div className="text-xs">Balances are as of {formatDate(res.data.asOf)} (end of the period).</div>
        )}
      </div>
      {res.error && <p className="text-red-700">{res.error}</p>}
      {res.data && (
        <table className="w-full max-w-3xl border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>Bank</th>
              <th className={thR}>Current Deposit</th>
              <th className={thR}>Current Withdrawals</th>
              <th className={thR}>Current Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.bankId}>
                <td className={td}>{r.bankName}</td>
                <td className={tdR}>{money(r.deposit)}</td>
                <td className={tdR}>{money(r.withdrawal)}</td>
                <td className={tdR}>{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className={td}>TOTAL</td>
              <td className={tdR}>{money(total((r) => r.deposit))}</td>
              <td className={tdR}>{money(total((r) => r.withdrawal))}</td>
              <td className={tdR}>{money(total((r) => r.balance))}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
