"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePurchaseOrder } from "@/actions/purchase-orders";
import { MoneyInput } from "./money-input";
import { SuccessModal } from "./success-modal";

type Option = { id: number; label: string };

export type PoEditorLine = {
  id: number;
  itemName: string;
  unitName: string;
  qty: number;
  price: number;
  discount: number;
  remarks: string;
};

export function PoEditor({
  id,
  locked,
  lockedReason,
  dtPo,
  dtDelivery,
  terms,
  attention,
  destination,
  accSortingId,
  boolPettyCash,
  lines,
  accSortings,
}: {
  id: number;
  locked: boolean;
  lockedReason: string | null;
  dtPo: string;
  dtDelivery: string;
  terms: number | null;
  attention: string;
  destination: string;
  accSortingId: number | null;
  boolPettyCash: boolean;
  lines: PoEditorLine[];
  accSortings: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [po, setPo] = useState(dtPo);
  const [delivery, setDelivery] = useState(dtDelivery);
  const [termsStr, setTermsStr] = useState(terms != null ? String(terms) : "");
  const [att, setAtt] = useState(attention);
  const [dest, setDest] = useState(destination);
  const [sorting, setSorting] = useState<number | null>(accSortingId);
  const [petty, setPetty] = useState(boolPettyCash);
  const [rows, setRows] = useState(
    lines.map((l) => ({ ...l, qtyStr: String(l.qty), priceStr: String(l.price), discStr: String(l.discount) }))
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const dirty =
    po !== dtPo || delivery !== dtDelivery || termsStr !== (terms != null ? String(terms) : "") || att !== attention ||
    dest !== destination || sorting !== accSortingId || petty !== boolPettyCash ||
    rows.some((r) => {
      const o = lines.find((l) => l.id === r.id);
      return !o || r.qtyStr !== String(o.qty) || r.priceStr !== String(o.price) || r.discStr !== String(o.discount) || r.remarks !== o.remarks;
    });

  /** Puts every field back to what is saved. */
  function discard() {
    setPo(dtPo);
    setDelivery(dtDelivery);
    setTermsStr(terms != null ? String(terms) : "");
    setAtt(attention);
    setDest(destination);
    setSorting(accSortingId);
    setPetty(boolPettyCash);
    setRows(lines.map((l) => ({ ...l, qtyStr: String(l.qty), priceStr: String(l.price), discStr: String(l.discount) })));
    setError(null);
  }

  function patch(rowId: number, p: Partial<(typeof rows)[number]>) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...p } : r)));
  }

  function save() {
    setError(null);
    if (!(delivery > po)) return setError("Expected delivery date must be after the PO date.");
    if (sorting == null) return setError("Select an accounting sorting.");
    for (const r of rows) {
      if (!(Number(r.qtyStr) > 0)) return setError("Every quantity must be greater than zero.");
      if (r.priceStr.trim() === "" || !(Number(r.priceStr) >= 0)) return setError("Every line needs a price.");
      const d = r.discStr.trim() === "" ? 0 : Number(r.discStr);
      if (!(d >= 0 && d <= 100)) return setError("Discount must be between 0 and 100 percent.");
    }
    const t = termsStr.trim() === "" ? null : Number(termsStr);
    if (t != null && !(Number.isInteger(t) && t >= 0)) return setError("Terms must be a whole number of days.");

    startTransition(async () => {
      const res = await updatePurchaseOrder({
        id,
        dtPo: po,
        dtDelivery: delivery,
        terms: t,
        attention: att,
        destination: dest,
        accSortingId: sorting,
        boolPettyCash: petty,
        lines: rows.map((r) => ({
          id: r.id,
          qty: Number(r.qtyStr),
          price: Number(r.priceStr),
          discount: r.discStr.trim() === "" ? 0 : Number(r.discStr),
          remarks: r.remarks,
        })),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage("Purchase order updated.");
      router.refresh();
    });
  }

  return (
    <section className="panel panel-green mt-8 print:hidden">
      <h2 className="mb-3 font-display text-lg font-semibold">Edit purchase order</h2>

      {locked && (
        <div className="mb-4 rounded border-4 border-yellow-300 bg-[#0f3d20] px-4 py-3 text-center" role="status">
          <div className="text-xl font-extrabold tracking-wider text-yellow-300">LOCKED · VIEW ONLY</div>
          <div className="text-sm">{lockedReason}</div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <label className="ledger-label mb-1 block">PO date</label>
          <input type="date" className="field-input" value={po} disabled={locked} onChange={(e) => setPo(e.target.value)} />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Expected delivery</label>
          <input type="date" className="field-input" value={delivery} disabled={locked} onChange={(e) => setDelivery(e.target.value)} />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Terms (days)</label>
          <input className="field-input" inputMode="numeric" value={termsStr} disabled={locked} onChange={(e) => setTermsStr(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Account sorting</label>
          <select
            className="field-input"
            value={sorting ?? ""}
            disabled={locked}
            onChange={(e) => setSorting(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value=""></option>
            {accSortings.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ledger-label mb-1 block">Attention</label>
          <input className="field-input" value={att} disabled={locked} onChange={(e) => setAtt(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="ledger-label mb-1 block">Destination</label>
          <input className="field-input" value={dest} disabled={locked} onChange={(e) => setDest(e.target.value)} />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={petty} disabled={locked} onChange={(e) => setPetty(e.target.checked)} />
            Petty cash (SM PETTY CASH)
          </label>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded border border-line bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left ledger-label">
              <th className="px-3 py-2 font-normal">Item</th>
              <th className="w-28 px-2 py-2 font-normal">Qty</th>
              <th className="w-32 px-2 py-2 font-normal">Price</th>
              <th className="w-24 px-2 py-2 font-normal">Disc %</th>
              <th className="px-2 py-2 font-normal">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2 font-medium">
                  {r.itemName} <span className="text-xs opacity-75">({r.unitName})</span>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    className="field-input text-right font-mono"
                    inputMode="decimal"
                    value={r.qtyStr}
                    disabled={locked}
                    onChange={(e) => patch(r.id, { qtyStr: e.target.value.replace(/[^\d.]/g, "") })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <MoneyInput value={r.priceStr} onChange={(v) => patch(r.id, { priceStr: v })} disabled={locked} />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    className="field-input text-right font-mono"
                    inputMode="decimal"
                    value={r.discStr}
                    disabled={locked}
                    onChange={(e) => patch(r.id, { discStr: e.target.value.replace(/[^\d.]/g, "") })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input className="field-input" value={r.remarks} disabled={locked} onChange={(e) => patch(r.id, { remarks: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="mt-4 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {!locked && (
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn-primary" onClick={save} disabled={isPending || !dirty}>
            {isPending ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="btn-secondary" disabled={isPending || !dirty} onClick={discard}>
            Discard changes
          </button>
        </div>
      )}

      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </section>
  );
}
