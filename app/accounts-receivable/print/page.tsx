import { requireModule } from "@/lib/auth";
import { PrintToolbar } from "@/components/print-toolbar";
import { getArReport } from "@/actions/accounts-receivable";
import { money } from "@/lib/report-format";

export const dynamic = "force-dynamic";

const th = "border border-black px-2 py-1 text-left font-semibold";
const thR = "border border-black px-2 py-1 text-right font-semibold";
const td = "border border-black px-2 py-1";
const tdR = "border border-black px-2 py-1 text-right font-mono";

/** Prints one tab of the Accounts Receivable page: /accounts-receivable/print?ym=2026-10&rt=1 (rt = receivable type id) */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModule("accounts_receivable");
  const sp = await searchParams;
  const ym = typeof sp.ym === "string" ? sp.ym : "";
  const rt = typeof sp.rt === "string" ? Number(sp.rt) : 0;
  const res = await getArReport(ym, rt);
  const d = res.data;

  return (
    <div className="min-h-screen bg-white p-6 text-black">
      <PrintToolbar autoPrint={!!d} />
      <div className="mb-3">
        <div className="text-base font-bold">VITSON INTERNATIONAL, INCORPORATED</div>
        <div className="text-sm font-semibold">
          Accounts Receivable{d ? ` · ${d.typeName.toUpperCase()} · ${d.label}` : ""}
        </div>
      </div>
      {res.error && <p className="text-red-700">{res.error}</p>}
      {d && (
        <table className="w-full max-w-4xl border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>Customer</th>
              <th className={thR}>Sales Amount</th>
              <th className={thR}>Total Deductions</th>
              <th className={thR}>EWT</th>
              <th className={thR}>Total Collected</th>
              <th className={thR}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {d.rows.length === 0 && (
              <tr><td className={td + " text-center"} colSpan={6}>No {d.typeName} sales for this month.</td></tr>
            )}
            {d.rows.map((r) => (
              <tr key={r.id}>
                <td className={td}>{r.customerName}</td>
                <td className={tdR}>{money(r.salesAmount)}</td>
                <td className={tdR}>{money(r.totalDeductions)}</td>
                <td className={tdR}>{money(r.ewt)}</td>
                <td className={tdR}>{money(r.totalCollected)}</td>
                <td className={tdR}>{money(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className={td}>TOTAL {d.typeName.toUpperCase()}</td>
              <td className={tdR}>{money(d.totals.totalSales)}</td>
              <td className={tdR}>{money(d.totals.totalDeductions)}</td>
              <td className={tdR}>{money(d.totals.totalEwt)}</td>
              <td className={tdR}>{money(d.totals.totalCollected)}</td>
              <td className={tdR}>{money(d.totals.totalBalance)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      {d && d.sharedCustomers.length > 0 && (
        <p className="mt-3 max-w-4xl text-[11px]">
          Note: collections are recorded per customer and month, not per type. {d.sharedCustomers.join(", ")} also
          {d.sharedCustomers.length === 1 ? " has" : " have"} a sales entry of the other type this month, so the same
          collections appear in both reports.
        </p>
      )}
    </div>
  );
}
