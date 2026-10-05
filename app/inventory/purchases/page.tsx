import { requireModule } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { InventoryBack } from "@/components/inventory-back";
import { MonthPicker } from "@/components/month-picker";
import { getPurchases } from "@/actions/inventory";
import { fmtMoney, fmtQty, groupBy, monthLabel, parseYm } from "@/lib/inventory-format";

export const dynamic = "force-dynamic";

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireModule("inventory");
  const { ym, year, month } = parseYm((await searchParams).ym);
  const rows = await getPurchases(year, month);

  const bySorting = groupBy(rows, (r) => r.sorting_name);
  const grand = rows.reduce((a, r) => a + r.amount, 0);

  return (
    <AppShell
      title="Inventory · Purchases"
      session={{ loginName: session.loginName, isSuperAdmin: session.isSuperAdmin, modules: session.modules }}
    >
      <InventoryBack />
      <div className="panel panel-navy mb-4">
        <MonthPicker value={ym} />
      </div>

      <div className="panel panel-teal">
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">
        Purchases · {monthLabel(year, month)}
      </h2>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No purchases were received in this month.</p>
      ) : (
        <div className="max-w-3xl space-y-5">
          {Array.from(bySorting.entries()).map(([sorting, sRows]) => (
            <section key={sorting} className="rounded border border-line bg-paper-raised">
              <div className="flex items-baseline justify-between border-b border-line bg-paper px-4 py-2">
                <h3 className="font-display text-base font-semibold text-ink">{sorting}</h3>
                <span className="font-mono text-sm text-ink">{fmtMoney(sRows.reduce((a, r) => a + r.amount, 0))}</span>
              </div>
              {Array.from(groupBy(sRows, (r) => r.bound_name).entries()).map(([bound, bRows]) => (
                <div key={bound}>
                  <div className="flex items-baseline justify-between border-b border-line px-4 py-1.5">
                    <span className="text-sm font-medium text-ink-soft">{bound}</span>
                    <span className="font-mono text-xs text-ink-soft">{fmtMoney(bRows.reduce((a, r) => a + r.amount, 0))}</span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {bRows.map((r) => (
                        <tr key={r.item_id} className="border-b border-line last:border-0">
                          <td className="px-4 py-1.5 pl-8 text-ink">{r.item_name}</td>
                          <td className="px-4 py-1.5 text-right font-mono text-ink-soft">{fmtQty(r.qty)}</td>
                          <td className="px-4 py-1.5 text-right font-mono text-ink">{fmtMoney(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>
          ))}
          <p className="text-right text-sm text-ink">
            Total purchases <span className="ml-3 font-mono font-semibold">{fmtMoney(grand)}</span>
          </p>
        </div>
      )}
      </div>
    </AppShell>
  );
}
