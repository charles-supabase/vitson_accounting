import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { InventoryBack } from "@/components/inventory-back";
import { MonthPicker } from "@/components/month-picker";
import { getAnalysis } from "@/actions/inventory";
import { diff, fmtQty, groupBy, monthLabel, parseYm } from "@/lib/inventory-format";

export const dynamic = "force-dynamic";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireModule("inventory");
  const { ym, year, month } = parseYm((await searchParams).ym);
  const rows = await getAnalysis(year, month);

  const tot = rows.reduce(
    (a, r) => ({ actual: a.actual + r.actual, daily: a.daily + r.daily, recipe: a.recipe + r.recipe }),
    { actual: 0, daily: 0, recipe: 0 }
  );

  const cards = [
    ["Actual withdrawn", fmtQty(tot.actual)],
    ["Daily withdrawn", fmtQty(tot.daily)],
    ["Daily discrepancy", fmtQty(diff(tot.actual, tot.daily))],
    ["Recipe withdrawn", fmtQty(tot.recipe)],
    ["Recipe discrepancy", fmtQty(diff(tot.actual, tot.recipe))],
  ];

  return (
    <AppShell
      title="Inventory · Analysis"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <InventoryBack />
      <div className="panel panel-navy mb-4">
        <MonthPicker value={ym} />
      </div>

      <div className="panel panel-teal">
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">{monthLabel(year, month)}</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No withdrawals were recorded in this month.</p>
      ) : (
        <>
          <div className="mb-5 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-5">
            {cards.map(([label, value]) => (
              <div key={label} className="rounded border border-line bg-paper-raised px-3 py-2">
                <div className="ledger-label">{label}</div>
                <div className="font-mono text-base text-ink">{value}</div>
              </div>
            ))}
          </div>

          <div className="max-w-4xl overflow-x-auto rounded border border-line bg-paper-raised">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left ledger-label">
                  <th className="px-4 py-2 font-normal">Item</th>
                  <th className="px-4 py-2 text-right font-normal">Actual withdrawn</th>
                  <th className="px-4 py-2 text-right font-normal">Daily withdrawn</th>
                  <th className="px-4 py-2 text-right font-normal">Daily discrepancy</th>
                  <th className="px-4 py-2 text-right font-normal">Recipe withdrawn</th>
                  <th className="px-4 py-2 text-right font-normal">Recipe discrepancy</th>
                </tr>
              </thead>
              {Array.from(groupBy(rows, (r) => r.sorting_name).entries()).map(([sorting, sRows]) => (
                <tbody key={sorting}>
                  <tr className="border-b border-line bg-paper">
                    <td colSpan={6} className="px-4 py-1.5 font-display text-sm font-semibold text-ink">
                      {sorting}
                    </td>
                  </tr>
                  {Array.from(groupBy(sRows, (r) => r.bound_name).entries()).map(([bound, bRows]) => [
                    <tr key={`${sorting}|${bound}`} className="border-b border-line">
                      <td colSpan={6} className="px-4 py-1 pl-8 text-sm text-ink-soft">
                        {bound}
                      </td>
                    </tr>,
                    ...bRows.map((r) => (
                      <tr key={r.item_id} className="border-b border-line last:border-0">
                        <td className="px-4 py-1.5 pl-12 text-ink">{r.item_name}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-ink">{fmtQty(r.actual)}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-ink-soft">{fmtQty(r.daily)}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-ink">{fmtQty(diff(r.actual, r.daily))}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-ink-soft">{fmtQty(r.recipe)}</td>
                        <td className="px-4 py-1.5 text-right font-mono text-ink">{fmtQty(diff(r.actual, r.recipe))}</td>
                      </tr>
                    )),
                  ])}
                </tbody>
              ))}
            </table>
          </div>
        </>
      )}
      </div>
    </AppShell>
  );
}
