"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelFollowUpLine,
  createPurchaseOrders,
  getRequisitionLinesForPO,
  type ApprovedRequisitionOption,
  type FollowUpRow,
  type POSource,
  type PurchaseOrderListRow,
} from "@/actions/purchase-orders";
import type { Option } from "./combo-box";
import { addDays, formatDate } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";
import { SuccessModal } from "./success-modal";
import { ConfirmModal } from "./confirm-modal";

type DraftLine = {
  detailId: number;
  itemName: string;
  unitName: string;
  packagingName: string | null;
  requestedQty: number;
  qty: number | null;
  price: number | null;
  discount: number;
  remarks: string;
  include: boolean;
};

type Draft = {
  key: string;
  supplierId: number;
  supplierName: string;
  boundId: number | null;
  boundLocked: boolean;
  dtPo: string;
  dtDelivery: string;
  terms: number | null;
  attention: string;
  destination: string;
  accCategoryId: number | null;
  accBookId: number | null;
  accSortingId: number | null;
  boolPettyCash: boolean;
  deliveryAuto: boolean;
  lines: DraftLine[];
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function localDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtQty(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function lineTotal(l: DraftLine) {
  if (l.qty == null || l.price == null) return 0;
  return l.qty * l.price * (1 - l.discount / 100);
}

function lineValid(l: DraftLine) {
  return (
    !!l.qty && l.qty > 0 && l.price != null && l.price >= 0 && l.discount >= 0 && l.discount <= 100
  );
}

function draftHasLines(d: Draft) {
  return d.lines.some((l) => l.include);
}

function draftValid(d: Draft) {
  if (!draftHasLines(d)) return true; // an emptied draft is simply skipped
  return (
    !!d.dtPo &&
    !!d.dtDelivery &&
    d.dtDelivery > d.dtPo &&
    !!d.boundId &&
    !!d.accSortingId &&
    d.lines.every((l) => !l.include || lineValid(l))
  );
}

function buildDrafts(source: POSource): { drafts: Draft[]; skippedNoSupplier: number } {
  const groups = new Map<string, Draft>();
  let skippedNoSupplier = 0;

  for (const l of source.lines) {
    if (!l.supplierId) {
      skippedNoSupplier += 1;
      continue;
    }
    const key = `${l.supplierId}|${l.itemBoundId ?? 0}`;
    let draft = groups.get(key);
    if (!draft) {
      draft = {
        key,
        supplierId: l.supplierId,
        supplierName: l.supplierName ?? `Supplier #${l.supplierId}`,
        boundId: l.itemBoundId,
        boundLocked: l.itemBoundId !== null,
        dtPo: todayStr(),
        dtDelivery: addDays(todayStr(), 3),
        deliveryAuto: true,
        terms: null,
        attention: l.supplierContact ?? "",
        destination: "",
        accCategoryId: l.supplierAccCategoryId,
        accBookId: source.accBookId,
        accSortingId: null,
        boolPettyCash: false,
        lines: [],
      };
      groups.set(key, draft);
    }
    draft.lines.push({
      detailId: l.detailId,
      itemName: l.itemName,
      unitName: l.unitName,
      packagingName: l.packagingName,
      requestedQty: l.qty,
      qty: l.qty,
      price: l.price,
      discount: 0,
      remarks: l.remarks ?? "",
      include: true,
    });
  }

  const drafts = Array.from(groups.values()).sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  return { drafts, skippedNoSupplier };
}

export function PoWorkspace({
  initialList,
  followUp,
  approvedRequisitions,
  accBooks,
  accCategories,
  accSortings,
  bounds,
}: {
  initialList: PurchaseOrderListRow[];
  followUp: FollowUpRow[];
  approvedRequisitions: ApprovedRequisitionOption[];
  accBooks: Option[];
  accCategories: Option[];
  accSortings: Option[];
  bounds: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [entryOpen, setEntryOpen] = useState(false);
  const [requisitionId, setRequisitionId] = useState<number | null>(null);
  const [selectedReqId, setSelectedReqId] = useState<number | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [skippedNoSupplier, setSkippedNoSupplier] = useState(0);

  const [validationAttempted, setValidationAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FollowUpRow | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const { setDirty, confirmLeave } = useUnsavedChanges();

  const boundLabel = (id: number | null) => bounds.find((b) => b.id === id)?.label ?? "no bound";
  const activeDraft = drafts.find((d) => d.key === activeKey) ?? drafts[0] ?? null;

  const hasUnsavedEntry = entryOpen && requisitionId != null;

  useEffect(() => {
    setDirty(hasUnsavedEntry, "This purchase order is not saved due to incomplete data. Leave anyway?");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsavedEntry]);

  function resetEntry() {
    setRequisitionId(null);
    setDrafts([]);
    setActiveKey(null);
    setSkippedNoSupplier(0);
    setValidationAttempted(false);
    setError(null);
  }

  async function handleRequisitionChosen(idRaw: string) {
    setError(null);
    setValidationAttempted(false);
    if (!idRaw) return resetEntry();

    const id = Number(idRaw);
    setRequisitionId(id);
    setLoadingLines(true);
    const result = await getRequisitionLinesForPO(id);
    setLoadingLines(false);

    if (result.error || !result.source) {
      setDrafts([]);
      setActiveKey(null);
      setError(result.error ?? "Could not load that requisition.");
      return;
    }
    const built = buildDrafts(result.source);
    setDrafts(built.drafts);
    setActiveKey(built.drafts[0]?.key ?? null);
    setSkippedNoSupplier(built.skippedNoSupplier);
  }

  /** Opens the builder; a requisition picked in the left list is chosen automatically. */
  function openNewPo() {
    setEntryOpen(true);
    if (selectedReqId != null && approvedRequisitions.some((r) => r.id === selectedReqId)) {
      void handleRequisitionChosen(String(selectedReqId));
    }
  }

  function updateDraft(key: string, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  function updateLine(draftKey: string, detailId: number, patch: Partial<DraftLine>) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.key === draftKey
          ? { ...d, lines: d.lines.map((l) => (l.detailId === detailId ? { ...l, ...patch } : l)) }
          : d
      )
    );
  }

  function handleSave() {
    setError(null);
    setSuccessMessage(null);

    if (!requisitionId) return setError("Choose an approved requisition first.");
    if (!drafts.some(draftHasLines)) return setError("Include at least one line to create a purchase order.");
    if (drafts.some((d) => !draftValid(d))) {
      setValidationAttempted(true);
      return setError(
        "Some purchase orders are incomplete. Each needs a PO date, an expected delivery date, a bound, and a valid quantity and price on every included line."
      );
    }

    const payload = drafts
      .filter(draftHasLines)
      .map((d) => ({
        supplierId: d.supplierId,
        boundId: d.boundId!,
        dtPo: d.dtPo,
        dtDelivery: d.dtDelivery,
        terms: d.terms,
        attention: d.attention,
        destination: d.destination,
        accCategoryId: d.accCategoryId,
        accBookId: d.accBookId,
        accSortingId: d.accSortingId,
        boolPettyCash: d.boolPettyCash,
        lines: d.lines
          .filter((l) => l.include)
          .map((l) => ({
            requisitionDetailId: l.detailId,
            qty: l.qty!,
            price: l.price!,
            discount: l.discount,
            remarks: l.remarks,
          })),
      }));

    startTransition(async () => {
      const result = await createPurchaseOrders(requisitionId, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      const created = result.created ?? [];
      const label =
        created.length === 1
          ? `Purchase order #${created[0].poNo} was created successfully.`
          : `${created.length} purchase orders were created successfully (#${created
              .map((c) => c.poNo)
              .join(", #")}).`;
      resetEntry();
      setSelectedReqId(null);
      setEntryOpen(false);
      setSuccessMessage(label);
      router.refresh();
    });
  }

  function confirmCancelLine() {
    const target = cancelTarget;
    if (!target) return;
    setCancelTarget(null);
    setCancelError(null);
    startTransition(async () => {
      const res = await cancelFollowUpLine(target.detailId, localDateStr());
      if (res.error) {
        setCancelError(res.error);
        return;
      }
      setSuccessMessage("This item is cancelled and will not be received.");
      router.refresh();
    });
  }

  const readyCount = drafts.filter(draftHasLines).length;
  const saveLabel =
    readyCount === 0 ? "Create purchase orders" : `Create ${readyCount} purchase order${readyCount === 1 ? "" : "s"}`;

  const errorClass = (bad: boolean) => (validationAttempted && bad ? "field-input-error" : "field-input");

  return (
    <div className="flex flex-col gap-4">
      {/* Requisitions waiting for a PO + PO list */}
      <div className={"grid gap-4 lg:grid-cols-[22rem_1fr] " + (entryOpen ? "h-[25vh]" : "")}>
        <section className="panel panel-burgundy flex min-h-0 flex-col">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="ledger-label">Requisitions without a PO ({approvedRequisitions.length})</span>
            {selectedReqId != null && (
              <button type="button" className="text-[11px] text-ink-soft underline hover:text-ink" onClick={() => setSelectedReqId(null)}>
                Clear
              </button>
            )}
          </div>
          <div
            className={"overflow-y-auto rounded-sm border border-line bg-paper-raised " + (entryOpen ? "min-h-0 flex-1" : "h-[260px]")}
            role="listbox"
            aria-label="Requisitions without a purchase order"
          >
            {approvedRequisitions.length === 0 && (
              <p className="px-3 py-3 text-sm text-ink-faint">Every approved requisition already has a purchase order.</p>
            )}
            {approvedRequisitions.map((r) => {
              const active = r.id === selectedReqId;
              const supplierText = r.supplier_names.length ? r.supplier_names.join(", ") : "no supplier yet";
              return (
                <button
                  key={r.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedReqId(active ? null : r.id)}
                  onDoubleClick={() => {
                    setSelectedReqId(r.id);
                    setEntryOpen(true);
                    void handleRequisitionChosen(String(r.id));
                  }}
                  title="Double-click to create a purchase order from this requisition"
                  className={"block w-full border-b border-line px-3 py-2 text-left " + (active ? "bg-accent-soft" : "hover:bg-paper")}
                >
                  <span className="block truncate text-sm text-ink">
                    <span className="font-mono">#{r.request_no}</span> · {supplierText}
                  </span>
                  <span className="block truncate text-[11px] text-ink-soft">
                    {formatDate(r.dt_request)}
                    {r.project_name ? ` · ${r.project_name}` : ""} · {r.pending_lines} {r.pending_lines === 1 ? "item" : "items"} waiting
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className={"panel panel-navy " + (entryOpen ? "overflow-y-auto" : "")}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-ink-soft">Purchase orders created from approved requisitions.</p>
            <p className="mt-1 flex items-center gap-4 text-[11px] text-ink-faint">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-400" /> printed
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" /> printed and emailed
              </span>
            </p>
          </div>
          {!entryOpen && (
            <button type="button" onClick={openNewPo} className="btn-primary">
              New purchase order
            </button>
          )}
        </div>

        {initialList.length === 0 ? (
          <p className="text-sm text-ink-soft">No purchase orders yet.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-line bg-paper-raised">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left ledger-label">
                  <th className="w-8 px-4 py-2 font-normal"></th>
                  <th className="px-4 py-2 font-normal">Date</th>
                  <th className="px-4 py-2 font-normal">PO No</th>
                  <th className="px-4 py-2 font-normal">Supplier</th>
                  <th className="px-4 py-2 font-normal">Bound</th>
                  <th className="px-4 py-2 font-normal">Requisition</th>
                  <th className="px-4 py-2 font-normal">Expected delivery</th>
                  <th className="px-4 py-2 text-right font-normal">Lines</th>
                  <th className="px-4 py-2 text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody>
                {initialList.map((r) => {
                  const printed = !!r.printed_at;
                  const emailed = !!r.emailed_at;
                  const dotTitle = emailed
                    ? `Printed and emailed`
                    : printed
                    ? `Printed, not yet emailed`
                    : undefined;
                  const dotClass = emailed && printed ? "bg-blue-500" : printed ? "bg-orange-400" : "";
                  return (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b border-line last:border-0 hover:bg-paper"
                      onClick={() => router.push(`/purchase-order/${r.id}`)}
                    >
                      <td className="px-4 py-2">
                        {dotClass && (
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass}`}
                            title={dotTitle}
                            aria-label={dotTitle}
                          />
                        )}
                      </td>
                      <td className="px-4 py-2 text-ink-soft">{formatDate(r.dt_po)}</td>
                      <td className="px-4 py-2 font-mono text-ink">{r.po_no}</td>
                      <td className="px-4 py-2 text-ink">{r.supplier_name ?? "\u2014"}</td>
                      <td className="px-4 py-2 text-ink-soft">{r.bound_name ?? "\u2014"}</td>
                      <td className="px-4 py-2 font-mono text-ink-soft">{r.requisition_no ?? "\u2014"}</td>
                      <td className="px-4 py-2 text-ink-soft">{formatDate(r.dt_delivery)}</td>
                      <td className="px-4 py-2 text-right font-mono text-ink-soft">{r.line_count}</td>
                      <td className="px-4 py-2 text-right font-mono text-ink">{fmt(r.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      {/* Builder */}
      {entryOpen && (
        <div className="panel panel-green flex h-[70vh] flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4 rounded border border-line bg-paper-raised p-4">
            <div className="min-w-[20rem] flex-1">
              <label className="mb-1 block text-sm text-ink-soft">Approved requisition</label>
              <select
                className="field-input"
                value={requisitionId ?? ""}
                onChange={(e) => handleRequisitionChosen(e.target.value)}
              >
                <option value=""></option>
                {approvedRequisitions.map((r) => {
                  const supplierText = r.supplier_names.length ? r.supplier_names.join(", ") : "no supplier yet";
                  return (
                    <option key={r.id} value={r.id}>
                      {`${formatDate(r.dt_request)} · ${supplierText} · #${r.request_no}${
                        r.project_name ? ` · ${r.project_name}` : ""
                      } · ${r.pending_lines} ${r.pending_lines === 1 ? "item" : "items"} waiting`}
                    </option>
                  );
                })}
              </select>
              {approvedRequisitions.length === 0 && (
                <p className="mt-1 text-xs text-ink-soft">
                  No approved requisitions have lines waiting for a purchase order.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={async () => {
                const ok = await confirmLeave(
                  hasUnsavedEntry,
                  "This purchase order is not saved due to incomplete data. Close anyway?"
                );
                if (!ok) return;
                resetEntry();
                setEntryOpen(false);
              }}
              className="pb-2 text-sm text-ink-soft underline hover:text-ink"
            >
              Close
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded border border-line bg-paper-raised p-4">
            {loadingLines ? (
              <p className="text-sm text-ink-soft">Loading lines…</p>
            ) : !requisitionId ? (
              <p className="text-sm text-ink-soft">
                Choose a requisition. Its approved lines are split into one purchase order per supplier and
                bound.
              </p>
            ) : drafts.length === 0 ? (
              <p className="text-sm text-ink-soft">This requisition has no orderable lines left.</p>
            ) : (
              <>
                {skippedNoSupplier > 0 && (
                  <p className="mb-3 rounded-sm bg-accent-soft px-3 py-2 text-xs text-accent">
                    {skippedNoSupplier} line{skippedNoSupplier === 1 ? "" : "s"} on this requisition{" "}
                    {skippedNoSupplier === 1 ? "has" : "have"} no supplier, so {skippedNoSupplier === 1 ? "it" : "they"}{" "}
                    can&rsquo;t be ordered yet.
                  </p>
                )}

                <div className="mb-4 flex flex-wrap gap-2 border-b border-line pb-3">
                  {drafts.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setActiveKey(d.key)}
                      className={`rounded-sm px-3 py-1.5 text-sm ${
                        d.key === activeDraft?.key ? "bg-ink text-paper" : "bg-paper text-ink-soft hover:text-ink"
                      } ${validationAttempted && !draftValid(d) ? "ring-2 ring-red-500" : ""} ${
                        !draftHasLines(d) ? "opacity-50" : ""
                      }`}
                    >
                      {`${d.supplierName} · ${boundLabel(d.boundId)}`}
                    </button>
                  ))}
                </div>

                {activeDraft && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-xs text-ink-soft">PO No</label>
                        <input className="field-input" value="" placeholder="(assigned on save)" disabled />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-soft">PO date</label>
                        <input
                          type="date"
                          className={errorClass(!activeDraft.dtPo)}
                          value={activeDraft.dtPo}
                          onChange={(e) => {
                            const dtPo = e.target.value;
                            updateDraft(activeDraft.key, {
                              dtPo,
                              dtDelivery: activeDraft.deliveryAuto ? addDays(dtPo, 3) : activeDraft.dtDelivery,
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-soft">Expected delivery</label>
                        <input
                          type="date"
                          className={errorClass(!activeDraft.dtDelivery || activeDraft.dtDelivery <= activeDraft.dtPo)}
                          value={activeDraft.dtDelivery}
                          onChange={(e) =>
                            updateDraft(activeDraft.key, { dtDelivery: e.target.value, deliveryAuto: false })
                          }
                        />
                        {activeDraft.dtDelivery && activeDraft.dtDelivery <= activeDraft.dtPo && (
                          <p className="mt-1 text-xs text-red-600">Must be after the PO date.</p>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-soft">Terms (days)</label>
                        <input
                          type="number"
                          className="field-input"
                          value={activeDraft.terms ?? ""}
                          onChange={(e) =>
                            updateDraft(activeDraft.key, {
                              terms: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-soft">Supplier</label>
                        <input className="field-input" value={activeDraft.supplierName} disabled />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-soft">Bound</label>
                        {activeDraft.boundLocked ? (
                          <input className="field-input" value={boundLabel(activeDraft.boundId)} disabled />
                        ) : (
                          <select
                            className={errorClass(!activeDraft.boundId)}
                            value={activeDraft.boundId ?? ""}
                            onChange={(e) =>
                              updateDraft(activeDraft.key, {
                                boundId: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                          >
                            <option value=""></option>
                            {bounds.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-soft">Attention</label>
                        <input
                          className="field-input"
                          value={activeDraft.attention}
                          onChange={(e) => updateDraft(activeDraft.key, { attention: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-soft">Destination</label>
                        <input
                          className="field-input"
                          value={activeDraft.destination}
                          onChange={(e) => updateDraft(activeDraft.key, { destination: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-soft">Account category</label>
                        <select
                          className="field-input"
                          value={activeDraft.accCategoryId ?? ""}
                          onChange={(e) =>
                            updateDraft(activeDraft.key, {
                              accCategoryId: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        >
                          <option value=""></option>
                          {accCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-ink-soft">Account book</label>
                        <select
                          className="field-input"
                          value={activeDraft.accBookId ?? ""}
                          onChange={(e) =>
                            updateDraft(activeDraft.key, {
                              accBookId: e.target.value ? Number(e.target.value) : null,
                            })
                          }
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
                        <label className="mb-1 block text-xs text-ink-soft">Account sorting</label>
                        <select
                          className={errorClass(!activeDraft.accSortingId)}
                          value={activeDraft.accSortingId ?? ""}
                          onChange={(e) =>
                            updateDraft(activeDraft.key, {
                              accSortingId: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        >
                          <option value=""></option>
                          {accSortings.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 text-sm text-ink" title="Received items are booked under SM PETTY CASH">
                          <input
                            type="checkbox"
                            checked={activeDraft.boolPettyCash}
                            onChange={(e) => updateDraft(activeDraft.key, { boolPettyCash: e.target.checked })}
                          />
                          Petty cash (SM PETTY CASH)
                        </label>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded border border-line">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-line text-left ledger-label">
                            <th className="px-3 py-2 font-normal">Order</th>
                            <th className="px-3 py-2 font-normal">Item</th>
                            <th className="px-3 py-2 font-normal">Unit</th>
                            <th className="px-3 py-2 text-right font-normal">Requested</th>
                            <th className="px-3 py-2 font-normal">Qty</th>
                            <th className="px-3 py-2 font-normal">Price</th>
                            <th className="px-3 py-2 font-normal">Disc %</th>
                            <th className="px-3 py-2 text-right font-normal">Total</th>
                            <th className="px-3 py-2 font-normal">Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeDraft.lines.map((l) => (
                            <tr
                              key={l.detailId}
                              className={`border-b border-line last:border-0 ${l.include ? "" : "opacity-50"}`}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={l.include}
                                  onChange={(e) =>
                                    updateLine(activeDraft.key, l.detailId, { include: e.target.checked })
                                  }
                                  aria-label="Include this line on the purchase order"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-ink">{l.itemName}</span>
                                {l.packagingName && (
                                  <span className="block text-xs text-ink-faint">{l.packagingName}</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-ink-soft">{l.unitName}</td>
                              <td className="px-3 py-2 text-right font-mono text-ink-soft">{l.requestedQty}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  className={`${errorClass(l.include && !(l.qty && l.qty > 0))} w-24`}
                                  value={l.qty ?? ""}
                                  onChange={(e) =>
                                    updateLine(activeDraft.key, l.detailId, {
                                      qty: e.target.value ? Number(e.target.value) : null,
                                    })
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  className={`${errorClass(l.include && (l.price == null || l.price < 0))} w-28`}
                                  value={l.price ?? ""}
                                  onChange={(e) =>
                                    updateLine(activeDraft.key, l.detailId, {
                                      price: e.target.value ? Number(e.target.value) : null,
                                    })
                                  }
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  className={`${errorClass(l.include && (l.discount < 0 || l.discount > 100))} w-20`}
                                  value={l.discount}
                                  onChange={(e) =>
                                    updateLine(activeDraft.key, l.detailId, {
                                      discount: e.target.value ? Number(e.target.value) : 0,
                                    })
                                  }
                                />
                              </td>
                              <td className="px-3 py-2 text-right font-mono text-ink">
                                {l.include ? fmt(lineTotal(l)) : "\u2014"}
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="field-input"
                                  value={l.remarks}
                                  onChange={(e) =>
                                    updateLine(activeDraft.key, l.detailId, { remarks: e.target.value })
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-line">
                            <td colSpan={7} className="px-3 py-2 text-right text-xs text-ink-soft">
                              Total for this purchase order
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-medium text-ink">
                              {fmt(activeDraft.lines.filter((l) => l.include).reduce((s, l) => s + lineTotal(l), 0))}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {error && (
            <p className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="btn-primary self-start"
            disabled={isPending || drafts.length === 0}
          >
            {isPending ? "Creating…" : saveLabel}
          </button>
        </div>
      )}

      {/* Follow-up: PO lines still waiting to be received */}
      <div className="panel panel-slate mt-4">
        <div className="mb-2">
          <h2 className="font-display text-lg font-semibold text-ink">Follow-Up ({followUp.length})</h2>
        </div>

        {cancelError && (
          <p className="mb-2 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {cancelError}
          </p>
        )}

        {followUp.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing is waiting to be received.</p>
        ) : (
          <div className="max-h-[40vh] overflow-auto rounded border border-line bg-paper-raised">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-paper-raised">
                <tr className="border-b border-line text-left ledger-label">
                  <th className="px-4 py-2 font-normal">PO date</th>
                  <th className="px-4 py-2 font-normal">PO No</th>
                  <th className="px-4 py-2 font-normal">Supplier</th>
                  <th className="px-4 py-2 font-normal">Item</th>
                  <th className="px-4 py-2 text-right font-normal">Qty</th>
                  <th className="px-4 py-2 font-normal">Unit</th>
                  <th className="px-4 py-2 font-normal">Expected delivery</th>
                  <th className="px-4 py-2 font-normal">Remarks</th>
                  <th className="px-4 py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {followUp.map((f) => (
                  <tr key={f.detailId} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 text-ink-soft">{formatDate(f.dtPo)}</td>
                    <td className="px-4 py-2 font-mono text-ink">{f.poNo}</td>
                    <td className="px-4 py-2 text-ink">{f.supplierName ?? "\u2014"}</td>
                    <td className="px-4 py-2 text-ink">{f.itemName}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink">{fmtQty(f.qty)}</td>
                    <td className="px-4 py-2 text-ink-soft">{f.unitName}</td>
                    <td className="px-4 py-2 text-ink-soft">{formatDate(f.dtDelivery)}</td>
                    <td className="px-4 py-2 text-ink-soft">{f.remarks ?? "\u2014"}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="btn-secondary !px-3 !py-1 border-danger text-danger hover:bg-danger-soft"
                        onClick={() => {
                          setCancelError(null);
                          setCancelTarget(f);
                        }}
                        disabled={isPending}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {cancelTarget && (
        <ConfirmModal
          danger
          message={`Cancel ${cancelTarget.itemName} (${fmtQty(cancelTarget.qty)} ${cancelTarget.unitName}) on PO #${cancelTarget.poNo}? The full quantity will be marked cancelled and will not be received.`}
          confirmLabel="Cancel item"
          cancelLabel="Keep"
          onConfirm={confirmCancelLine}
          onCancel={() => setCancelTarget(null)}
        />
      )}

      {successMessage && (
        <SuccessModal message={successMessage} onClose={() => setSuccessMessage(null)} />
      )}
    </div>
  );
}
