import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { InventoryBack } from "@/components/inventory-back";
import { MonthPicker } from "@/components/month-picker";
import { getMonthlyInventory } from "@/actions/inventory";
import { fmtMoney, fmtQty, groupBy, monthLabel, parseYm } from "@/lib/inventory-format";

export const dynamic = "force-dynamic";

export default async function MonthlyInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireModule("inventory");
  const { ym, year, month } = parseYm((await searchParams).ym);
  const rows = await getMonthlyInventory(year, month);

  return (
    <AppShell
      title="Inventory · Monthly Inventory"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <InventoryBack />
      <div className="panel panel-navy mb-4">
        <MonthPicker value={ym} />
      </div>

      <div className="panel panel-teal">
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">{monthLabel(year, month)}</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No stock or movement for this month.</p>
      ) : (
        <div className="max-w-4xl overflow-x-auto rounded border border-line bg-paper-raised">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left ledger-label">
                <th className="px-4 py-2 font-normal">Item</th>
                <th className="px-4 py-2 text-right font-normal">Latest price</th>
                <th className="px-4 py-2 text-right font-normal">Balance forward</th>
                <th className="px-4 py-2 text-right font-normal">Purchases</th>
                <th className="px-4 py-2 text-right font-normal">Actual withdrawn</th>
                <th className="px-4 py-2 text-right font-normal">Balance</th>
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
                      <td className="px-4 py-1.5 text-right font-mono text-ink-soft">{fmtMoney(r.price)}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-ink-soft">{fmtQty(r.balance_forward)}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-ink-soft">{fmtQty(r.purchases)}</td>
                      <td className="px-4 py-1.5 text-right font-mono text-ink-soft">{fmtQty(r.actual)}</td>
                      <td className="px-4 py-1.5 text-right font-mono font-medium text-ink">{fmtQty(r.balance)}</td>
                    </tr>
                  )),
                ])}
              </tbody>
            ))}
          </table>
        </div>
      )}
      </div>
    </AppShell>
  );
}
