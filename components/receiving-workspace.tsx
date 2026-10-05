"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelPoLine,
  getOpenLinesForSupplier,
  receivePoLine,
  type OpenPoLine,
  type ReceivingSupplierOption,
} from "@/actions/receiving";
import { ComboBox } from "./combo-box";
import { formatDate } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";
import { SuccessModal } from "./success-modal";
import { ConfirmModal } from "./confirm-modal";

function todayLocal() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fmtQty(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const LEAVE_MESSAGE = "This receiving entry is not saved. Leave anyway?";

export function ReceivingWorkspace({ suppliers }: { suppliers: ReceivingSupplierOption[] }) {
  const router = useRouter();
  const { setDirty, confirmLeave } = useUnsavedChanges();
  const [isPending, startTransition] = useTransition();

  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [lines, setLines] = useState<OpenPoLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [selected, setSelected] = useState<OpenPoLine | null>(null);

  const [drInvNo, setDrInvNo] = useState("");
  const [newInvNo, setNewInvNo] = useState("");
  const [dtRecieved, setDtRecieved] = useState(todayLocal());
  const [qtyStr, setQtyStr] = useState("");
  const [destination, setDestination] = useState("");
  const [remarks, setRemarks] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const requestId = useRef(0);

  const qtyNum = qtyStr.trim() === "" ? NaN : Number(qtyStr);
  const qtyOk = !!selected && Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum <= selected.qty;
  const balance =
    selected && Number.isFinite(qtyNum)
      ? qtyNum === selected.qty
        ? 0
        : Math.round((selected.qty - qtyNum) * 1e6) / 1e6
      : 0;

  const hasUnsavedEntry =
    !!selected &&
    (drInvNo.trim() !== "" ||
      newInvNo.trim() !== "" ||
      remarks.trim() !== "" ||
      destination !== (selected.destination ?? "") ||
      (Number.isFinite(qtyNum) && qtyNum !== selected.qty));

  useEffect(() => {
    setDirty(hasUnsavedEntry, LEAVE_MESSAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedEntry]);

  // Make sure the sidebar guard is released if this page unmounts.
  useEffect(() => {
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearEntry() {
    setSelected(null);
    setDrInvNo("");
    setNewInvNo("");
    setDtRecieved(todayLocal());
    setQtyStr("");
    setDestination("");
    setRemarks("");
    setAttempted(false);
    setError(null);
  }

  async function loadLines(id: number): Promise<OpenPoLine[]> {
    const myRequest = ++requestId.current;
    setLoadingLines(true);
    try {
      const result = await getOpenLinesForSupplier(id);
      if (myRequest === requestId.current) setLines(result);
      return result;
    } finally {
      if (myRequest === requestId.current) setLoadingLines(false);
    }
  }

  async function onSelectSupplier(id: number | null) {
    if (id === supplierId) return;
    if (!(await confirmLeave(hasUnsavedEntry, LEAVE_MESSAGE))) return;
    clearEntry();
    setSupplierId(id);
    if (id == null) {
      requestId.current++;
      setLines([]);
      return;
    }
    await loadLines(id);
  }

  async function onSelectLine(line: OpenPoLine) {
    if (selected?.detailId === line.detailId) return;
    if (!(await confirmLeave(hasUnsavedEntry, LEAVE_MESSAGE))) return;
    setSelected(line);
    setDrInvNo("");
    setNewInvNo("");
    setDtRecieved(todayLocal());
    setQtyStr(String(line.qty));
    setDestination(line.destination ?? "");
    setRemarks("");
    setAttempted(false);
    setError(null);
  }

  async function afterChange(): Promise<void> {
    clearEntry();
    if (supplierId != null) {
      const remaining = await loadLines(supplierId);
      if (remaining.length === 0) setSupplierId(null);
    }
    router.refresh();
  }

  function onSave() {
    if (!selected) return;
    setAttempted(true);
    setError(null);
    if (drInvNo.trim() === "" || !dtRecieved || !qtyOk) return;

    const line = selected;
    startTransition(async () => {
      const res = await receivePoLine({
        detailId: line.detailId,
        drInvNo,
        newInvNo,
        dtRecieved,
        qty: qtyNum,
        destination,
        remarks,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      const bal = res.balanceQty ?? 0;
      setMessage(
        bal > 0
          ? `Receiving saved. Balance of ${fmtQty(bal)} ${line.unitName} remains open on PO #${line.poNo}.`
          : "Receiving saved successfully."
      );
      await afterChange();
    });
  }

  function onCancelItem() {
    if (!selected) return;
    const line = selected;
    setCancelOpen(false);
    setError(null);
    startTransition(async () => {
      const res = await cancelPoLine(line.detailId, todayLocal());
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage("This item is cancelled and will not be received.");
      await afterChange();
    });
  }

  const drInvError = attempted && drInvNo.trim() === "";
  const dateError = attempted && !dtRecieved;
  const qtyError = !!selected && qtyStr !== "" && !qtyOk;
  const qtyEmptyError = attempted && qtyStr.trim() === "";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------- left: supplier + open lines ---------- */}
      <section className="panel panel-navy">
        <label className="ledger-label mb-1 block">Supplier</label>
        <ComboBox
          options={suppliers.map((s) => ({ id: s.id, label: s.label }))}
          value={supplierId}
          onChange={onSelectSupplier}
          placeholder={suppliers.length === 0 ? "No suppliers with open PO lines" : "Select a supplier…"}
          disabled={suppliers.length === 0}
        />

        <div className="mb-1 mt-4 flex items-baseline justify-between">
          <span className="ledger-label">Open PO items</span>
          {supplierId != null && !loadingLines && (
            <span className="text-[11px] text-ink-faint">{lines.length} waiting</span>
          )}
        </div>

        <div className="h-[352px] overflow-y-auto rounded-sm border border-line bg-paper-raised" role="listbox" aria-label="Open PO items">
          {supplierId == null && (
            <p className="px-3 py-3 text-sm text-ink-faint">Choose a supplier to see items waiting to be received.</p>
          )}
          {supplierId != null && loadingLines && <p className="px-3 py-3 text-sm text-ink-faint">Loading…</p>}
          {supplierId != null && !loadingLines && lines.length === 0 && (
            <p className="px-3 py-3 text-sm text-ink-faint">No open items for this supplier.</p>
          )}
          {lines.map((l) => {
            const active = selected?.detailId === l.detailId;
            return (
              <button
                key={l.detailId}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelectLine(l)}
                className={
                  "block h-11 w-full overflow-hidden border-b border-line px-3 py-1 text-left " +
                  (active ? "bg-accent-soft" : "hover:bg-paper")
                }
              >
                <span className="block truncate text-sm text-ink">{l.itemName}</span>
                <span className="block truncate text-[11px] text-ink-soft">
                  PO #{l.poNo} · {fmtQty(l.qty)} {l.unitName} · due {formatDate(l.dtDelivery)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- right: data entry ---------- */}
      <section className="panel panel-green">
        <h2 className="mb-3 font-display text-lg text-ink">Data entry</h2>

        {!selected ? (
          <p className="rounded-sm border border-dashed border-line px-4 py-8 text-center text-sm text-ink-faint">
            Select an item from the list to record its receipt.
          </p>
        ) : (
          <div className="rounded-sm border border-line bg-paper-raised p-4">
            <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="col-span-2">
                <div className="ledger-label">Item</div>
                <div className="text-ink">{selected.itemName}</div>
              </div>
              <div>
                <div className="ledger-label">PO No</div>
                <div className="font-mono text-ink">{selected.poNo}</div>
              </div>
              <div>
                <div className="ledger-label">Expected delivery</div>
                <div className="text-ink">{formatDate(selected.dtDelivery)}</div>
              </div>
              <div>
                <div className="ledger-label">Ordered qty</div>
                <div className="font-mono text-ink">
                  {fmtQty(selected.qty)} {selected.unitName}
                </div>
              </div>
              <div>
                <div className="ledger-label">Price{selected.discount > 0 ? ` (less ${selected.discount}%)` : ""}</div>
                <div className="font-mono text-ink">{fmtMoney(selected.price * (1 - selected.discount / 100))}</div>
              </div>
              {selected.remarks && (
                <div className="col-span-2">
                  <div className="ledger-label">PO remarks</div>
                  <div className="text-ink-soft">{selected.remarks}</div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4">
              <div>
                <label className="ledger-label mb-1 block">DR / Invoice No</label>
                <input
                  className={drInvError ? "field-input-error" : "field-input"}
                  value={drInvNo}
                  onChange={(e) => setDrInvNo(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="ledger-label mb-1 block">New invoice No</label>
                <input className="field-input" value={newInvNo} onChange={(e) => setNewInvNo(e.target.value)} />
              </div>
              <div>
                <label className="ledger-label mb-1 block">Date received</label>
                <input
                  type="date"
                  className={dateError ? "field-input-error" : "field-input"}
                  value={dtRecieved}
                  onChange={(e) => setDtRecieved(e.target.value)}
                />
              </div>
              <div>
                <label className="ledger-label mb-1 block">Qty received ({selected.unitName})</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  className={qtyError || qtyEmptyError ? "field-input-error" : "field-input"}
                  value={qtyStr}
                  onChange={(e) => setQtyStr(e.target.value)}
                />
                {qtyError && (
                  <p className="mt-1 text-[11px] text-danger">
                    Must be more than 0 and no more than {fmtQty(selected.qty)}.
                  </p>
                )}
              </div>
              <div>
                <label className="ledger-label mb-1 block">Destination</label>
                <input className="field-input" value={destination} onChange={(e) => setDestination(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="ledger-label mb-1 block">Remarks</label>
                <input className="field-input" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
              <div>
                <label className="ledger-label mb-1 block">Qty balance</label>
                <input
                  readOnly
                  tabIndex={-1}
                  className={"field-input bg-paper font-mono " + (qtyOk && balance > 0 ? "border-orange-400" : "")}
                  value={qtyOk ? fmtQty(balance) : ""}
                />
                {qtyOk && balance > 0 && (
                  <p className="mt-1 text-[11px] text-ink-soft">
                    Partial receipt: {fmtQty(balance)} will stay open as a new PO line.
                  </p>
                )}
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" onClick={onSave} disabled={isPending}>
                {isPending ? "Saving…" : "Save receiving"}
              </button>
              <button type="button" className="btn-secondary" onClick={clearEntry} disabled={isPending}>
                Clear
              </button>
              <button
                type="button"
                className="btn-secondary ml-auto border-danger text-danger hover:bg-danger-soft"
                onClick={() => setCancelOpen(true)}
                disabled={isPending}
              >
                Cancel item
              </button>
            </div>
          </div>
        )}
      </section>

      {cancelOpen && selected && (
        <ConfirmModal
          danger
          message={`Cancel ${selected.itemName} (${fmtQty(selected.qty)} ${selected.unitName}) on PO #${selected.poNo}? The full quantity will be marked cancelled and nothing will be received.`}
          confirmLabel="Cancel item"
          cancelLabel="Keep"
          onConfirm={onCancelItem}
          onCancel={() => setCancelOpen(false)}
        />
      )}

      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}
