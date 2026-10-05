"use client";

import { useEffect, useState } from "react";
import { getItemHistory, getItemsByBound, type ItemHistoryRow } from "@/actions/requisitions";
import { formatDate } from "@/lib/format";
import type { Option } from "./combo-box";

export function ItemHistoryPanel({
  bounds,
  activeItemId,
  activeItemLabel,
  onPickItem,
}: {
  bounds: Option[];
  activeItemId: number | null;
  activeItemLabel: string;
  onPickItem: (itemId: number, itemLabel: string, supplierId: number | null, price: number | null) => void;
}) {
  const [boundId, setBoundId] = useState<number | null>(null);
  const [boundItems, setBoundItems] = useState<Option[]>([]);
  const [selectedBoundItemId, setSelectedBoundItemId] = useState<number | null>(null);
  const [history, setHistory] = useState<ItemHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeItemId) {
      setHistory([]);
      return;
    }
    setLoading(true);
    getItemHistory(activeItemId).then((r) => {
      setHistory(r.history);
      setLoading(false);
    });
  }, [activeItemId]);

  useEffect(() => {
    setSelectedBoundItemId(null);
    if (!boundId) {
      setBoundItems([]);
      return;
    }
    getItemsByBound(boundId).then((r) =>
      setBoundItems(r.items.map((i) => ({ id: i.id, label: i.item_name })))
    );
  }, [boundId]);

  return (
    <div className="flex h-full flex-col rounded border border-line bg-paper-raised p-4">
      <p className="ledger-label mb-3">Don&rsquo;t know the item?</p>
      <div className="mb-2">
        <label className="mb-1 block text-xs text-ink-soft">Bound</label>
        <select
          className="field-input"
          value={boundId ?? ""}
          onChange={(e) => setBoundId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value=""></option>
          {bounds.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-4">
        <label className="mb-1 block text-xs text-ink-soft">Item in this bound</label>
        <select
          className="field-input"
          disabled={!boundId}
          value={selectedBoundItemId ?? ""}
          onChange={(e) => {
            const id = Number(e.target.value);
            const opt = boundItems.find((o) => o.id === id);
            if (opt) {
              setSelectedBoundItemId(id);
              onPickItem(id, opt.label, null, null);
            }
          }}
        >
          <option value=""></option>
          {boundItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </div>

      <p className="ledger-label mb-2 border-t border-line pt-3">
        {activeItemLabel ? `History \u2014 ${activeItemLabel}` : "Purchase history"}
      </p>
      <div className="flex-1 overflow-y-auto">
        {!activeItemId ? (
          <p className="text-xs text-ink-soft">Select an item to see its purchase history.</p>
        ) : loading ? (
          <p className="text-xs text-ink-soft">Loading…</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-ink-soft">No prior purchase history.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-faint">
                <th className="pr-2 py-1 font-normal">Price</th>
                <th className="pr-2 py-1 font-normal">Supplier</th>
                <th className="pr-2 py-1 font-normal">PO date</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr
                  key={i}
                  className="cursor-pointer border-t border-line hover:bg-paper"
                  onClick={() => {
                    if (activeItemId) onPickItem(activeItemId, activeItemLabel, h.supplier_id, h.price);
                  }}
                  title="Use this supplier and price"
                >
                  <td className="pr-2 py-1 font-mono">{h.price ?? "\u2014"}</td>
                  <td className="pr-2 py-1">{h.supplier_name ?? "\u2014"}</td>
                  <td className="pr-2 py-1">{formatDate(h.po_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
