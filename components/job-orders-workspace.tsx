"use client";

import { useEffect, useState } from "react";
import { populateJobOrders, type PopulateResult } from "@/actions/job-orders";
import { money } from "@/lib/report-format";

export function JobOrdersWorkspace({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [ym, setYm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PopulateResult | null>(null);

  // default to the user's current month (client side: the server runs in UTC)
  useEffect(() => {
    const now = new Date();
    setYm(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }, []);

  async function onPopulate() {
    if (!ym) {
      setError("Select a month and year to populate.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await populateJobOrders(ym);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.result) {
      setResult(res.result);
      setCount((c) => c + res.result!.newRecords.length);
    }
  }

  return (
    <div className="max-w-6xl">
      <section className="panel panel-navy mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="ledger-label mb-1 block">Month and year to populate</label>
          <input type="month" className="field-input !w-48" value={ym} onChange={(e) => setYm(e.target.value)} />
        </div>
        <button type="button" className="btn-primary !px-8 !py-3 text-base font-bold tracking-wide" disabled={busy || !ym} onClick={() => void onPopulate()}>
          {busy ? "Copying…" : "POPULATE"}
        </button>
        <div className="pb-1 text-sm">
          <div>Copies the deliveries of that month that are not yet copied, with their job tickets.</div>
          <div className="opacity-85">Job tickets in the app: {count.toLocaleString("en-US")}</div>
        </div>
      </section>

      {error && <p className="mb-5 rounded-sm bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      {result && (
        <>
          <p className="mb-3 text-sm text-ink-soft">
            {result.label}: found {result.tickets.toLocaleString("en-US")} job tickets with deliveries not yet copied in{" "}
            <span className="font-mono">{result.path}</span>
            {result.alreadyCopied > 0 ? ` (${result.alreadyCopied.toLocaleString("en-US")} delivery records of the month were already copied)` : ""}.{" "}
            {result.newRecords.length} new job orders, {result.changedRecords.length} replaced, {result.deliveries.added.length} deliveries added
            {result.skipped.length + result.deliveries.skipped.length > 0 ? `, ${result.skipped.length + result.deliveries.skipped.length} skipped` : ""}.
          </p>
          {result.cusJoBackfilled > 0 && (
            <p className="mb-3 text-sm text-ink-soft">CusJONo filled in for {result.cusJoBackfilled.toLocaleString("en-US")} older job orders.</p>
          )}
          {result.markError ? (
            <p className="mb-4 rounded-sm bg-danger-soft px-4 py-3 text-sm text-danger">
              The records were copied, but Access could not be marked (copied): {result.markError} Close the database in Access and
              press POPULATE again for the same month; the job orders will be replaced with identical copies and nothing is duplicated.
            </p>
          ) : (
            result.marked > 0 && (
              <p className="mb-4 text-sm text-success">Delivery records of {result.marked.toLocaleString("en-US")} job tickets marked copied = true in Access.</p>
            )
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* new records */}
            <section className="rounded border border-line bg-paper-raised">
              <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">New records ({result.newRecords.length})</h2>
              <div className="max-h-[26rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-soft">
                      <th className="px-3 py-1.5">Job ticket</th>
                      <th className="px-3 py-1.5">Customer</th>
                      <th className="px-3 py-1.5 text-right">Weight</th>
                      <th className="px-3 py-1.5 text-right">Rolls</th>
                      <th className="px-3 py-1.5 text-right">Unit price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.newRecords.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-3 text-xs text-ink-faint">No new job tickets.</td></tr>
                    )}
                    {result.newRecords.map((r) => (
                      <tr key={r.linkId} className="border-t border-line">
                        <td className="px-3 py-1.5 font-mono">{r.jobTicket}</td>
                        <td className="px-3 py-1.5">{r.customerName}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{money(r.totalWeight)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{r.totalRolls}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{money(r.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* changed records */}
            <section className="rounded border border-line bg-paper-raised">
              <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">Changed records, replaced ({result.changedRecords.length})</h2>
              <div className="max-h-[26rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-ink-soft">
                      <th className="px-3 py-1.5">Job ticket</th>
                      <th className="px-3 py-1.5">Customer</th>
                      <th className="px-3 py-1.5">What changed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.changedRecords.length === 0 && (
                      <tr><td colSpan={3} className="px-3 py-3 text-xs text-ink-faint">No changed job tickets.</td></tr>
                    )}
                    {result.changedRecords.map((r) => (
                      <tr key={r.linkId} className="border-t border-line align-top">
                        <td className="px-3 py-1.5 font-mono">{r.jobTicket}</td>
                        <td className="px-3 py-1.5">{r.customerName}</td>
                        <td className="px-3 py-1.5 text-xs">
                          {r.changes.length === 0 && <span className="text-ink-faint">Replaced, same values</span>}
                          {r.changes.map((c) => (
                            <div key={c.label}>
                              {c.label}: <span className="font-mono text-ink-soft">{c.before}</span> →{" "}
                              <span className="font-mono font-semibold">{c.after}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* deliveries copied in the same run */}
          <section className="mt-6 rounded border border-line bg-paper-raised">
            <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">
              Deliveries added ({result.deliveries.added.length})
              {result.deliveries.alreadyInApp > 0 && (
                <span className="ml-2 text-xs font-normal text-ink-soft">
                  {result.deliveries.alreadyInApp.toLocaleString("en-US")} job tickets already had a delivery and were left as they are
                </span>
              )}
            </h2>
            <div className="max-h-[22rem] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-soft">
                    <th className="px-3 py-1.5">Job ticket</th>
                    <th className="px-3 py-1.5">Customer</th>
                    <th className="px-3 py-1.5 text-right">DR</th>
                    <th className="px-3 py-1.5">Type</th>
                    <th className="px-3 py-1.5">Date</th>
                    <th className="px-3 py-1.5 text-right">Weight</th>
                    <th className="px-3 py-1.5 text-right">Rolls</th>
                  </tr>
                </thead>
                <tbody>
                  {result.deliveries.added.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-3 text-xs text-ink-faint">No new deliveries.</td></tr>
                  )}
                  {result.deliveries.added.map((d) => (
                    <tr key={d.jobTicket} className="border-t border-line">
                      <td className="px-3 py-1.5 font-mono">{d.jobTicket}</td>
                      <td className="px-3 py-1.5">{d.customerName}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{d.deliveryReceipt}</td>
                      <td className="px-3 py-1.5">{d.receivableTypeId === 2 ? "Small" : "Big"}</td>
                      <td className="px-3 py-1.5">{d.dateDelivery}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{money(d.totalWeight)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{d.totalRolls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.deliveries.warnings.length > 0 && (
              <ul className="border-t border-line px-3 py-2 text-xs text-ink-soft">
                {result.deliveries.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </section>

          {result.deliveries.skipped.length > 0 && (
            <section className="mt-6 rounded border border-line bg-paper-raised">
              <h2 className="border-b border-line px-3 py-2 text-sm font-semibold text-danger">
                Deliveries skipped ({result.deliveries.skipped.length})
              </h2>
              <ul className="max-h-60 overflow-auto px-3 py-2 text-sm">
                {result.deliveries.skipped.map((s, i) => (
                  <li key={i} className="py-0.5">
                    <span className="font-mono">{s.jobTicket}</span>: {s.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {result.skipped.length > 0 && (
            <section className="mt-6 rounded border border-line bg-paper-raised">
              <h2 className="border-b border-line px-3 py-2 text-sm font-semibold text-danger">
                Skipped, not copied ({result.skipped.length})
              </h2>
              <ul className="max-h-60 overflow-auto px-3 py-2 text-sm">
                {result.skipped.map((s, i) => (
                  <li key={i} className="py-0.5">
                    <span className="font-mono">{s.jobTicket || "(no ticket no.)"}</span>: {s.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
