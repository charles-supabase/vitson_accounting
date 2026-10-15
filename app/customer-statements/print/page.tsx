import { requireModule } from "@/lib/auth";
import { PrintToolbar } from "@/components/print-toolbar";
import { getStatementReport } from "@/actions/customer-statements";
import { buildStatementReport, type ReportGroup } from "@/lib/statement-report";
import { formatDate } from "@/lib/format";
import { money } from "@/lib/report-format";

export const dynamic = "force-dynamic";

const th = "border border-black px-1.5 py-1 text-left font-semibold";
const thR = "border border-black px-1.5 py-1 text-right font-semibold";
const td = "border border-black px-1.5 py-0.5";
const tdR = "border border-black px-1.5 py-0.5 text-right font-mono";
const int = (n: number) => String(n);

/**
 * Prints a customer statement: /customer-statements/print?ym=2026-09&customer=12&rt=1&report=detailed
 * (rt 1 = Big, 2 = Small; report = detailed | special). The prices are checked again on the server.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModule("customer_statements");
  const sp = await searchParams;
  const ym = typeof sp.ym === "string" ? sp.ym : "";
  const customerId = typeof sp.customer === "string" ? Number(sp.customer) : 0;
  const rt = typeof sp.rt === "string" ? Number(sp.rt) : 0;
  const special = sp.report === "special";

  const res = await getStatementReport(ym, customerId, rt);
  const rep = res.report;
  const data = rep ? buildStatementReport(rep.deliveries) : null;

  return (
    <div className="min-h-screen bg-white p-6 text-black">
      <style>{"@page { size: portrait; margin: 10mm; }"}</style>
      <PrintToolbar autoPrint={!!rep} />
      <div className="mb-3">
        {rep ? (
          <>
            <div className="font-bold" style={{ fontSize: "20pt" }}>
              Summary for {rep.periodLabel}
            </div>
            <div className="font-bold" style={{ fontSize: "18pt" }}>
              {rep.customerName}
            </div>
          </>
        ) : (
          <div className="text-sm font-semibold">Customer statement</div>
        )}
      </div>
      {res.error && <p className="max-w-xl text-red-700">{res.error}</p>}

      {data && !special && (
        <div className="space-y-4" style={{ fontSize: "9pt" }}>
          {data.groups.map((g) => (
            <DetailedGroup key={g.key} g={g} />
          ))}
          <table className="w-full table-fixed border-collapse">
            <DetailedCols />
            <tfoot>
              <tr className="font-bold">
                <td className={td + " text-right"} colSpan={4}>
                  Grand Total
                </td>
                <td className={tdR}>{money(data.grand.wt)}</td>
                <td className={td}></td>
                <td className={tdR}>{money(data.grand.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {data && special && (
        <div className="space-y-4" style={{ fontSize: "8pt" }}>
          {data.groups.map((g) => (
            <SpecialGroup key={g.key} g={g} />
          ))}
          <table className="w-full table-fixed border-collapse">
            <SpecialCols />
            <tfoot>
              <tr className="font-bold">
                <td className={td + " text-right"} colSpan={4}>
                  Grand Total
                </td>
                <td className={tdR}>{int(data.grand.bodyCount)}</td>
                <td className={tdR}>{money(data.grand.bodyWt)}</td>
                <td className={tdR}>{int(data.grand.x1Count)}</td>
                <td className={tdR}>{money(data.grand.x1Wt)}</td>
                <td className={tdR}>{int(data.grand.ccCount)}</td>
                <td className={tdR}>{money(data.grand.ccWt)}</td>
                <td className={tdR}>{money(data.grand.wt)}</td>
                <td className={td}></td>
                <td className={tdR}>{money(data.grand.amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/** "TC - SOD - DARK" on the left (fabric, dye process, tone), the unit price right-justified. */
function groupHeader(g: ReportGroup) {
  return (
    <div className="flex items-baseline justify-between gap-4 font-bold" style={{ fontSize: "16pt" }}>
      <span>{[g.fabricName, g.dyeName, g.toneName].map((x) => x || "—").join(" - ")}</span>
      <span className="font-mono">{money(g.unitPrice)}</span>
    </div>
  );
}

function DetailedCols() {
  return (
    <colgroup>
      <col style={{ width: "12%" }} />
      <col style={{ width: "11%" }} />
      <col style={{ width: "20%" }} />
      <col style={{ width: "22%" }} />
      <col style={{ width: "13%" }} />
      <col style={{ width: "10%" }} />
      <col style={{ width: "12%" }} />
    </colgroup>
  );
}

/** Report 1: one table per group (the group is kept together on the page). */
function DetailedGroup({ g }: { g: ReportGroup }) {
  return (
    <table className="w-full table-fixed border-collapse break-inside-avoid">
      <DetailedCols />
      <thead>
        <tr>
          <th className={th + " bg-gray-100"} colSpan={7}>
            {groupHeader(g)}
          </th>
        </tr>
        <tr>
          <th className={th}>Date</th>
          <th className={th}>DR No.</th>
          <th className={th}>Customer JO</th>
          <th className={th}>Color</th>
          <th className={thR}>Del. Wt.</th>
          <th className={thR}>Unit Price</th>
          <th className={thR}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {g.rows.map((d) => (
          <tr key={d.id}>
            <td className={td}>{formatDate(d.dateDelivery)}</td>
            <td className={td + " font-mono"}>{d.deliveryReceipt}</td>
            <td className={td + " font-mono"}>{d.cusJoNo}</td>
            <td className={td}>{d.color}</td>
            <td className={tdR}>{money(d.totalWt)}</td>
            <td className={td}></td>
            <td className={td}></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <td className={td + " text-right"} colSpan={4}>
            Total
          </td>
          <td className={tdR}>{money(g.totals.wt)}</td>
          <td className={tdR}>{money(g.unitPrice)}</td>
          <td className={tdR}>{money(g.amount)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function SpecialCols() {
  return (
    <colgroup>
      <col style={{ width: "8%" }} />
      <col style={{ width: "6%" }} />
      <col style={{ width: "11%" }} />
      <col style={{ width: "16%" }} />
      <col style={{ width: "4%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "4%" }} />
      <col style={{ width: "7%" }} />
      <col style={{ width: "4%" }} />
      <col style={{ width: "7%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "6%" }} />
      <col style={{ width: "11%" }} />
    </colgroup>
  );
}

/** Report 2: the delivered weight split in Body, 1x1 and C+C, each with its roll count. */
function SpecialGroup({ g }: { g: ReportGroup }) {
  return (
    <table className="w-full table-fixed border-collapse break-inside-avoid">
      <SpecialCols />
      <thead>
        <tr>
          <th className={th + " bg-gray-100"} colSpan={13}>
            {groupHeader(g)}
          </th>
        </tr>
        <tr>
          <th className={th} rowSpan={2}>Date</th>
          <th className={th} rowSpan={2}>DR No.</th>
          <th className={th} rowSpan={2}>Customer JO</th>
          <th className={th} rowSpan={2}>Color</th>
          <th className={th + " text-center"} colSpan={2}>Body</th>
          <th className={th + " text-center"} colSpan={2}>1x1</th>
          <th className={th + " text-center"} colSpan={2}>C+C</th>
          <th className={thR} rowSpan={2}>Total Wt.</th>
          <th className={thR} rowSpan={2}>Unit Price</th>
          <th className={thR} rowSpan={2}>Amount</th>
        </tr>
        <tr>
          <th className={thR}>Rolls</th>
          <th className={thR}>Weight</th>
          <th className={thR}>Rolls</th>
          <th className={thR}>Weight</th>
          <th className={thR}>Rolls</th>
          <th className={thR}>Weight</th>
        </tr>
      </thead>
      <tbody>
        {g.rows.map((d) => (
          <tr key={d.id}>
            <td className={td}>{formatDate(d.dateDelivery)}</td>
            <td className={td + " font-mono"}>{d.deliveryReceipt}</td>
            <td className={td + " font-mono"}>{d.cusJoNo}</td>
            <td className={td}>{d.color}</td>
            <td className={tdR}>{d.bodyCount > 0 ? int(d.bodyCount) : ""}</td>
            <td className={tdR}>{d.bodyCount > 0 || d.bodyWt > 0 ? money(d.bodyWt) : ""}</td>
            <td className={tdR}>{d.x1Count > 0 ? int(d.x1Count) : ""}</td>
            <td className={tdR}>{d.x1Count > 0 || d.x1Wt > 0 ? money(d.x1Wt) : ""}</td>
            <td className={tdR}>{d.ccCount > 0 ? int(d.ccCount) : ""}</td>
            <td className={tdR}>{d.ccCount > 0 || d.ccWt > 0 ? money(d.ccWt) : ""}</td>
            <td className={tdR}>{money(d.totalWt)}</td>
            <td className={td}></td>
            <td className={td}></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <td className={td + " text-right"} colSpan={4}>
            Total
          </td>
          <td className={tdR}>{int(g.totals.bodyCount)}</td>
          <td className={tdR}>{money(g.totals.bodyWt)}</td>
          <td className={tdR}>{int(g.totals.x1Count)}</td>
          <td className={tdR}>{money(g.totals.x1Wt)}</td>
          <td className={tdR}>{int(g.totals.ccCount)}</td>
          <td className={tdR}>{money(g.totals.ccWt)}</td>
          <td className={tdR}>{money(g.totals.wt)}</td>
          <td className={tdR}>{money(g.unitPrice)}</td>
          <td className={tdR}>{money(g.amount)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
