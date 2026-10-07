"use client";

import { useEffect, useState } from "react";
import { ComboBox } from "./combo-box";
import { ConfirmModal } from "./confirm-modal";
import { SuccessModal } from "./success-modal";
import { deleteReceivable, getArReport, saveReceivable, type ArReport, type ArReportRow } from "@/actions/accounts-receivable";
import { MONTH_NAMES, money, parseYm } from "@/lib/report-format";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

const LEAVE_MESSAGE = "This sales entry is not saved. If you leave, the changes will be discarded. Leave anyway?";

// one colour per receivable type (in the order of the type list): the tab, the entry section share it
const TONES = [
  { panel: "panel-teal", solid: "#0f4c5c", text: "#ffffff", softBg: "#dcecf0", softBorder: "#a9cdd6", softText: "#3f7a8a", hover: "#cde4ea" },
  { panel: "panel-burgundy", solid: "#7a1130", text: "#fde68a", softBg: "#f6dde4", softBorder: "#e3b3c0", softText: "#a2465f", hover: "#f0cdd7" },
];

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

  // the selected tab = the receivable type of every entry made on this screen
  const [tabId, setTabId] = useState<number>(types[0]?.id ?? 0);
  const tabIndex = Math.max(0, types.findIndex((t) => t.id === tabId));
  const tone = TONES[tabIndex % TONES.length];
  const tabName = types[tabIndex]?.name ?? "";

  // entry form
  const [editId, setEditId] = useState<number | null>(null);
  const [month, setMonth] = useState(1);
  const [year, setYear] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [amountText, setAmountText] = useState("");
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

  const snap = [month, year, customerId, amountText].join("|");
  const hasUnsaved = editId == null ? customerId != null || amountText !== "" : snap !== baseline;

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
    void loadReport(`${y}-${String(m).padStart(2, "0")}`, tabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadReport(ym: string, receivableId: number) {
    const res = await getArReport(ym, receivableId);
    setReportError(res.error ?? null);
    setReport(res.data ?? null);
  }

  function onFilter() {
    const ym = `${fYear}-${String(fMonth).padStart(2, "0")}`;
    if (!parseYm(ym)) {
      setReportError("Enter a valid year.");
      return;
    }
    void loadReport(ym, tabId);
  }

  function resetForm(m = month, y = year) {
    setEditId(null);
    setMonth(m);
    setYear(y);
    setCustomerId(null);
    setAmountText("");
    setBaseline("");
    setError(null);
  }

  async function onNew() {
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    resetForm();
  }

  async function onSwitchTab(id: number) {
    if (id === tabId) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    resetForm();
    setTabId(id);
    const ym = `${fYear}-${String(fMonth).padStart(2, "0")}`;
    if (parseYm(ym)) await loadReport(ym, id);
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
    setBaseline([m, y, r.customerId, amt].join("|"));
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
      receivableId: tabId, // always the type of the selected tab
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const name = customers.find((c) => c.id === customerId)?.name ?? "";
    setMessage(`${tabName} sales for ${name} (${res.ym}) ${editId ? "updated" : "saved"}.`);
    const p = parseYm(res.ym);
    if (p) {
      setFMonth(p.month);
      setFYear(String(p.year));
    }
    await loadReport(res.ym!, tabId);
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
    if (report) await loadReport(report.ym, tabId);
    resetForm();
  }

  const yearInvalid = year !== "" && !parseYm(`${year}-01`);

  return (
    <div className="max-w-6xl">
      {/* BIG / SMALL tabs: every entry on this screen gets the type of the selected tab */}
      <div className="flex items-end gap-2" role="tablist" aria-label="Receivable type">
        {types.map((t, i) => {
          const tn = TONES[i % TONES.length];
          const active = t.id === tabId;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => void onSwitchTab(t.id)}
              className="rounded-t-lg border-4 border-b-0 px-10 py-2.5 text-xl font-black uppercase tracking-[0.2em] transition-colors"
              style={
                active
                  ? { backgroundColor: tn.solid, borderColor: tn.solid, color: tn.text }
                  : { backgroundColor: tn.softBg, borderColor: tn.softBorder, color: tn.softText }
              }
            >
              {t.name}
            </button>
          );
        })}
      </div>

      {/* entry */}
      <section className={"panel mb-5 rounded-tl-none " + tone.panel}>
        <h2 className="mb-3 text-sm font-semibold">
          {editId ? `Change ${tabName} sales entry` : `New ${tabName} sales entry`}
        </h2>
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
          <div>
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
            <input className="field-input font-bold uppercase" value={tabName} readOnly tabIndex={-1} aria-label="Receivable type (set by the selected tab)" />
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
          onClick={() =>
            report && window.open(`/accounts-receivable/print?ym=${encodeURIComponent(report.ym)}&rt=${tabId}`, "_blank")
          }
        >
          Print {tabName}
        </button>
        {report && <span className="pb-2 text-sm text-ink-soft">Showing {tabName} · {report.label}. Click a row to change it.</span>}
      </div>
      {reportError && <p className="mb-3 text-sm text-danger">{reportError}</p>}

      {/* report of the selected tab */}
      {report && (
        <>
          <div className="overflow-x-auto rounded border border-line bg-paper-raised">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-soft">
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2 text-right">Sales amount</th>
                  <th className="px-3 py-2 text-right">Total deductions</th>
                  <th className="px-3 py-2 text-right">EWT</th>
                  <th className="px-3 py-2 text-right">Total collected</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-3 text-xs text-ink-faint">No {tabName} sales for this month.</td></tr>
                )}
                {report.rows.map((r) => (
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
                    <td className="px-3 py-1.5 text-right font-mono">{money(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-paper font-bold">
                  <td className="px-3 py-2">TOTAL {tabName.toUpperCase()}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(report.totals.totalSales)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(report.totals.totalDeductions)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(report.totals.totalEwt)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(report.totals.totalCollected)}</td>
                  <td className="px-3 py-2 text-right font-mono">{money(report.totals.totalBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {report.sharedCustomers.length > 0 && (
            <p className="mt-2 text-xs text-ink-soft">
              Collections are recorded per customer and month, not per type. {report.sharedCustomers.join(", ")} also
              {report.sharedCustomers.length === 1 ? " has" : " have"} an entry of the other type this month, so the same
              collections show in both tabs.
            </p>
          )}
        </>
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
