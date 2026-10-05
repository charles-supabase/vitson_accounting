"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRequisition } from "@/actions/requisitions";
import { MoneyInput } from "./money-input";
import { SuccessModal } from "./success-modal";

type Option = { id: number; label: string };

export type EditorLine = {
  id: number;
  itemName: string;
  qty: number;
  unitId: number | null;
  packagingId: number | null;
  supplierId: number | null;
  boolRush: boolean;
  price: number | null;
  remarks: string;
};

export function RequisitionEditor({
  id,
  status,
  dtRequest,
  accBookId,
  projectId,
  remark,
  lines,
  units,
  packagings,
  suppliers,
  projects,
  accBooks,
}: {
  id: number;
  status: string;
  dtRequest: string;
  accBookId: number | null;
  projectId: number | null;
  remark: string;
  lines: EditorLine[];
  units: Option[];
  packagings: Option[];
  suppliers: Option[];
  projects: Option[];
  accBooks: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const locked = status !== "PENDING";

  const [date, setDate] = useState(dtRequest);
  const [book, setBook] = useState<number | null>(accBookId);
  const [project, setProject] = useState<number | null>(projectId);
  const [rem, setRem] = useState(remark);
  const [rows, setRows] = useState(
    lines.map((l) => ({
      ...l,
      qtyStr: String(l.qty),
      priceStr: l.price != null ? String(l.price) : "",
    }))
  );
  const [removed, setRemoved] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const dirty =
    date !== dtRequest || book !== accBookId || project !== projectId || rem !== remark || removed.length > 0 ||
    rows.some((r) => {
      const o = lines.find((l) => l.id === r.id);
      return !o || r.qtyStr !== String(o.qty) || r.unitId !== o.unitId || r.packagingId !== o.packagingId ||
        r.supplierId !== o.supplierId || r.boolRush !== o.boolRush || r.priceStr !== (o.price != null ? String(o.price) : "") ||
        r.remarks !== o.remarks;
    });

  /** Puts every field back to what is saved. */
  function discard() {
    setDate(dtRequest);
    setBook(accBookId);
    setProject(projectId);
    setRem(remark);
    setRows(lines.map((l) => ({ ...l, qtyStr: String(l.qty), priceStr: l.price != null ? String(l.price) : "" })));
    setRemoved([]);
    setError(null);
  }

  function patch(rowId: number, p: Partial<(typeof rows)[number]>) {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...p } : r)));
  }

  function save() {
    setError(null);
    for (const r of rows) {
      const q = Number(r.qtyStr);
      if (!Number.isInteger(q) || q <= 0) return setError("Every quantity must be a whole number greater than zero.");
      if (r.unitId == null) return setError("Every item needs a unit.");
    }
    if (rows.length === 0) return setError("A requisition needs at least one item.");

    startTransition(async () => {
      const res = await updateRequisition({
        id,
        dtRequest: date,
        accBookId: book,
        projectId: project,
        remark: rem,
        lines: rows.map((r) => ({
          id: r.id,
          qty: Number(r.qtyStr),
          unitId: r.unitId as number,
          packagingId: r.packagingId,
          supplierId: r.supplierId,
          boolRush: r.boolRush,
          price: r.priceStr.trim() === "" ? null : Number(r.priceStr),
          remarks: r.remarks,
        })),
        removedLineIds: removed,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage("Requisition updated.");
      setRemoved([]);
      router.refresh();
    });
  }

  const select = (value: number | null, opts: Option[], onChange: (v: number | null) => void, blank = "") => (
    <select
      className="field-input"
      value={value ?? ""}
      disabled={locked}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    >
      <option value="">{blank}</option>
      {opts.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );

  return (
    <section className="panel panel-green mt-8">
      <h2 className="mb-3 font-display text-lg font-semibold">Edit requisition</h2>

      {locked && (
        <div className="mb-4 rounded border-4 border-yellow-300 bg-[#0f3d20] px-4 py-3 text-center" role="status">
          <div className="text-xl font-extrabold tracking-wider text-yellow-300">LOCKED · VIEW ONLY</div>
          <div className="text-sm">This requisition is {status.toLowerCase()}, so it can no longer be edited.</div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <label className="ledger-label mb-1 block">Date</label>
          <input type="date" className="field-input" value={date} disabled={locked} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Account book</label>
          {select(book, accBooks, setBook)}
        </div>
        <div>
          <label className="ledger-label mb-1 block">Project</label>
          {select(project, projects, setProject)}
        </div>
        <div>
          <label className="ledger-label mb-1 block">Remark</label>
          <input className="field-input" value={rem} disabled={locked} onChange={(e) => setRem(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded border border-line bg-paper-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left ledger-label">
              <th className="px-3 py-2 font-normal">Item</th>
              <th className="w-20 px-2 py-2 font-normal">Qty</th>
              <th className="w-32 px-2 py-2 font-normal">Unit</th>
              <th className="w-36 px-2 py-2 font-normal">Packaging</th>
              <th className="w-44 px-2 py-2 font-normal">Supplier</th>
              <th className="w-24 px-2 py-2 font-normal">Price</th>
              <th className="w-14 px-2 py-2 text-center font-normal">Rush</th>
              <th className="px-2 py-2 font-normal">Remarks</th>
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 align-top">
                <td className="px-3 py-2 font-medium">{r.itemName}</td>
                <td className="px-2 py-1.5">
                  <input
                    className="field-input text-right font-mono"
                    inputMode="numeric"
                    value={r.qtyStr}
                    disabled={locked}
                    onChange={(e) => patch(r.id, { qtyStr: e.target.value.replace(/\D/g, "") })}
                  />
                </td>
                <td className="px-2 py-1.5">{select(r.unitId, units, (v) => patch(r.id, { unitId: v }))}</td>
                <td className="px-2 py-1.5">{select(r.packagingId, packagings, (v) => patch(r.id, { packagingId: v }))}</td>
                <td className="px-2 py-1.5">{select(r.supplierId, suppliers, (v) => patch(r.id, { supplierId: v }))}</td>
                <td className="px-2 py-1.5">
                  <MoneyInput value={r.priceStr} onChange={(v) => patch(r.id, { priceStr: v })} disabled={locked} />
                </td>
                <td className="px-2 py-2 text-center">
                  <input type="checkbox" checked={r.boolRush} disabled={locked} onChange={(e) => patch(r.id, { boolRush: e.target.checked })} />
                </td>
                <td className="px-2 py-1.5">
                  <input className="field-input" value={r.remarks} disabled={locked} onChange={(e) => patch(r.id, { remarks: e.target.value })} />
                </td>
                <td className="px-2 py-2 text-center">
                  {!locked && rows.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove item"
                      className="text-white/70 hover:text-white"
                      onClick={() => {
                        setRows((prev) => prev.filter((x) => x.id !== r.id));
                        setRemoved((prev) => [...prev, r.id]);
                      }}
                    >
                      ✕
                    </button>
                  )}
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
          <button
            type="button"
            className="btn-secondary"
            disabled={isPending || !dirty}
            onClick={discard}
          >
            Discard changes
          </button>
        </div>
      )}

      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </section>
  );
}
