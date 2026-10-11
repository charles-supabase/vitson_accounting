"use client";

import { useEffect, useState } from "react";
import { ConfirmModal } from "./confirm-modal";
import { getRecipeList, populateRecipes, type RecipeListSorting, type RecipePopulateResult } from "@/actions/recipe-import";

const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

/**
 * Recipe usage: pick a month and year, POPULATE copies the recipes of that month from the Access database link_recipe
 * into the item inventory, and the list below shows what the month's inventory holds (sorting > bound > item).
 */
export function RecipeImportPanel() {
  const [ym, setYm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecipePopulateResult | null>(null);
  const [confirm, setConfirm] = useState<{ existing: number; label: string } | null>(null);
  const [groups, setGroups] = useState<RecipeListSorting[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // default to the user's current month (client side: the server runs in UTC)
  useEffect(() => {
    const now = new Date();
    setYm(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }, []);

  // the list follows the selected period
  useEffect(() => {
    if (!ym) return;
    let cancelled = false;
    getRecipeList(ym).then((res) => {
      if (cancelled) return;
      setListError(res.error ?? null);
      setGroups(res.groups ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [ym]);

  async function run(replace: boolean) {
    setBusy(true);
    setError(null);
    const res = await populateRecipes(ym, replace);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.needsConfirm) {
      setConfirm({ existing: res.existing ?? 0, label: res.label ?? ym });
      return;
    }
    setResult(res.result ?? null);
    const list = await getRecipeList(ym);
    setListError(list.error ?? null);
    setGroups(list.groups ?? []);
  }

  return (
    <div className="max-w-4xl">
      <section className="panel panel-navy mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="ledger-label mb-1 block">Month and year to populate</label>
          <input type="month" className="field-input !w-48" value={ym} onChange={(e) => { setYm(e.target.value); setResult(null); }} />
        </div>
        <button
          type="button"
          className="btn-primary !px-8 !py-3 text-base font-bold tracking-wide"
          disabled={busy || !ym}
          onClick={() => {
            setResult(null);
            void run(false);
          }}
        >
          {busy ? "Copying…" : "POPULATE"}
        </button>
        <p className="pb-1 text-sm">Copies the recipes of that month from the Access database into the item inventory.</p>
      </section>

      {error && <p className="mb-5 rounded-sm bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      {result && (
        <div className="mb-6 rounded border border-line bg-paper-raised p-4 text-sm">
          <p className="mb-2 font-semibold">{result.label}</p>
          <ul className="space-y-1 text-ink-soft">
            <li>Job tickets with a recipe date in the month: {result.tickets.toLocaleString("en-US")}</li>
            {result.deleted > 0 && <li>Earlier recipe rows removed: {result.deleted.toLocaleString("en-US")}</li>}
            <li>Rows added (one per item and recipe date): {result.inserted.toLocaleString("en-US")}</li>
          </ul>
          {result.skippedItems.length > 0 && (
            <div className="mt-3">
              <p className="font-semibold text-danger">Not copied: item is not in the app ({result.skippedItems.length})</p>
              <ul className="mt-1 max-h-48 overflow-auto text-ink-soft">
                {result.skippedItems.map((s) => (
                  <li key={s.itemId}>
                    Item no. <span className="font-mono">{s.itemId}</span>, quantity <span className="font-mono">{s.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* what the month's inventory holds: sorting > bound > item, light green */}
      {listError && <p className="mb-4 text-sm text-danger">{listError}</p>}
      {groups && (
        <section className="overflow-hidden rounded border border-line" style={{ backgroundColor: "#dcf3e1" }}>
          {groups.length === 0 && <p className="px-4 py-4 text-sm text-ink-soft">No recipe quantities in this month.</p>}
          {groups.map((g) => (
            <div key={g.sortingId} className="border-b border-line last:border-b-0">
              <div className="flex items-baseline justify-between px-4 py-2 text-sm font-bold" style={{ backgroundColor: "#a9deb5" }}>
                <span>{g.sortingName}</span>
                <span className="font-mono">{qty(g.total)}</span>
              </div>
              {g.bounds.map((b) => (
                <div key={b.boundId}>
                  <div className="flex items-baseline justify-between px-4 py-1.5 text-sm font-semibold" style={{ backgroundColor: "#c3ebcd" }}>
                    <span>{b.boundName}</span>
                    <span className="font-mono">{qty(b.total)}</span>
                  </div>
                  {b.items.map((i) => (
                    <div key={i.itemId} className="grid grid-cols-[5rem_1fr_9rem] gap-3 border-t border-[#b5dcbf] px-4 py-1 text-sm">
                      <span className="font-mono text-ink-soft">{i.itemId}</span>
                      <span>{i.itemName}</span>
                      <span className="text-right font-mono">{qty(i.qty)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {confirm && (
        <ConfirmModal
          danger
          message={`${confirm.label} already has recipe data in the item inventory (${confirm.existing.toLocaleString("en-US")} rows). Populating again will delete the previously populated data for this period and copy it again from Access. Continue?`}
          confirmLabel="Delete and populate again"
          cancelLabel="Cancel"
          onConfirm={() => {
            setConfirm(null);
            void run(true);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
