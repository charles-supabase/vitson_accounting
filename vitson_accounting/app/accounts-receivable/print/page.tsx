import { requireModule } from "@/lib/auth";
import { PrintToolbar } from "@/components/print-toolbar";
import { getArReport } from "@/actions/accounts-receivable";
import { money } from "@/lib/report-format";

export const dynamic = "force-dynamic";

const th = "border border-black px-2 py-1 text-left font-semibold";
const thR = "border border-black px-2 py-1 text-right font-semibold";
const td = "border border-black px-2 py-1";
const tdR = "border border-black px-2 py-1 text-right font-mono";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModule("accounts_receivable" as Parameters<typeof requireModule>[0]);
  const sp = await searchParams;
  const ym = typeof sp.ym === "string" ? sp.ym : "";
  const res = await getArReport(ym);

  return (
    <div className="min-h-screen bg-white p-6 text-black">
      <PrintToolbar autoPrint={!!res.data} />
      <div className="mb-3">
        <div className="text-base font-bold">VITSON INTERNATIONAL, INCORPORATED</div>
        <div className="text-sm font-semibold">Accounts Receivable{res.data ? ` · ${res.data.label}` : ""}</div>
      </div>
      {res.error && <p className="text-red-700">{res.error}</p>}
      {res.data && (
        <table className="w-full max-w-4xl border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>Customer</th>
              <th className={thR}>Sales Amount</th>
              <th className={thR}>Total Deductions</th>
              <th className={thR}>EWT</th>
              <th className={thR}>Total Collected</th>
            </tr>
          </thead>
          {res.data.groups
            .filter((g) => g.rows.length > 0)
            .map((g) => (
              <tbody key={g.receivableId ?? "none"} style={{ breakInside: "avoid" }}>
                <tr>
                  <td className="border border-black bg-gray-100 px-2 py-1 font-bold" colSpan={5}>
                    {g.typeName.toUpperCase()}
                  </td>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>{r.customerName}</td>
                    <td className={tdR}>{money(r.salesAmount)}</td>
                    <td className={tdR}>{money(r.totalDeductions)}</td>
                    <td className={tdR}>{money(r.ewt)}</td>
                    <td className={tdR}>{money(r.totalCollected)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className={td}>Total {g.typeName}</td>
                  <td className={tdR}>{money(g.totalSales)}</td>
                  <td className={tdR}>{money(g.totalDeductions)}</td>
                  <td className={tdR}>{money(g.totalEwt)}</td>
                  <td className={tdR}>{money(g.totalCollected)}</td>
                </tr>
              </tbody>
            ))}
          <tfoot>
            <tr className="font-bold">
              <td className={td}>GRAND TOTAL</td>
              <td className={tdR}>{money(res.data.grand.totalSales)}</td>
              <td className={tdR}>{money(res.data.grand.totalDeductions)}</td>
              <td className={tdR}>{money(res.data.grand.totalEwt)}</td>
              <td className={tdR}>{money(res.data.grand.totalCollected)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
