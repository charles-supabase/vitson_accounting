"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SuccessModal } from "./success-modal";
import {
  getInvoiceAliases,
  getInvoiceDeliveries,
  saveInvoice,
  type InvoiceAlias,
  type InvoiceDelivery,
} from "@/actions/invoicing";
import { formatDate } from "@/lib/format";
import { money } from "@/lib/report-format";
import { invoiceTotals, lineAmount } from "@/lib/invoice-totals";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LEAVE_MESSAGE = "The invoice has delivery receipts that are not saved yet. If you leave, they will be dropped from the invoice. Leave anyway?";
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function InvoicingWorkspace() {
  const { setDirty, confirmLeave } = useUnsavedChanges();

  const [month, setMonth] = useState(1);
  const [yearText, setYearText] = useState("");
  const [aliases, setAliases] = useState<InvoiceAlias[]>([]);
  const [withoutAlias, setWithoutAlias] = useState(0);
  const [aliasesLoading, setAliasesLoading] = useState(false);
  const [aliasId, setAliasId] = useState<number | null>(null);
  const [available, setAvailable] = useState<InvoiceDelivery[]>([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [invoice, setInvoice] = useState<InvoiceDelivery[]>([]); // the receipts moved to this invoice
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [dateInvoice, setDateInvoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const aliasesRequest = useRef(0);
  const availableRequest = useRef(0);

  useEffect(() => {
    const now = new Date();
    setMonth(now.getMonth() + 1);
    setYearText(String(now.getFullYear()));
    setDateInvoice(todayIso());
  }, []);

  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : null;
  const ym = year != null && year >= 2000 && year <= 2100 ? `${year}-${String(month).padStart(2, "0")}` : null;
  const alias = aliases.find((a) => a.id === aliasId) ?? null;

  const hasUnsaved = invoice.length > 0;
  useEffect(() => {
    setDirty(hasUnsaved, LEAVE_MESSAGE);
  }, [hasUnsaved, setDirty]);
  useEffect(() => {
    return () => setDirty(false);
  }, [setDirty]);

  async function loadAliases(period: string, keepAlias: number | null) {
    const id = ++aliasesRequest.current;
    setAliasesLoading(true);
    const res = await getInvoiceAliases(period);
    if (id !== aliasesRequest.current) return;
    setAliasesLoading(false);
    setAliases(res.aliases);
    setWithoutAlias(res.withoutAlias);
    if (res.error) setError(res.error);
    if (keepAlias != null && !res.aliases.some((a) => a.id === keepAlias)) {
      setAliasId(null);
      setAvailable([]);
    }
  }

  async function loadAvailable(period: string, aid: number) {
    const id = ++availableRequest.current;
    setAvailableLoading(true);
    const res = await getInvoiceDeliveries(period, aid);
    if (id !== availableRequest.current) return;
    setAvailableLoading(false);
    setAvailable(res.deliveries);
    setChecked(new Set());
    setError(res.error ?? null);
  }

  // a new period: start again
  useEffect(() => {
    setAliasId(null);
    setAvailable([]);
    setChecked(new Set());
    setInvoice([]);
    setError(null);
    if (!ym) {
      setAliases([]);
      setWithoutAlias(0);
      return;
    }
    void loadAliases(ym, null);
  }, [ym]);

  // applies at once; asks first only when the invoice holds unsaved receipts
  function changePeriod(apply: () => void) {
    if (!hasUnsaved) {
      apply();
      return;
    }
    void confirmLeave(true, LEAVE_MESSAGE).then((ok) => {
      if (ok) apply();
    });
  }

  async function onSelectAlias(a: InvoiceAlias) {
    if (a.id === aliasId || !ym) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    setInvoice([]);
    setAliasId(a.id);
    await loadAvailable(ym, a.id);
  }

  // receipts still waiting to be processed (the ones already moved to the invoice are hidden)
  const inInvoice = useMemo(() => new Set(invoice.map((d) => d.id)), [invoice]);
  const waiting = useMemo(() => available.filter((d) => !inInvoice.has(d.id)), [available, inInvoice]);
  const checkedWaiting = waiting.filter((d) => checked.has(d.id));

  function toggle(id: number) {
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onProcess() {
    setError(null);
    if (checkedWaiting.length === 0) {
      setError("Tick the delivery receipts to include in this invoice first.");
      return;
    }
    const noPrice = checkedWaiting.filter((d) => !(d.unitPrice > 0));
    if (noPrice.length > 0) {
      setError(`Delivery receipt ${noPrice.map((d) => d.deliveryReceipt).join(", ")} has no unit price. Set the price in Customer Statements first.`);
      return;
    }
    setInvoice((cur) => [...cur, ...checkedWaiting].sort((a, b) => a.deliveryReceipt - b.deliveryReceipt || a.id - b.id));
    setChecked(new Set());
  }

  const totals = useMemo(() => invoiceTotals(invoice.map((d) => ({ weight: d.totalWt, unitPrice: d.unitPrice }))), [invoice]);
  const totalWeight = invoice.reduce((s, d) => s + d.totalWt, 0);

  async function onSave() {
    if (aliasId == null || !ym) return;
    setError(null);
    setBusy(true);
    const res = await saveInvoice({ invoiceNumber, dateInvoice, aliasId, deliveryIds: invoice.map((d) => d.id) });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMessage(`Invoice ${res.invoiceNumber} saved with ${invoice.length} delivery receipt${invoice.length === 1 ? "" : "s"}.`);
    setInvoice([]);
    setInvoiceNumber("");
    await Promise.all([loadAliases(ym, aliasId), loadAvailable(ym, aliasId)]);
  }

  const canSave = invoice.length > 0 && /^\d{1,12}$/.test(invoiceNumber) && /^\d{4}-\d{2}-\d{2}$/.test(dateInvoice) && !busy;

  return (
    <div className="space-y-5">
      {/* period */}
      <section className="panel panel-navy flex flex-wrap items-end gap-4">
        <div>
          <label className="ledger-label mb-1 block">Month</label>
          <select
            className="field-input"
            value={month}
            onChange={(e) => {
              const v = Number(e.target.value);
              changePeriod(() => setMonth(v));
            }}
            aria-label="Month"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="ledger-label mb-1 block">Year</label>
          <input
            className="field-input w-24 font-mono"
            inputMode="numeric"
            maxLength={4}
            value={yearText}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              changePeriod(() => setYearText(v));
            }}
            aria-label="Year"
          />
        </div>
        <p className="pb-2 text-sm opacity-90">
          {ym ? `${aliases.length} alias${aliases.length === 1 ? "" : "es"} with delivery receipts to invoice` : "Enter a 4-digit year between 2000 and 2100."}
        </p>
      </section>

      {error && <p className="rounded border border-danger px-3 py-2 text-sm text-danger">{error}</p>}
      {withoutAlias > 0 && (
        <p className="rounded border border-line bg-white px-3 py-2 text-sm text-ink-soft">
          {withoutAlias} Big delivery receipt{withoutAlias === 1 ? "" : "s"} in this period {withoutAlias === 1 ? "has" : "have"} no alias, so {withoutAlias === 1 ? "it" : "they"} cannot be
          invoiced. Choose the alias in Deliveries first.
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* LEFT: the invoice */}
        <section className="rounded border border-line" style={{ backgroundColor: "#d9ecfb" }}>
          <div className="border-b border-line px-3 py-2 text-xs font-semibold text-ink-soft">
            {alias ? `Invoice for ${alias.name} (${invoice.length})` : "Invoice"}
          </div>
          <div className="grid grid-cols-[4.5rem_5.5rem_1fr_5.5rem_5rem_6.5rem_1.5rem] gap-2 border-b border-line px-3 py-1.5 text-xs font-semibold text-ink-soft">
            <span>DR No.</span>
            <span>Date</span>
            <span>Customer</span>
            <span className="text-right">Weight</span>
            <span className="text-right">Price</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <div className="max-h-[22rem] overflow-y-auto">
            {invoice.length === 0 && <p className="px-3 py-3 text-sm text-ink-soft">No delivery receipts yet. Tick receipts on the right and click Process.</p>}
            {invoice.map((d) => (
              <div key={d.id} className="grid grid-cols-[4.5rem_5.5rem_1fr_5.5rem_5rem_6.5rem_1.5rem] items-center gap-2 border-b border-line px-3 py-1.5 text-sm">
                <span className="font-mono">{d.deliveryReceipt}</span>
                <span className="font-mono">{formatDate(d.dateDelivery)}</span>
                <span className="truncate">{d.customerName}</span>
                <span className="text-right font-mono">{money(d.totalWt)}</span>
                <span className="text-right font-mono">{money(d.unitPrice)}</span>
                <span className="text-right font-mono">{money(lineAmount(d.totalWt, d.unitPrice))}</span>
                <button
                  type="button"
                  className="text-ink-soft hover:text-danger"
                  title="Take this receipt out of the invoice"
                  aria-label={`Remove delivery receipt ${d.deliveryReceipt}`}
                  disabled={busy}
                  onClick={() => setInvoice((cur) => cur.filter((x) => x.id !== d.id))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* totals: Service Income, Vat (uncollected), Gross Amount */}
          <div className="space-y-1 border-t-2 border-line px-3 py-3">
            <div className="flex justify-between text-sm text-ink-soft">
              <span>Total weight</span>
              <span className="font-mono">{money(totalWeight)}</span>
            </div>
            <div className="flex items-baseline justify-between text-base font-semibold">
              <span>Service Income</span>
              <span className="font-mono">{money(totals.serviceIncome)}</span>
            </div>
            <div className="flex items-baseline justify-between text-base font-semibold">
              <span>Vat (uncollected)</span>
              <span className="font-mono">{money(totals.vat)}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-1 text-xl font-bold">
              <span>Gross Amount</span>
              <span className="font-mono">{money(totals.gross)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-line px-3 py-3">
            <div>
              <label className="ledger-label mb-1 block">Invoice number</label>
              <input
                className="field-input w-40 font-mono"
                inputMode="numeric"
                value={invoiceNumber}
                disabled={invoice.length === 0 || busy}
                onChange={(e) => setInvoiceNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
                aria-label="Invoice number"
              />
            </div>
            <div>
              <label className="ledger-label mb-1 block">Invoice date</label>
              <input
                type="date"
                className="field-input"
                value={dateInvoice}
                disabled={invoice.length === 0 || busy}
                onChange={(e) => setDateInvoice(e.target.value)}
                aria-label="Invoice date"
              />
            </div>
            <button type="button" className="btn-primary" disabled={!canSave} onClick={() => void onSave()}>
              {busy ? "Saving…" : "Save invoice"}
            </button>
          </div>
        </section>

        {/* RIGHT: aliases, then the receipts of the chosen alias */}
        <div className="space-y-5">
          <section className="rounded border border-line" style={{ backgroundColor: "#d9ecfb" }}>
            <div className="border-b border-line px-3 py-2 text-xs font-semibold text-ink-soft">Aliases ({aliases.length})</div>
            <div className="max-h-48 overflow-y-auto" role="listbox" aria-label="Aliases">
              {aliasesLoading && <p className="px-3 py-3 text-sm text-ink-soft">Loading…</p>}
              {!aliasesLoading && aliases.length === 0 && <p className="px-3 py-3 text-sm text-ink-soft">No delivery receipts to invoice in this period.</p>}
              {aliases.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="option"
                  aria-selected={a.id === aliasId}
                  data-selected={a.id === aliasId}
                  onClick={() => void onSelectAlias(a)}
                  className={"combo-option flex w-full items-baseline justify-between gap-3 border-b border-line px-3 py-2 text-left text-sm " + (a.id === aliasId ? "font-medium" : "")}
                >
                  <span className="truncate">{a.name}</span>
                  <span className="shrink-0 font-mono text-xs">{a.deliveries}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded border border-line" style={{ backgroundColor: "#d9ecfb" }}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
              <span className="text-xs font-semibold text-ink-soft">
                {alias ? `Delivery receipts of ${alias.name} (${waiting.length})` : "Delivery receipts"}
              </span>
              <span className="flex gap-2">
                <button type="button" className="btn-secondary !px-2 !py-1 text-xs" disabled={waiting.length === 0} onClick={() => setChecked(new Set(waiting.map((d) => d.id)))}>
                  Select all
                </button>
                <button type="button" className="btn-secondary !px-2 !py-1 text-xs" disabled={checked.size === 0} onClick={() => setChecked(new Set())}>
                  Clear
                </button>
                <button type="button" className="btn-primary !px-3 !py-1 text-xs" disabled={checkedWaiting.length === 0 || busy} onClick={onProcess}>
                  Process ({checkedWaiting.length})
                </button>
              </span>
            </div>
            <div className="grid grid-cols-[1.5rem_4.5rem_5.5rem_1fr_5.5rem_5rem] gap-2 border-b border-line px-3 py-1.5 text-xs font-semibold text-ink-soft">
              <span />
              <span>DR No.</span>
              <span>Date</span>
              <span>Customer</span>
              <span className="text-right">Weight</span>
              <span className="text-right">Price</span>
            </div>
            <div className="max-h-[22rem] overflow-y-auto">
              {availableLoading && <p className="px-3 py-3 text-sm text-ink-soft">Loading…</p>}
              {!availableLoading && alias == null && <p className="px-3 py-3 text-sm text-ink-soft">Select an alias.</p>}
              {!availableLoading && alias != null && waiting.length === 0 && <p className="px-3 py-3 text-sm text-ink-soft">No delivery receipts left for this alias.</p>}
              {waiting.map((d) => (
                <label
                  key={d.id}
                  className="grid cursor-pointer grid-cols-[1.5rem_4.5rem_5.5rem_1fr_5.5rem_5rem] items-center gap-2 border-b border-line px-3 py-1.5 text-sm hover:bg-[#eef3ff]"
                >
                  <input type="checkbox" checked={checked.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Delivery receipt ${d.deliveryReceipt}`} />
                  <span className="font-mono">{d.deliveryReceipt}</span>
                  <span className="font-mono">{formatDate(d.dateDelivery)}</span>
                  <span className="truncate">{d.customerName}</span>
                  <span className="text-right font-mono">{money(d.totalWt)}</span>
                  <span className="text-right font-mono" style={d.unitPrice > 0 ? undefined : { color: "#b91c1c", fontWeight: 700 }}>
                    {money(d.unitPrice)}
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>

      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}
