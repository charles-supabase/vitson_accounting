"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComboBox } from "./combo-box";
import { monthLabel } from "@/lib/inventory-format";

export function ApFilters({
  suppliers,
  initialSupplierId,
  initialYear,
  initialMonth,
  defaultYear,
}: {
  suppliers: { id: number; label: string }[];
  initialSupplierId: number | null;
  initialYear: string;
  initialMonth: string;
  defaultYear: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState<number | null>(initialSupplierId);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [error, setError] = useState<string | null>(null);

  function apply() {
    const y = year.trim();
    if (y !== "" && !(Number.isInteger(Number(y)) && Number(y) >= 2000 && Number(y) <= 2099)) {
      setError("Enter a valid year.");
      return;
    }
    setError(null);
    const qs = new URLSearchParams();
    if (supplierId != null) qs.set("supplier", String(supplierId));
    if (y !== "") {
      qs.set("year", y);
      if (month !== "") qs.set("month", month);
    } else {
      qs.set("year", "all");
    }
    router.push(qs.toString() ? `?${qs.toString()}` : "?");
  }

  function clear() {
    setSupplierId(null);
    setYear(defaultYear);
    setMonth("");
    setError(null);
    router.push("?");
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-72 max-w-full">
        <label className="ledger-label mb-1 block">Supplier</label>
        <ComboBox
          options={suppliers}
          value={supplierId}
          onChange={setSupplierId}
          placeholder={suppliers.length === 0 ? "Nothing is owed" : "All suppliers"}
          disabled={suppliers.length === 0}
        />
      </div>
      <div>
        <label className="ledger-label mb-1 block">Due year</label>
        <input
          type="number"
          inputMode="numeric"
          min="2000"
          max="2099"
          data-enter-submit
          className={(error ? "field-input-error" : "field-input") + " !w-24"}
          value={year}
          placeholder="All years"
          onChange={(e) => setYear(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      </div>
      <div>
        <label className="ledger-label mb-1 block">Due month</label>
        <select
          className="field-input !w-40"
          value={month}
          disabled={year.trim() === ""}
          onChange={(e) => setMonth(e.target.value)}
        >
          <option value="">Whole year</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {monthLabel(2000, i + 1).split(" ")[0]}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="btn-primary" onClick={apply}>
        Filter
      </button>
      <button type="button" className="btn-secondary" onClick={clear}>
        Clear
      </button>
      {error && <span className="pb-2 text-sm text-danger">{error}</span>}
    </div>
  );
}
