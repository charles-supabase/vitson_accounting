"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ComboBox, type Option } from "./combo-box";
import { ItemHistoryPanel } from "./item-history-panel";
import { QuickAddSupplierModal } from "./quick-add-supplier-modal";
import { QuickAddProjectModal } from "./quick-add-project-modal";
import { QuickAddItemModal } from "./quick-add-item-modal";
import {
  createRequisition,
  getItemLastDefaults,
  getItemOnHand,
  type RequisitionListRow,
} from "@/actions/requisitions";
import { formatDate } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";
import { SuccessModal } from "./success-modal";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-accent-soft text-accent",
  APPROVED: "bg-success-soft text-success",
  REJECTED: "bg-danger-soft text-danger",
};

type Row = {
  key: string;
  itemId: number | null;
  itemLabel: string;
  unitId: number | null;
  onHand: number | null;
  onHandOverall: number | null;
  baseItem: string;
  onHandRecipe: number | null;
  onHandDaily: number | null;
  qty: number | null;
  supplierId: number | null;
  itemPackaging: number | null;
  price: number | null;
  remarks: string;
  boolRush: boolean;
};

function emptyRow(): Row {
  return {
    key: Math.random().toString(36).slice(2),
    itemId: null,
    itemLabel: "",
    unitId: null,
    onHand: null,
    onHandOverall: null,
    baseItem: "",
    onHandRecipe: null,
    onHandDaily: null,
    qty: null,
    supplierId: null,
    itemPackaging: null,
    price: null,
    remarks: "",
    boolRush: false,
  };
}

function isRowComplete(r: Row) {
  return (
    !!r.itemId &&
    !!r.unitId &&
    !!r.qty &&
    r.qty > 0 &&
    !!r.supplierId &&
    !!r.itemPackaging &&
    r.price !== null
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function extractPackagingSize(label: string | undefined): number | null {
  if (!label) return null;
  const match = label.match(/\d+(\.\d+)?/);
  if (!match) return null;
  const n = parseFloat(match[0]);
  return n > 0 ? n : null;
}

export function RequisitionWorkspace({
  initialList,
  items,
  units,
  suppliers,
  packagings,
  accBooks,
  projects,
  bounds,
  shades,
}: {
  initialList: RequisitionListRow[];
  items: Option[];
  units: Option[];
  suppliers: Option[];
  packagings: Option[];
  accBooks: Option[];
  projects: Option[];
  bounds: Option[];
  shades: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [entryOpen, setEntryOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const { setDirty, confirmLeave } = useUnsavedChanges();

  const [dtRequest, setDtRequest] = useState(todayStr());
  const [accBookId, setAccBookId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [remark, setRemark] = useState("");

  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [activeKey, setActiveKey] = useState(rows[0].key);

  // Local option lists grow as suppliers/projects/items get quick-added
  const [supplierOptions, setSupplierOptions] = useState(suppliers);
  const [projectOptions, setProjectOptions] = useState(projects);
  const [itemOptions, setItemOptions] = useState(items);

  const [quickAdd, setQuickAdd] = useState<
    | { kind: "supplier"; typed: string; rowKey: string }
    | { kind: "item"; typed: string; rowKey: string }
    | { kind: "project"; typed: string }
    | null
  >(null);

  const activeRow = rows.find((r) => r.key === activeKey) ?? rows[0];

  const activePackagingLabel = packagings.find((p) => p.id === activeRow.itemPackaging)?.label;
  const activePackagingSize = extractPackagingSize(activePackagingLabel);
  const qtyPackagingWarning =
    activePackagingSize && activeRow.qty && activeRow.qty % activePackagingSize !== 0
      ? `Quantity ${activeRow.qty} isn't evenly divisible by the packaging size (${activePackagingSize}, from "${activePackagingLabel}").`
      : null;

  const hasUnsavedEntry =
    entryOpen &&
    (accBookId != null ||
      projectId != null ||
      remark.trim() !== "" ||
      rows.some(
        (r) =>
          r.itemId != null ||
          r.supplierId != null ||
          r.qty != null ||
          r.price != null ||
          r.itemPackaging != null ||
          r.unitId != null ||
          r.remarks.trim() !== "" ||
          r.boolRush
      ));

  useEffect(() => {
    setDirty(hasUnsavedEntry, "This requisition is not saved due to incomplete data. Leave anyway?");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedEntry]);

  function updateActiveRow(patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === activeRow.key ? { ...r, ...patch } : r)));
  }

  function resetEntry() {
    setDtRequest(todayStr());
    setAccBookId(null);
    setProjectId(null);
    setRemark("");
    const fresh = emptyRow();
    setRows([fresh]);
    setActiveKey(fresh.key);
    setError(null);
    setValidationAttempted(false);
  }

  async function syncDefaults(
    rowKey: string,
    itemId: number | null,
    supplierId: number | null,
    explicitPrice: number | null
  ) {
    if (!itemId) return;
    const onHandP = getItemOnHand(itemId);
    const defaultsP = supplierId
      ? getItemLastDefaults(itemId, supplierId)
      : Promise.resolve({ unitId: null, itemPackaging: null, price: null });
    const [onHandResult, defaultsResult] = await Promise.all([onHandP, defaultsP]);
    setRows((prev) =>
      prev.map((r) =>
        r.key === rowKey
          ? {
              ...r,
              onHand: onHandResult.onHand,
              onHandOverall: onHandResult.onHandOverall,
              baseItem: onHandResult.baseItem,
              onHandRecipe: onHandResult.onHandRecipe,
              onHandDaily: onHandResult.onHandDaily,
              unitId: defaultsResult.unitId ?? r.unitId,
              itemPackaging: defaultsResult.itemPackaging ?? r.itemPackaging,
              // explicit price (e.g. clicked from history) wins; otherwise fall back to the
              // price on this item's most recent requisition line with this same supplier
              price: explicitPrice ?? defaultsResult.price ?? r.price,
            }
          : r
      )
    );
  }

  function handleItemSelected(id: number | null, label: string) {
    const key = activeRow.key;
    if (id === null) {
      updateActiveRow({ itemId: null, itemLabel: "" });
      return;
    }
    updateActiveRow({ itemId: id, itemLabel: label, unitId: null, itemPackaging: null, onHand: null, onHandOverall: null, baseItem: "", onHandRecipe: null, onHandDaily: null, price: null });
    syncDefaults(key, id, activeRow.supplierId, null);
  }

  function handleSupplierSelected(id: number | null) {
    const key = activeRow.key;
    updateActiveRow({ supplierId: id, unitId: null, itemPackaging: null, price: null });
    if (id && activeRow.itemId) {
      syncDefaults(key, activeRow.itemId, id, null);
    }
  }

  function handleHistoryPick(
    itemId: number,
    itemLabel: string,
    supplierId: number | null,
    price: number | null
  ) {
    const key = activeRow.key;
    const finalSupplierId = supplierId ?? activeRow.supplierId;
    updateActiveRow({
      itemId,
      itemLabel,
      supplierId: finalSupplierId,
      unitId: null,
      itemPackaging: null,
      onHand: null,
      onHandOverall: null,
      baseItem: "",
      onHandRecipe: null,
      onHandDaily: null,
      price,
    });
    syncDefaults(key, itemId, finalSupplierId, price);
  }

  function handleAddTab() {
    if (!isRowComplete(activeRow)) {
      setValidationAttempted(true);
      setError(
        "Fill in item, unit, quantity, supplier, packaging, and price on the current line before adding another."
      );
      return;
    }
    setError(null);
    setValidationAttempted(false);
    const fresh = emptyRow();
    setRows((prev) => [...prev, fresh]);
    setActiveKey(fresh.key);
  }

  function handleRemoveTab(key: string) {
    setRows((prev) => {
      if (prev.length === 1) return prev;
      const next = prev.filter((r) => r.key !== key);
      if (activeKey === key) setActiveKey(next[0].key);
      return next;
    });
  }

  function handleSave() {
    setError(null);
    setSuccessMessage(null);

    if (!dtRequest) return setError("Request date is required.");
    if (!accBookId) {
      setValidationAttempted(true);
      return setError("Account book is required.");
    }
    if (rows.some((r) => !isRowComplete(r))) {
      setValidationAttempted(true);
      return setError("Every item line needs item, unit, quantity, supplier, packaging, and price.");
    }

    startTransition(async () => {
      const result = await createRequisition(
        { dtRequest, accBookId: accBookId!, remark, projectId },
        rows.map((r) => ({
          itemId: r.itemId!,
          unitId: r.unitId!,
          onHand: r.onHand,
          onHandRecipe: r.onHandRecipe,
          onHandDaily: r.onHandDaily,
          qty: r.qty!,
          supplierId: r.supplierId!,
          boolRush: r.boolRush,
          remarks: r.remarks,
          itemPackaging: r.itemPackaging!,
          price: r.price,
        }))
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      resetEntry();
      setEntryOpen(false);
      setSuccessMessage(`Requisition #${result.requestNo} was created successfully.`);
      router.refresh();
    });
  }

  const sortedList = useMemo(() => initialList, [initialList]);

  return (
    <div className="flex flex-col gap-4">
      {/* List */}
      <div className={"panel panel-navy " + (entryOpen ? "h-[25vh] overflow-y-auto" : "")}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-ink-soft">Requests for items, awaiting or past approval.</p>
            <p className="mt-1 flex items-center gap-4 text-[11px] text-ink-faint">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" /> every item has a purchase order
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" /> some items have a purchase order
              </span>
            </p>
          </div>
          {!entryOpen && (
            <button type="button" onClick={() => setEntryOpen(true)} className="btn-primary">
              New requisition
            </button>
          )}
        </div>
        {sortedList.length === 0 ? (
          <p className="text-sm text-ink-soft">No requisitions yet.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-line bg-paper-raised">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left ledger-label">
                  <th className="w-8 px-2 py-2 font-normal"></th>
                  <th className="px-4 py-2 font-normal">Date</th>
                  <th className="px-4 py-2 font-normal">Requisition No</th>
                  <th className="px-4 py-2 font-normal">Supplier</th>
                  <th className="px-4 py-2 font-normal">Project</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedList.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b border-line last:border-0 hover:bg-paper"
                    onClick={() => router.push(`/requisition/${r.id}`)}
                  >
                    <td className="px-2 py-2 text-center">
                      {r.lines_with_po > 0 && (
                        <span
                          className={
                            "inline-block h-2.5 w-2.5 rounded-full " +
                            (r.lines_with_po === r.total_lines ? "bg-green-500" : "bg-orange-400")
                          }
                          title={
                            r.lines_with_po === r.total_lines
                              ? "Every item has a purchase order"
                              : `${r.lines_with_po} of ${r.total_lines} items have a purchase order`
                          }
                        />
                      )}
                    </td>
                    <td className="px-4 py-2 text-ink-soft">{formatDate(r.dt_request)}</td>
                    <td className="px-4 py-2 font-mono text-ink">{r.request_no}</td>
                    <td className="px-4 py-2 text-ink-soft">
                      {r.supplier_names.length ? r.supplier_names.join(", ") : "\u2014"}
                      <span className="ml-2 text-[11px] text-ink-faint">
                        · {r.total_lines} {r.total_lines === 1 ? "item" : "items"}
                        {r.lines_with_po > 0 && r.lines_with_po < r.total_lines
                          ? `, ${r.total_lines - r.lines_with_po} waiting for a PO`
                          : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-ink-soft">{r.project_name ?? "\u2014"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-sm px-2 py-0.5 text-xs ${STATUS_STYLE[r.status] ?? ""}`}>
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {entryOpen && (
        <div className="flex h-[70vh] flex-col gap-4">
          {/* Header - 1/3 of entry area */}
          <div className="panel panel-navy h-1/3 overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">New requisition</h2>
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirmLeave(
                    hasUnsavedEntry,
                    "This requisition is not saved due to incomplete data. Close anyway?"
                  );
                  if (!ok) return;
                  resetEntry();
                  setEntryOpen(false);
                }}
                className="text-sm text-ink-soft underline hover:text-ink"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-sm text-ink-soft">Requisition No</label>
                <input className="field-input" value="" placeholder="(assigned on save)" disabled />
              </div>
              <div>
                <label className="mb-1 block text-sm text-ink-soft">Request date</label>
                <input
                  type="date"
                  className="field-input"
                  value={dtRequest}
                  onChange={(e) => setDtRequest(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-ink-soft">Account book</label>
                <select
                  className={validationAttempted && !accBookId ? "field-input-error" : "field-input"}
                  value={accBookId ?? ""}
                  onChange={(e) => setAccBookId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value=""></option>
                  {accBooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-ink-soft">Project</label>
                <ComboBox
                  options={projectOptions}
                  value={projectId}
                  onChange={setProjectId}
                  onCreateNew={(typed) => setQuickAdd({ kind: "project", typed })}
                />
              </div>
              <div className="col-span-2 sm:col-span-3 lg:col-span-5">
                <label className="mb-1 block text-sm text-ink-soft">Remark</label>
                <input className="field-input" value={remark} onChange={(e) => setRemark(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Items (2/3 width) + History (1/3 width) - remaining 2/3 of entry area */}
          <div className="flex h-2/3 gap-4">
            <div className="panel panel-green flex w-2/3 flex-col">
              <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-3">
                {rows.map((r, i) => (
                  <div
                    key={r.key}
                    className={`flex items-center gap-1 rounded-sm px-3 py-1.5 text-sm ${
                      r.key === activeKey ? "bg-ink text-paper" : "bg-paper text-ink-soft hover:text-ink"
                    } ${validationAttempted && !isRowComplete(r) ? "ring-2 ring-red-500" : ""}`}
                  >
                    <button type="button" onClick={() => setActiveKey(r.key)}>
                      {r.itemLabel || `Item ${i + 1}`}
                    </button>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTab(r.key)}
                        className="ml-1 opacity-70 hover:opacity-100"
                        aria-label="Remove line"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={handleAddTab} className="btn-secondary text-xs">
                  + Add item
                </button>
              </div>

              <div className="flex flex-1 flex-col overflow-y-auto">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="mb-1 block text-xs text-ink-soft">Item</label>
                    <ComboBox
                      options={itemOptions}
                      value={activeRow.itemId}
                      inputClassName={validationAttempted && !activeRow.itemId ? "field-input-error" : "field-input"}
                      onChange={(id) => {
                        const opt = itemOptions.find((o) => o.id === id);
                        handleItemSelected(id, opt?.label ?? "");
                      }}
                      onCreateNew={(typed) => setQuickAdd({ kind: "item", typed, rowKey: activeRow.key })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-ink-soft">Supplier</label>
                    <ComboBox
                      options={supplierOptions}
                      value={activeRow.supplierId}
                      inputClassName={
                        validationAttempted && !activeRow.supplierId ? "field-input-error" : "field-input"
                      }
                      onChange={handleSupplierSelected}
                      onCreateNew={(typed) =>
                        setQuickAdd({ kind: "supplier", typed, rowKey: activeRow.key })
                      }
                    />
                  </div>
                </div>

                {/* qty, unit, packaging and the on-hand box share one row */}
                <div className="mt-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                  <div >
                    <label className="mb-1 block text-xs text-ink-soft">Qty requested</label>
                    <input
                      type="number"
                      className={
                        validationAttempted && !(activeRow.qty && activeRow.qty > 0)
                          ? "field-input-error"
                          : qtyPackagingWarning
                          ? "field-input-warn"
                          : "field-input"
                      }
                      value={activeRow.qty ?? ""}
                      onChange={(e) =>
                        updateActiveRow({ qty: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                    {qtyPackagingWarning && (
                      <p className="mt-1 text-xs text-orange-600">{qtyPackagingWarning}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-ink-soft">Unit</label>
                    <select
                      className={validationAttempted && !activeRow.unitId ? "field-input-error" : "field-input"}
                      value={activeRow.unitId ?? ""}
                      onChange={(e) =>
                        updateActiveRow({ unitId: e.target.value ? Number(e.target.value) : null })
                      }
                    >
                      <option value=""></option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-ink-soft">Packaging</label>
                    <select
                      className={
                        validationAttempted && !activeRow.itemPackaging ? "field-input-error" : "field-input"
                      }
                      value={activeRow.itemPackaging ?? ""}
                      onChange={(e) =>
                        updateActiveRow({
                          itemPackaging: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    >
                      <option value=""></option>
                      {packagings.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                    </div>
                    <div className="grid grid-cols-3 items-end gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-ink-soft">Price</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      className={
                        validationAttempted && activeRow.price === null ? "field-input-error" : "field-input"
                      }
                      value={activeRow.price ?? ""}
                      onChange={(e) =>
                        updateActiveRow({ price: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                    {!activeRow.supplierId && activeRow.itemId && (
                      <p className="mt-1 text-xs text-ink-faint">Pick a supplier to pull its last price.</p>
                    )}
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-xs text-ink">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={activeRow.boolRush}
                        onChange={(e) => updateActiveRow({ boolRush: e.target.checked })}
                      />
                      Rush
                    </label>
                  </div>
                    </div>
                    <div className="max-w-[20rem]">
                  <div >
                    <label className="mb-1 block text-xs text-ink-soft">Remarks</label>
                    <input
                      className="field-input"
                      value={activeRow.remarks}
                      onChange={(e) => updateActiveRow({ remarks: e.target.value })}
                    />
                  </div>
                    </div>
                  </div>
                  <div className="w-48 shrink-0 space-y-3 rounded border border-green-300 bg-green-100 p-3">
                    <div>
                      <label className="mb-1 block text-xs text-ink-soft">On hand</label>
                      <input
                        className="field-input bg-white/70 font-mono"
                        value={activeRow.onHand ?? (activeRow.itemId ? "0" : "")}
                        disabled
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-ink-soft">
                        On hand (overall)
                        {activeRow.baseItem ? <span className="ml-1 font-semibold">· base: {activeRow.baseItem}</span> : null}
                      </label>
                      <input
                        className="field-input bg-white/70 font-mono"
                        value={activeRow.onHandOverall ?? (activeRow.itemId ? "0" : "")}
                        disabled
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-ink-soft">On hand (recipe)</label>
                      <input
                        className="field-input bg-white/70 font-mono"
                        value={activeRow.onHandRecipe ?? (activeRow.itemId ? "0" : "")}
                        disabled
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-ink-soft">On hand (daily)</label>
                      <input
                        className="field-input bg-white/70 font-mono"
                        value={activeRow.onHandDaily ?? (activeRow.itemId ? "0" : "")}
                        disabled
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="panel panel-slate w-1/3 overflow-y-auto">
              <ItemHistoryPanel
                bounds={bounds}
                activeItemId={activeRow.itemId}
                activeItemLabel={activeRow.itemLabel}
                onPickItem={handleHistoryPick}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <button type="button" onClick={handleSave} className="btn-primary self-start" disabled={isPending}>
            {isPending ? "Saving\u2026" : "Save requisition"}
          </button>
        </div>
      )}

      {successMessage && (
        <SuccessModal message={successMessage} onClose={() => setSuccessMessage(null)} />
      )}

      {quickAdd?.kind === "supplier" && (
        <QuickAddSupplierModal
          initialName={quickAdd.typed}
          onClose={() => setQuickAdd(null)}
          onCreated={(id, name) => {
            setSupplierOptions((prev) => [...prev, { id, label: name }]);
            const row = rows.find((r) => r.key === quickAdd.rowKey);
            setRows((prev) =>
              prev.map((r) => (r.key === quickAdd.rowKey ? { ...r, supplierId: id } : r))
            );
            if (row?.itemId) syncDefaults(quickAdd.rowKey, row.itemId, id, null);
            setQuickAdd(null);
          }}
        />
      )}
      {quickAdd?.kind === "project" && (
        <QuickAddProjectModal
          initialName={quickAdd.typed}
          onClose={() => setQuickAdd(null)}
          onCreated={(id, name) => {
            setProjectOptions((prev) => [...prev, { id, label: name }]);
            setProjectId(id);
            setQuickAdd(null);
          }}
        />
      )}
      {quickAdd?.kind === "item" && (
        <QuickAddItemModal
          initialName={quickAdd.typed}
          bounds={bounds}
          shades={shades}
          onClose={() => setQuickAdd(null)}
          onCreated={(id, name) => {
            setItemOptions((prev) => [...prev, { id, label: name }]);
            handleItemSelected(id, name);
            setQuickAdd(null);
          }}
        />
      )}
    </div>
  );
}
