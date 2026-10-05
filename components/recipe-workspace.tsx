"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { populateRecipe, type RecipeUsageRow } from "@/actions/inventory";
import { fmtMoney, fmtQty, groupBy, monthLabel } from "@/lib/inventory-format";
import { SuccessModal } from "./success-modal";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const sum = (rows: RecipeUsageRow[], f: (r: RecipeUsageRow) => number) => rows.reduce((a, r) => a + f(r), 0);

export function RecipeWorkspace({ rows }: { rows: RecipeUsageRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onPopulate() {
    setError(null);
    startTransition(async () => {
      const res = await populateRecipe(todayLocal());
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage(
        res.rows === 0
          ? "Nothing to populate. There are no unprocessed recipe entries."
          : `Populated ${res.items} ${res.items === 1 ? "item" : "items"} from ${res.rows} recipe ${res.rows === 1 ? "entry" : "entries"}.`
      );
      router.refresh();
    });
  }

  const byMonth = groupBy(rows, (r) => r.month_start);

  return (
    <div className="panel panel-teal max-w-3xl">
      <button type="button" className="btn-primary" onClick={onPopulate} disabled={isPending}>
        {isPending ? "Populating…" : "POPULATE"}
      </button>
      {error && (
        <p className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-6">
        {rows.length === 0 && <p className="text-sm text-ink-soft">No recipe usage has been populated yet.</p>}
        {Array.from(byMonth.entries()).map(([monthStart, mRows]) => {
          const year = Number(monthStart.slice(0, 4));
          const month = Number(monthStart.slice(5, 7));
          return (
            <section key={monthStart} className="rounded border border-line bg-paper-raised">
              <div className="flex items-baseline justify-between border-b border-line bg-paper px-4 py-2">
                <h3 className="font-display text-base font-semibold text-ink">{monthLabel(year, month)}</h3>
                <span className="font-mono text-sm text-ink">
                  {fmtQty(sum(mRows, (r) => r.qty))} · {fmtMoney(sum(mRows, (r) => r.amount))}
                </span>
              </div>
              {Array.from(groupBy(mRows, (r) => r.sorting_name).entries()).map(([sorting, sRows]) => (
                <div key={sorting}>
                  <div className="border-b border-line px-4 py-1.5 text-sm font-medium text-ink">{sorting}</div>
                  {Array.from(groupBy(sRows, (r) => r.bound_name).entries()).map(([bound, bRows]) => (
                    <div key={bound}>
                      <div className="flex items-baseline justify-between border-b border-line px-4 py-1 pl-8">
                        <span className="text-sm text-ink-soft">{bound}</span>
                        <span className="font-mono text-xs text-ink-soft">
                          {fmtQty(sum(bRows, (r) => r.qty))} · {fmtMoney(sum(bRows, (r) => r.amount))}
                        </span>
                      </div>
                      <table className="w-full text-sm">
                        <tbody>
                          {bRows.map((r) => (
                            <tr key={r.item_id} className="border-b border-line last:border-0">
                              <td className="px-4 py-1.5 pl-12 text-ink">{r.item_name}</td>
                              <td className="px-4 py-1.5 text-right font-mono text-ink-soft">{fmtQty(r.qty)}</td>
                              <td className="px-4 py-1.5 text-right font-mono text-ink">{fmtMoney(r.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}
