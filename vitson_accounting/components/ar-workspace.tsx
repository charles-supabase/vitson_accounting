"use client";

import { useEffect, useState } from "react";
import { ComboBox } from "./combo-box";
import { ConfirmModal } from "./confirm-modal";
import { SuccessModal } from "./success-modal";
import { deleteReceivable, getArReport, saveReceivable, type ArReport, type ArReportRow } from "@/actions/accounts-receivable";
import { MONTH_NAMES, money, parseYm } from "@/lib/report-format";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

const LEAVE_MESSAGE = "This sales entry is not saved. If you leave, the changes will be discarded. Leave anyway?";

const toNumber = (text: string) => Number(text.replace(/,/g, ""));
const fmtInput = (text: string) => {
  const n = toNumber(text);
  return text.trim() !== "" && Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : text;
};

export function ArWorkspace({
  customers,
  types,
}: {
  customers: { id: number; name: string }[];
  types: { id: number; name: string }[];
}) {
  const { setDirty, confirmLeave } = useUnsavedChanges();

  // entry form
  const [editId, setEditId] = useState<number | null>(null);
  const [month, setMonth] = useState(1);
  const [year, setYear] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState("");
  const [typeId, setTypeId] = useState<number | null>(null);
  const [baseline, setBaseline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // filter + report
  const [fMonth, setFMonth] = useState(1);
  const [fYear, setFYear] = useState("");
  const [report, setReport] = useState<ArReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const snap = [month, year, customerId, amountText, typeId].join("|");
  const hasUnsaved = editId == null ? customerId != null || amountText !== "" || typeId != null : snap !== baseline;

  useEffect(() => {
    setDirty(hasUnsaved, LEAVE_MESSAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsaved]);
  useEffect(() => {
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // default to the user's current month (client side: the server runs in UTC)
  useEffect(() => {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = String(now.getFullYear());
    setMonth(m);
    setYear(y);
    setFMonth(m);
    setFYear(y);
    void loadReport(`${y}-${String(m).padStart(2, "0")}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadReport(ym: string) {
    const res = await getArReport(ym);
    setReportError(res.error ?? null);
    setReport(res.data ?? null);
  }

  function onFilter() {
    const ym = `${fYear}-${String(fMonth).padStart(2, "0")}`;
    if (!parseYm(ym)) {
      setReportError("Enter a valid year.");
      return;
    }
    void loadReport(ym);
  }

  function resetForm(m = month, y = year) {
    setEditId(null);
    setMonth(m);
    setYear(y);
    setCustomerId(null);
    setAmountText("");
    setTypeId(null);
    setBaseline("");
    setError(null);
  }

  async function onNew() {
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    resetForm();
  }

  async function onPickRow(r: ArReportRow) {
    if (r.id === editId) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    const p = parseYm(report?.ym);
    const m = p?.month ?? month;
    const y = String(p?.year ?? year);
    const amt = fmtInput(String(r.salesAmount));
    setEditId(r.id);
    setMonth(m);
    setYear(y);
    setCustomerId(r.customerId);
    setAmountText(amt);
    setTypeId(r.receivableId);
    setBaseline([m, y, r.customerId, amt, r.receivableId].join("|"));
    setError(null);
  }

  async function onSave() {
    setError(null);
    setBusy(true);
    const res = await saveReceivable({
      id: editId,
      year: Number(year),
      month,
      customerId,
      salesAmount: toNumber(amountText),
      receivableId: typeId,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const name = customers.find((c) => c.id === customerId)?.name ?? "";
    setMessage(`Sales for ${name} (${res.ym}) ${editId ? "updated" : "saved"}.`);
    const p = parseYm(res.ym);
    if (p) {
      setFMonth(p.month);
      setFYear(String(p.year));
    }
    await loadReport(res.ym!);
    resetForm(month, year);
  }

  async function onDelete() {
    if (!editId) return;
    setConfirmDelete(false);
    const res = await deleteReceivable(editId);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMessage("Sales entry deleted.");
    if (report) await loadReport(report.ym);
    resetForm();
  }

  const yearInvalid = year !== "" && !parseYm(`${year}-01`);

  return (
    <div className="max-w-6xl">
      {/* entry */}
      <section className="panel panel-slate mb-5">
        <h2 className="mb-3 text-sm font-semibold">{editId ? "Change sales entry" : "New sales entry"}</h2>
        <div className="grid gap-4 md:grid-cols-5">
          <div>
            <label className="ledger-label mb-1 block">Month</label>
            <select className="field-input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((n, i) => (
                <option key={n} value={i + 1}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="ledger-label mb-1 block">Year</label>
            <input
              type="number"
              inputMode="numeric"
              className={yearInvalid ? "field-input-error" : "field-input"}
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </div>
          <div className="md:col-span-1">
            <label className="ledger-label mb-1 block">Customer</label>
            <ComboBox
              options={customers.map((c) => ({ id: c.id, label: c.name }))}
              value={customerId}
              onChange={setCustomerId}
              placeholder="Select customer…"
            />
          </div>
          <div>
            <label className="ledger-label mb-1 block">Sales amount</label>
            <input
              type="text"
              inputMode="decimal"
              className="field-input text-right font-mono"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.,]/g, ""))}
              onBlur={() => setAmountText(fmtInput(amountText))}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="ledger-label mb-1 block">Receivable type</label>
            <select
              className="field-input"
              value={typeId ?? ""}
              onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Select…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={busy || yearInvalid} onClick={() => void onSave()}>
            {editId ? "Update" : "Save"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => void onNew()} disabled={editId == null && !hasUnsaved}>
            {editId ? "New entry" : "Clear"}
          </button>
          {editId != null && (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-sm bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              onClick={() => setConfirmDelete(true)}
            >
              Delete entry
            </button>
          )}
        </div>
      </section>

      {/* filter */}
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded border border-line bg-paper-raised px-4 py-3">
        <div>
          <label className="ledger-label mb-1 block">Month</label>
          <select className="field-input" value={fMonth} onChange={(e) => setFMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((n, i) => (
              <option key={n} value={i + 1}>{n}</option>
            ))}
          </select>
        </div>
        <div className="w-28">
          <label className="ledger-label mb-1 block">Year</label>
          <input
            type="number"
            inputMode="numeric"
            className="field-input"
            value={fYear}
            data-enter-submit
            onChange={(e) => setFYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => {
              if (e.key === "Enter") onFilter();
            }}
          />
        </div>
        <button type="button" className="btn-primary" onClick={onFilter}>Filter</button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!report}
          onClick={() => report && window.open(`/accounts-receivable/print?ym=${encodeURIComponent(report.ym)}`, "_blank")}
        >
          Print
        </button>
        {report && <span className="pb-2 text-sm text-ink-soft">Showing {report.label}. Click a row to change it.</span>}
      </div>
      {reportError && <p className="mb-3 text-sm text-danger">{reportError}</p>}

      {/* report */}
      {report && (
        <div className="overflow-x-auto rounded border border-line bg-paper-raised">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-soft">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2 text-right">Sales amount</th>
                <th className="px-3 py-2 text-right">Total deductions</th>
                <th className="px-3 py-2 text-right">EWT</th>
                <th className="px-3 py-2 text-right">Total collected</th>
              </tr>
            </thead>
            {report.groups.map((g) => (
              <tbody key={g.receivableId ?? "none"}>
                <tr className="bg-paper">
                  <td colSpan={5} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-ink-soft">
                    {g.typeName}
                  </td>
                </tr>
                {g.rows.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-2 text-xs text-ink-faint">No {g.typeName} sales for this month.</td></tr>
                )}
                {g.rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => void onPickRow(r)}
                    className={"cursor-pointer border-t border-line hover:bg-paper " + (r.id === editId ? "bg-accent-soft" : "")}
                  >
                    <td className="px-3 py-1.5">{r.customerName}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{money(r.salesAmount)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{money(r.totalDeductions)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{money(r.ewt)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{money(r.totalCollected)}</td>
                  </tr>
                ))}
                <tr className="border-t border-line font-semibold">
                  <td className="px-3 py-1.5">Total {g.typeName}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{money(g.totalSales)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{money(g.totalDeductions)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{money(g.totalEwt)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{money(g.totalCollected)}</td>
                </tr>
              </tbody>
            ))}
            <tfoot>
              <tr className="border-t-2 border-line bg-paper font-bold">
                <td className="px-3 py-2">GRAND TOTAL</td>
                <td className="px-3 py-2 text-right font-mono">{money(report.grand.totalSales)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(report.grand.totalDeductions)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(report.grand.totalEwt)}</td>
                <td className="px-3 py-2 text-right font-mono">{money(report.grand.totalCollected)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          danger
          message="Delete this sales entry?"
          confirmLabel="Delete"
          cancelLabel="Keep"
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}
