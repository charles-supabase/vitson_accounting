import type { ApRow } from "@/actions/accounts-payable";
import { fmtMoney, groupBy, monthLabel } from "@/lib/inventory-format";

const sum = (rows: ApRow[]) => rows.reduce((a, r) => a + r.amount, 0);
const monthText = (due: string) => monthLabel(Number(due.slice(0, 4)), Number(due.slice(5, 7)));

/**
 * The accounts payable summary. Which layout depends on the filter:
 *  - a supplier is chosen: that supplier with its months and a subtotal;
 *  - a year only: each month as a header with its suppliers and subtotals underneath;
 *  - a year and a month, no supplier: one amount per supplier and a grand total;
 *  - no year at all: each supplier with its months.
 */
export function ApReport({
  rows,
  supplierId,
  year,
  month,
}: {
  rows: ApRow[];
  supplierId: number | null;
  year: number | null;
  month: number | null;
}) {
  const total = sum(rows);

  if (rows.length === 0) return <p className="text-sm text-ink-soft">Nothing is owed for this selection.</p>;

  // year and month, no supplier: header supplier, amount due, grand total
  if (supplierId == null && year != null && month != null) {
    return (
      <div className="max-w-xl rounded border border-line bg-paper-raised">
        <div className="flex justify-between border-b border-line bg-paper px-4 py-2 text-[11px] uppercase tracking-wide text-ink-faint">
          <span>Supplier</span>
          <span>Amount due</span>
        </div>
        {rows.map((r) => (
          <div key={r.supplier_id} className="flex justify-between border-b border-line px-4 py-2 text-sm last:border-0">
            <span className="text-ink">{r.supplier_name}</span>
            <span className="font-mono text-ink">{fmtMoney(r.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-line bg-paper px-4 py-2 text-sm font-medium">
          <span className="text-ink">Grand total</span>
          <span className="font-mono text-ink">{fmtMoney(total)}</span>
        </div>
      </div>
    );
  }

  // year only, no supplier: month headers, suppliers and subtotals underneath
  if (supplierId == null && year != null && month == null) {
    const byMonth = groupBy(rows, (r) => r.due_month);
    return (
      <div className="max-w-xl space-y-4">
        {Array.from(byMonth.entries()).map(([dueMonth, mRows]) => (
          <section key={dueMonth} className="rounded border border-line bg-paper-raised">
            <div className="flex items-baseline justify-between border-b border-line bg-paper px-4 py-2">
              <h3 className="font-display text-base font-semibold text-ink">{monthText(dueMonth)}</h3>
              <span className="font-mono text-sm text-ink">{fmtMoney(sum(mRows))}</span>
            </div>
            {mRows.map((r) => (
              <div key={r.supplier_id} className="flex justify-between border-b border-line px-4 py-1.5 pl-8 text-sm last:border-0">
                <span className="text-ink">{r.supplier_name}</span>
                <span className="font-mono text-ink">{fmtMoney(r.amount)}</span>
              </div>
            ))}
          </section>
        ))}
        <p className="text-right text-sm text-ink">
          Grand total <span className="ml-3 font-mono font-semibold">{fmtMoney(total)}</span>
        </p>
      </div>
    );
  }

  // supplier chosen, or no year filter: each supplier with its months
  return (
    <div className="max-w-xl space-y-4">
      {Array.from(groupBy(rows, (r) => r.supplier_id).entries()).map(([sid, sRows]) => (
        <section key={sid} className="rounded border border-line bg-paper-raised">
          <div className="flex items-baseline justify-between border-b border-line bg-paper px-4 py-2">
            <h3 className="font-display text-base font-semibold text-ink">{sRows[0].supplier_name}</h3>
            <span className="font-mono text-sm text-ink">{fmtMoney(sum(sRows))}</span>
          </div>
          {sRows.map((r) => (
            <div key={r.due_month} className="flex justify-between border-b border-line px-4 py-1.5 pl-8 text-sm last:border-0">
              <span className="text-ink-soft">{monthText(r.due_month)}</span>
              <span className="font-mono text-ink">{fmtMoney(r.amount)}</span>
            </div>
          ))}
        </section>
      ))}
      {supplierId == null && (
        <p className="text-right text-sm text-ink">
          Grand total <span className="ml-3 font-mono font-semibold">{fmtMoney(total)}</span>
        </p>
      )}
    </div>
  );
}
