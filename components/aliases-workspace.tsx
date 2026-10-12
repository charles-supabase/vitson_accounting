"use client";

import { useEffect, useMemo, useState } from "react";
import { ComboBox } from "./combo-box";
import { SuccessModal } from "./success-modal";
import { listAliases, saveAlias, type AliasRow } from "@/actions/aliases";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

const LEAVE_MESSAGE = "This alias is not saved. If you leave, the changes will be discarded. Leave anyway?";

export function AliasesWorkspace({
  customers,
  initialAliases,
  initialError,
}: {
  customers: { no: number; name: string }[];
  initialAliases: AliasRow[];
  initialError: string | null;
}) {
  const { setDirty, confirmLeave } = useUnsavedChanges();

  const [aliases, setAliases] = useState<AliasRow[]>(initialAliases);
  const [listError, setListError] = useState<string | null>(initialError);

  // entry form: a new alias (editId null) or the selected one
  const [editId, setEditId] = useState<number | null>(null);
  const [aliasName, setAliasName] = useState("");
  const [tin, setTin] = useState("");
  const [selectedNos, setSelectedNos] = useState<number[]>([]);
  const [baseline, setBaseline] = useState("");
  const [custSearch, setCustSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // list filter: show only the aliases linked to this customer
  const [filterCustomerNo, setFilterCustomerNo] = useState<number | null>(null);

  const customerName = useMemo(() => new Map(customers.map((c) => [c.no, c.name])), [customers]);
  const nameOf = (no: number) => customerName.get(no) ?? `Customer ${no}`;

  const snap = (n: string, t: string, nos: number[]) => [n.trim(), t.trim(), [...nos].sort((a, b) => a - b).join(",")].join("|");
  const current = snap(aliasName, tin, selectedNos);
  const hasUnsaved = editId == null ? aliasName.trim() !== "" || tin.trim() !== "" || selectedNos.length > 0 : current !== baseline;

  useEffect(() => {
    setDirty(hasUnsaved, LEAVE_MESSAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsaved]);
  useEffect(() => {
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(
    () => (filterCustomerNo == null ? aliases : aliases.filter((a) => a.customerNos.includes(filterCustomerNo))),
    [aliases, filterCustomerNo],
  );
  const listTitle =
    filterCustomerNo == null ? `All aliases (${shown.length})` : `Aliases linked to ${nameOf(filterCustomerNo)} (${shown.length})`;

  const visibleCustomers = useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    return q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
  }, [customers, custSearch]);

  function loadForm(a: AliasRow | null) {
    const n = a?.aliasName ?? "";
    const t = a?.tinNumber ?? "";
    const nos = a?.customerNos ?? [];
    setEditId(a?.id ?? null);
    setAliasName(n);
    setTin(t);
    setSelectedNos(nos);
    setBaseline(snap(n, t, nos));
    setCustSearch("");
    setError(null);
  }

  async function onSelectAlias(a: AliasRow) {
    if (a.id === editId) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    loadForm(a);
  }

  async function onNew() {
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    loadForm(null);
  }

  function toggleCustomer(no: number) {
    setSelectedNos((cur) => (cur.includes(no) ? cur.filter((x) => x !== no) : [...cur, no]));
  }

  async function onSave() {
    setError(null);
    setBusy(true);
    const wasNew = editId == null;
    const res = await saveAlias({ id: editId, aliasName, tinNumber: tin, customerNos: selectedNos });
    if (res.error || res.id == null) {
      setBusy(false);
      setError(res.error ?? "Could not save the alias.");
      return;
    }
    const fresh = await listAliases();
    setBusy(false);
    if (fresh.error) setListError(fresh.error);
    else {
      setListError(null);
      setAliases(fresh.aliases);
    }
    // keep the saved alias selected so its customers stay visible
    setEditId(res.id);
    setAliasName(aliasName.trim());
    setTin(tin.trim());
    setBaseline(snap(aliasName, tin, selectedNos));
    setMessage(`Alias "${aliasName.trim()}" ${wasNew ? "added" : "updated"}.`);
  }

  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        {/* aliases (left): all of them, or only those linked to the chosen customer */}
        <section className="self-start rounded border border-line" style={{ backgroundColor: "#d9ecfb" }}>
          <div className="border-b border-line p-3">
            <label className="ledger-label mb-1 block">Show aliases of customer</label>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <ComboBox
                  options={customers.map((c) => ({ id: c.no, label: c.name }))}
                  value={filterCustomerNo}
                  onChange={setFilterCustomerNo}
                  placeholder="Select customer…"
                />
              </div>
              <button
                type="button"
                className="btn-secondary shrink-0 !px-3"
                disabled={filterCustomerNo == null}
                onClick={() => setFilterCustomerNo(null)}
                title="Show all aliases"
              >
                All
              </button>
            </div>
          </div>
          <div className="border-b border-line px-3 py-2 text-xs font-semibold text-ink-soft">{listTitle}</div>
          {listError && <p className="px-3 py-2 text-sm text-danger">{listError}</p>}
          <div className="max-h-[30rem] overflow-y-auto" role="listbox" aria-label="Aliases">
            {shown.length === 0 && (
              <p className="px-3 py-3 text-sm text-ink-soft">
                {filterCustomerNo == null ? "No aliases yet. Add the first one." : "No alias is linked to this customer."}
              </p>
            )}
            {shown.map((a) => (
              <button
                key={a.id}
                type="button"
                role="option"
                aria-selected={a.id === editId}
                data-selected={a.id === editId}
                onClick={() => void onSelectAlias(a)}
                className={"combo-option block w-full border-b border-line px-3 py-2 text-left text-sm " + (a.id === editId ? "font-medium" : "")}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-bold">{a.aliasName}</span>
                  <span className="shrink-0 font-mono text-xs text-ink-soft">TIN {a.tinNumber}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-soft">
                  {a.customerNos.length === 0 ? "No customers" : a.customerNos.map(nameOf).join(", ")}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* data entry (right) */}
        <section className="panel panel-teal self-start">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">{editId == null ? "New alias" : "Edit alias"}</h2>
            <button type="button" className="btn-secondary !px-3 !py-1 text-xs" onClick={() => void onNew()} disabled={editId == null && !hasUnsaved}>
              New alias
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="ledger-label mb-1 block">Alias name</label>
              <input className="field-input" value={aliasName} onChange={(e) => setAliasName(e.target.value)} placeholder="Alias name" />
            </div>
            <div>
              <label className="ledger-label mb-1 block">TIN number</label>
              <input
                className="field-input font-mono"
                inputMode="numeric"
                value={tin}
                onChange={(e) => setTin(e.target.value.replace(/\D/g, "").slice(0, 15))}
                placeholder="Digits only"
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="ledger-label block">Customers of this alias</label>
              <span className="text-xs text-ink-soft">{selectedNos.length} selected</span>
            </div>
            <input
              className="field-input mb-2"
              value={custSearch}
              onChange={(e) => setCustSearch(e.target.value)}
              placeholder="Search customers…"
              aria-label="Search customers"
            />
            {/* the customers run down the box; when they pass its height the rest continue in the next column */}
            <div className="flex h-72 flex-col flex-wrap content-start gap-x-2 overflow-x-auto overflow-y-hidden rounded border border-line bg-paper-raised p-1">
              {visibleCustomers.length === 0 && <p className="px-2 py-2 text-sm text-ink-soft">No customers match.</p>}
              {visibleCustomers.map((c) => (
                <label key={c.no} title={c.name} className="flex w-56 shrink-0 cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-paper">
                  <input type="checkbox" className="shrink-0" checked={selectedNos.includes(c.no)} onChange={() => toggleCustomer(c.no)} />
                  <span className="truncate">{c.name}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void onSave()}>
              {editId == null ? "Save" : "Update"}
            </button>
          </div>
        </section>
      </div>

      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}
