"use client";

import { useEffect, useState } from "react";
import { populateJobOrders, type PopulateResult } from "@/actions/job-orders";
import { populateFromSupabase } from "@/actions/job-orders-supabase";
import { money } from "@/lib/report-format";

export function JobOrdersWorkspace({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [ymAccess, setYmAccess] = useState("");
  const [ymSupabase, setYmSupabase] = useState("");
  const [busy, setBusy] = useState<"access" | "supabase" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PopulateResult | null>(null);
  const [source, setSource] = useState<"access" | "supabase">("access");

  // default to the user's current month (client side: the server runs in UTC)
  useEffect(() => {
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setYmAccess(cur);
    setYmSupabase(cur);
  }, []);

  async function onPopulate(from: "access" | "supabase") {
    const ym = from === "access" ? ymAccess : ymSupabase;
    if (!ym) {
      setError("Select a month and year to populate.");
      return;
    }
    setBusy(from);
    setError(null);
    const res = from === "access" ? await populateJobOrders(ym) : await populateFromSupabase(ym);
    setBusy(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.result) {
      setSource(from);
      setResult(res.result);
      setCount((c) => c + res.result!.newRecords.length);
    }
  }

  return (
    <div className="max-w-6xl">
      <section className="panel panel-navy mb-4 flex flex-wrap items-end gap-4">
        <h2 className="w-full text-base font-bold tracking-wide">Populate from MS Access</h2>
        <div>
          <label className="ledger-label mb-1 block">Month and year to populate</label>
          <input type="month" className="field-input !w-48" value={ymAccess} onChange={(e) => setYmAccess(e.target.value)} />
        </div>
        <button type="button" className="btn-primary !px-8 !py-3 text-base font-bold tracking-wide" disabled={busy !== null || !ymAccess} onClick={() => void onPopulate("access")}>
          {busy === "access" ? "Copying…" : "POPULATE"}
        </button>
        <div className="pb-1 text-sm">
          <div>Copies the deliveries of that month that are not yet copied, with their job tickets, from the local Access database.</div>
          <div className="opacity-85">Job tickets in the app: {count.toLocaleString("en-US")}</div>
        </div>
      </section>

      <section className="panel panel-navy mb-6 flex flex-wrap items-end gap-4">
        <h2 className="w-full text-base font-bold tracking-wide">Populate from Supabase</h2>
        <div>
          <label className="ledger-label mb-1 block">Month and year to populate</label>
          <input type="month" className="field-input !w-48" value={ymSupabase} onChange={(e) => setYmSupabase(e.target.value)} />
        </div>
        <button type="button" className="btn-primary !px-8 !py-3 text-base font-bold tracking-wide" disabled={busy !== null || !ymSupabase} onClick={() => void onPopulate("supabase")}>
          {busy === "supabase" ? "Copying…" : "POPULATE"}
        </button>
        <div className="pb-1 text-sm">
          <div>Copies the deliveries of that month that are not yet copied, with their job tickets, from the vitson-recipe database.</div>
        </div>
      </section>

      {error && <p className="mb-5 rounded-sm bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}

      {result && (
        <>
          <p className="mb-3 text-sm text-ink-soft">
            {source === "supabase" ? "From Supabase, " : "From MS Access, "}{result.label}: found {result.tickets.toLocaleString("en-US")} job tickets with deliveries not yet copied in{" "}
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
              {source === "supabase"
                ? `The records were copied, but the deliveries in vitson-recipe could not be marked (copied): ${result.markError} Press POPULATE again for the same month; the job orders will be replaced with identical copies and nothing is duplicated.`
                : `The records were copied, but Access could not be marked (copied): ${result.markError} Close the database in Access and press POPULATE again for the same month; the job orders will be replaced with identical copies and nothing is duplicated.`}
            </p>
          ) : (
            result.marked > 0 && (
              <p className="mb-4 text-sm text-success">{source === "supabase"
                  ? `${result.marked.toLocaleString("en-US")} delivery records marked copied = true in vitson-recipe.`
                  : `Delivery records of ${result.marked.toLocaleString("en-US")} job tickets marked copied = true in Access.`}</p>
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
