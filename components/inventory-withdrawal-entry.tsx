"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { addWithdrawal, type ItemFilterData } from "@/actions/inventory";
import { ComboBox } from "./combo-box";
import { SuccessModal } from "./success-modal";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

const LEAVE_MESSAGE = "This entry is not saved. If you leave, the changes will be discarded. Leave anyway?";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function InventoryWithdrawalEntry({
  kind,
  data,
}: {
  kind: "daily" | "actual";
  data: ItemFilterData;
}) {
  const [isPending, startTransition] = useTransition();
  const { setDirty, confirmLeave } = useUnsavedChanges();

  const [sortingId, setSortingId] = useState<number | null>(null);
  const [boundId, setBoundId] = useState<number | null>(null);
  const [itemId, setItemId] = useState<number | null>(null);

  // The date is kept between saves so repeated entries don't need it retyped.
  const [dtEntry, setDtEntry] = useState(todayLocal());
  const [qtyStr, setQtyStr] = useState("");

  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const bounds = useMemo(
    () => (sortingId == null ? [] : data.bounds.filter((b) => b.sortingId === sortingId)),
    [data.bounds, sortingId]
  );
  const items = useMemo(
    () => (boundId == null ? [] : data.items.filter((i) => i.boundId === boundId)),
    [data.items, boundId]
  );
  const selectedItem = data.items.find((i) => i.id === itemId) ?? null;

  const qtyNum = qtyStr.trim() === "" ? NaN : Number(qtyStr);
  const qtyOk = Number.isFinite(qtyNum) && qtyNum > 0;
  const hasUnsavedEntry = qtyStr.trim() !== "";

  useEffect(() => {
    setDirty(hasUnsavedEntry, LEAVE_MESSAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedEntry]);

  useEffect(() => {
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Asks before discarding an unsaved quantity; the quantity is blank for every new record. */
  async function discardOk(): Promise<boolean> {
    if (!(await confirmLeave(hasUnsavedEntry, LEAVE_MESSAGE))) return false;
    setQtyStr("");
    setAttempted(false);
    setError(null);
    return true;
  }

  function onSave() {
    setAttempted(true);
    setError(null);
    if (!selectedItem || !dtEntry || !qtyOk) return;

    startTransition(async () => {
      const res = await addWithdrawal({ kind, itemId: selectedItem.id, dtEntry, qty: qtyNum });
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage(`Saved ${qtyNum} for ${selectedItem.label}.`);
      // keep the date and the filters; clear the item and quantity for the next entry
      setItemId(null);
      setQtyStr("");
      setAttempted(false);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------- left: filter ---------- */}
      <section className="panel panel-navy">
        <label className="ledger-label mb-1 block">Item sorting</label>
        <ComboBox
          options={data.sortings}
          value={sortingId}
          onChange={async (id) => {
            if (id === sortingId) return;
            if (!(await discardOk())) return;
            setSortingId(id);
            setBoundId(null);
            setItemId(null);
          }}
          placeholder="Select a sorting…"
        />

        <label className="ledger-label mb-1 mt-4 block">Item bound</label>
        <ComboBox
          options={bounds}
          value={boundId}
          onChange={async (id) => {
            if (id === boundId) return;
            if (!(await discardOk())) return;
            setBoundId(id);
            setItemId(null);
          }}
          placeholder={sortingId == null ? "Select a sorting first" : "Select a bound…"}
          disabled={sortingId == null}
        />

        <div className="mb-1 mt-4 flex items-baseline justify-between">
          <span className="ledger-label">Items</span>
          {boundId != null && <span className="text-[11px] text-ink-faint">{items.length}</span>}
        </div>
        <div className="h-[352px] overflow-y-auto rounded-sm border border-line bg-paper-raised" role="listbox" aria-label="Items">
          {boundId == null && <p className="px-3 py-3 text-sm text-ink-faint">Choose a sorting and a bound to list items.</p>}
          {boundId != null && items.length === 0 && <p className="px-3 py-3 text-sm text-ink-faint">No items in this bound.</p>}
          {items.map((i) => (
            <button
              key={i.id}
              type="button"
              role="option"
              aria-selected={i.id === itemId}
              onClick={async () => {
                if (i.id === itemId) return;
                if (!(await discardOk())) return;
                setItemId(i.id);
              }}
              className={
                "block w-full truncate border-b border-line px-3 py-2 text-left text-sm text-ink " +
                (i.id === itemId ? "bg-accent-soft" : "hover:bg-paper")
              }
            >
              {i.label}
            </button>
          ))}
        </div>
      </section>

      {/* ---------- right: data entry ---------- */}
      <section className="panel panel-green">
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">
          {kind === "daily" ? "Daily usage entry" : "Actual usage entry"}
        </h2>
        <div className="rounded-sm border border-line bg-paper-raised p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <label className="ledger-label mb-1 block">Date</label>
              <input
                type="date"
                className={attempted && !dtEntry ? "field-input-error" : "field-input"}
                value={dtEntry}
                onChange={(e) => setDtEntry(e.target.value)}
              />
            </div>
            <div>
              <label className="ledger-label mb-1 block">Item</label>
              <input
                readOnly
                tabIndex={-1}
                className={"field-input bg-paper " + (attempted && !selectedItem ? "!border-2 !border-red-500" : "")}
                value={selectedItem?.label ?? ""}
                placeholder="Select an item from the list"
              />
            </div>
            <div className="col-span-2">
              <label className="ledger-label mb-1 block">Withdrawal qty</label>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                data-enter-submit
                className={attempted && !qtyOk ? "field-input-error" : "field-input"}
                value={qtyStr}
                onChange={(e) => setQtyStr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSave();
                }}
              />
              {attempted && !qtyOk && <p className="mt-1 text-[11px] text-danger">Enter a quantity greater than zero.</p>}
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="mt-5">
            <button type="button" className="btn-primary" onClick={onSave} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </section>

      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}
