import { requireModule } from "@/lib/auth";
import { PrintToolbar } from "@/components/print-toolbar";
import { getVoucherReportData, type VoucherReportData, type VoucherReportRow } from "@/actions/voucher-reports";
import { formatDate } from "@/lib/format";
import { compareVoucherNo, money, moneyOrBlank, round2 } from "@/lib/report-format";

export const dynamic = "force-dynamic";

const sum = (rows: VoucherReportRow[], f: (r: VoucherReportRow) => number) => round2(rows.reduce((s, r) => s + f(r), 0));
const th = "border border-black px-1.5 py-1 text-left font-semibold";
const thR = "border border-black px-1.5 py-1 text-right font-semibold";
const td = "border border-black px-1.5 py-0.5";
const tdR = "border border-black px-1.5 py-0.5 text-right font-mono";

function sortingLabel(r: { sortBook: string; sortName: string }) {
  return [r.sortBook, r.sortName].filter(Boolean).join(" · ");
}

/** 1. Voucher Summary: one line per voucher, one column per bank used. */
function VoucherSummary({ d }: { d: VoucherReportData }) {
  const { rows, banks } = d;
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr>
          <th className={th}>Voucher No</th>
          <th className={th}>Date</th>
          <th className={th}>Supplier</th>
          <th className={th}>Remarks</th>
          <th className={thR}>Total Deductions</th>
          <th className={thR}>EWT</th>
          <th className={thR}>Amount</th>
          <th className={th}>Acc Sorting</th>
          {banks.map((b) => (
            <th key={b.id} className={thR}>{b.name}</th>
          ))}
          <th className={th}>Check No</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td className={td + " text-center"} colSpan={9 + banks.length}>No vouchers in this month.</td></tr>
        )}
        {rows.map((r) => (
          <tr key={r.id}>
            <td className={td + " whitespace-nowrap font-mono"}>{r.voucherNo}</td>
            <td className={td + " whitespace-nowrap"}>{formatDate(r.voucherDate)}</td>
            <td className={td}>{r.supplier}</td>
            <td className={td}>{r.remarks}</td>
            <td className={tdR}>{money(r.totalDeductions)}</td>
            <td className={tdR}>{money(r.ewt)}</td>
            <td className={tdR}>{money(r.amount)}</td>
            <td className={td + " whitespace-nowrap font-mono"}>{r.sortBook}</td>
            {banks.map((b) => (
              <td key={b.id} className={tdR}>{moneyOrBlank(r.bankAmounts[b.id])}</td>
            ))}
            <td className={td + " whitespace-nowrap font-mono"}>{r.checkNos.join(", ")}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-bold">
          <td className={td} colSpan={4}>TOTAL ({rows.length} vouchers)</td>
          <td className={tdR}>{money(sum(rows, (r) => r.totalDeductions))}</td>
          <td className={tdR}>{money(sum(rows, (r) => r.ewt))}</td>
          <td className={tdR}>{money(sum(rows, (r) => r.amount))}</td>
          <td className={td}></td>
          {banks.map((b) => (
            <td key={b.id} className={tdR}>{money(sum(rows, (r) => r.bankAmounts[b.id] ?? 0))}</td>
          ))}
          <td className={td}></td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Groups the rows by sorting id, ordered by sort book number. */
function groupBySorting(rows: VoucherReportRow[]) {
  const map = new Map<number, VoucherReportRow[]>();
  for (const r of rows) map.set(r.sortingId, [...(map.get(r.sortingId) ?? []), r]);
  return Array.from(map.entries())
    .map(([sortingId, rs]) => ({ sortingId, rows: rs, sortBook: rs[0].sortBook, sortName: rs[0].sortName }))
    .sort((a, b) => compareVoucherNo(a.sortBook || String(a.sortingId), b.sortBook || String(b.sortingId)));
}

/** 2. Book Summary: one line per sort book, banks used at the bottom. */
function BookSummary({ d }: { d: VoucherReportData }) {
  const groups = groupBySorting(d.rows);
  return (
    <>
      <table className="w-full max-w-3xl border-collapse text-xs">
        <thead>
          <tr>
            <th className={th}>Sort Book</th>
            <th className={thR}>Total Deductions</th>
            <th className={thR}>EWT</th>
            <th className={thR}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && (
            <tr><td className={td + " text-center"} colSpan={4}>No vouchers in this month.</td></tr>
          )}
          {groups.map((g) => (
            <tr key={g.sortingId}>
              <td className={td}>{sortingLabel(g)}</td>
              <td className={tdR}>{money(sum(g.rows, (r) => r.totalDeductions))}</td>
              <td className={tdR}>{money(sum(g.rows, (r) => r.ewt))}</td>
              <td className={tdR}>{money(sum(g.rows, (r) => r.amount))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className={td}>TOTAL</td>
            <td className={tdR}>{money(sum(d.rows, (r) => r.totalDeductions))}</td>
            <td className={tdR}>{money(sum(d.rows, (r) => r.ewt))}</td>
            <td className={tdR}>{money(sum(d.rows, (r) => r.amount))}</td>
          </tr>
        </tfoot>
      </table>

      <h2 className="mb-1 mt-6 text-sm font-bold">Checks issued by bank</h2>
      <table className="w-full max-w-md border-collapse text-xs">
        <thead>
          <tr>
            <th className={th}>Bank</th>
            <th className={thR}>Amount issued</th>
          </tr>
        </thead>
        <tbody>
          {d.banks.length === 0 && (
            <tr><td className={td + " text-center"} colSpan={2}>No checks assigned to these vouchers.</td></tr>
          )}
          {d.banks.map((b) => (
            <tr key={b.id}>
              <td className={td}>{b.name}</td>
              <td className={tdR}>{money(sum(d.rows, (r) => r.bankAmounts[b.id] ?? 0))}</td>
            </tr>
          ))}
        </tbody>
        {d.banks.length > 0 && (
          <tfoot>
            <tr className="font-bold">
              <td className={td}>TOTAL</td>
              <td className={tdR}>
                {money(round2(d.banks.reduce((s, b) => s + sum(d.rows, (r) => r.bankAmounts[b.id] ?? 0), 0)))}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </>
  );
}

/** 3. Book Details: vouchers grouped under each sorting id, with group totals. */
function BookDetails({ d }: { d: VoucherReportData }) {
  const groups = groupBySorting(d.rows);
  return (
    <div className="max-w-4xl text-xs">
      <div className="mb-3 flex items-baseline justify-between border-2 border-black bg-gray-200 px-3 py-2 text-base font-bold">
        <span>ALL SORTING IDs</span>
        <span className="font-mono">Total amount: {money(sum(d.rows, (r) => r.amount))}</span>
      </div>
      {groups.length === 0 && <p>No vouchers in this month.</p>}
      {groups.map((g) => (
        <table key={g.sortingId} className="mb-5 w-full border-collapse" style={{ breakInside: "avoid" }}>
          <thead>
            <tr>
              <th className="border border-black bg-gray-100 px-2 py-1.5 text-left text-sm" colSpan={3}>
                Sorting ID: {sortingLabel(g)}
              </th>
              <th className="border border-black bg-gray-100 px-2 py-1.5 text-right font-mono text-sm" colSpan={2}>
                Amount: {money(sum(g.rows, (r) => r.amount))}
              </th>
            </tr>
            <tr>
              <th className={th}>Voucher Number</th>
              <th className={th}>Supplier</th>
              <th className={thR}>Total Deductions</th>
              <th className={thR}>EWT</th>
              <th className={thR}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r) => (
              <tr key={r.id}>
                <td className={td + " font-mono"}>{r.voucherNo}</td>
                <td className={td}>{r.supplier}</td>
                <td className={tdR}>{money(r.totalDeductions)}</td>
                <td className={tdR}>{money(r.ewt)}</td>
                <td className={tdR}>{money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td className={td} colSpan={2}>Total {sortingLabel(g)}</td>
              <td className={tdR}>{money(sum(g.rows, (r) => r.totalDeductions))}</td>
              <td className={tdR}>{money(sum(g.rows, (r) => r.ewt))}</td>
              <td className={tdR}>{money(sum(g.rows, (r) => r.amount))}</td>
            </tr>
          </tfoot>
        </table>
      ))}
    </div>
  );
}

const TITLES: Record<string, string> = {
  summary: "Voucher Summary",
  book: "Book Summary",
  details: "Book Details",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModule("voucher");
  const sp = await searchParams;
  const type = typeof sp.type === "string" && TITLES[sp.type] ? sp.type : "summary";
  const ym = typeof sp.ym === "string" ? sp.ym : "";
  const res = await getVoucherReportData(ym);

  return (
    <div className="min-h-screen bg-white p-6 text-black">
      <style>{"@page { size: landscape; margin: 10mm; }"}</style>
      <PrintToolbar autoPrint={!!res.data} />
      <div className="mb-3">
        <div className="text-base font-bold">VITSON INTERNATIONAL, INCORPORATED</div>
        <div className="text-sm font-semibold">
          {TITLES[type]}
          {res.data ? ` · ${res.data.label}` : ""}
        </div>
      </div>
      {res.error && <p className="text-red-700">{res.error}</p>}
      {res.data && type === "summary" && <VoucherSummary d={res.data} />}
      {res.data && type === "book" && <BookSummary d={res.data} />}
      {res.data && type === "details" && <BookDetails d={res.data} />}
    </div>
  );
}
