"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PasswordModal } from "./password-modal";
import { SuccessModal } from "./success-modal";
import {
  getInvoiceAliases,
  getInvoiceDeliveries,
  getInvoiceDetail,
  getInvoiceList,
  getLastInvoiceNumber,
  saveInvoice,
  setCustomerDiscountRate,
  updateInvoice,
  verifyInvoicePassword,
  type InvoiceDetail,
  type InvoiceAlias,
  type InvoiceDelivery,
  type InvoiceRow,
} from "@/actions/invoicing";
import { formatDate } from "@/lib/format";
import { money } from "@/lib/report-format";
import { adjustTotals, discountFromRate, invoiceTotals, lineAmount, rateFromDiscount } from "@/lib/invoice-totals";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LEAVE_MESSAGE = "The invoice has delivery receipts that are not saved yet. If you leave, they will be dropped from the invoice. Leave anyway?";
const ORANGE = "#ab5709"; // the app's orange
const ROYAL_BLUE = "#4169e1";
const RED = "#b91c1c";
const GREEN = "#15803d";
const CREAM = "#fff4d6";
const MAX_INVOICE_ROWS = 3; // rows on the billing invoice: one per tone, dye process and fabric
const fmtMoney = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** The selected period with today's day of the month (e.g. period 2026-09 on the 16th gives 2026-09-16; kept inside short months). */
const defaultInvoiceDate = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${ym}-${String(Math.min(new Date().getDate(), lastDay)).padStart(2, "0")}`;
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
  // discount: a percentage (default from the customer's discounts_rate) or a typed amount; deduction: a typed amount
  const [pctText, setPctText] = useState("");
  const [pctTouched, setPctTouched] = useState(false);
  const [discountManual, setDiscountManual] = useState<string | null>(null);
  const [deductionText, setDeductionText] = useState("");
  const [customerRates, setCustomerRates] = useState<Record<number, number>>({}); // customer id -> discounts_rate (percent)
  const [askRate, setAskRate] = useState<{ customerId: number; name: string; rate: number } | null>(null);
  const askedRates = useRef<Set<string>>(new Set());
  const [lastInvoice, setLastInvoice] = useState<number | null>(null);
  const [saved, setSaved] = useState<InvoiceRow[]>([]); // invoices already saved for the period
  const [viewInv, setViewInv] = useState<InvoiceDetail | null>(null); // a saved invoice opened for viewing
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
  }, []);

  useEffect(() => {
    void getLastInvoiceNumber().then((r) => setLastInvoice(r.last));
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

  function resetAdjustments() {
    setPctText("");
    setPctTouched(false);
    setDiscountManual(null);
    setDeductionText("");
  }

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
    setCustomerRates((cur) => ({ ...cur, ...(res.discountRates ?? {}) }));
    setChecked(new Set());
    setError(res.error ?? null);
  }

  // a new period: start again
  useEffect(() => {
    setAliasId(null);
    setAvailable([]);
    setChecked(new Set());
    setInvoice([]);
    setViewInv(null);
    resetAdjustments();
    setError(null);
    if (!ym) {
      setAliases([]);
      setWithoutAlias(0);
      setSaved([]);
      return;
    }
    setDateInvoice(defaultInvoiceDate(ym));
    void loadAliases(ym, null);
    void loadSaved(ym);
  }, [ym]);

  async function loadSaved(period: string) {
    const res = await getInvoiceList(period);
    setSaved(res.invoices);
  }

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

  // a saved invoice is chosen in the list: show it (read-only; Edit needs the password)
  async function onViewInvoice(id: number) {
    if (viewInv?.id === id) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    const res = await getInvoiceDetail(id);
    if (res.error || !res.invoice) {
      setError(res.error ?? "Could not load the invoice.");
      return;
    }
    setError(null);
    setInvoice([]);
    resetAdjustments();
    setAliasId(null);
    setAvailable([]);
    setChecked(new Set());
    setViewInv(res.invoice);
  }

  async function onInvoiceUpdated(text: string) {
    setMessage(text);
    if (ym) void loadSaved(ym);
    void getLastInvoiceNumber().then((r) => setLastInvoice(r.last));
    if (viewInv) {
      const res = await getInvoiceDetail(viewInv.id);
      if (res.invoice) setViewInv(res.invoice);
    }
  }

  async function onSelectAlias(a: InvoiceAlias) {
    if (a.id === aliasId || !ym) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    setInvoice([]);
    setViewInv(null);
    resetAdjustments();
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
    const kinds = new Set([...invoice, ...checkedWaiting].map((d) => `${d.toneId ?? 0}|${d.dyeId ?? 0}|${d.fabricId ?? 0}`));
    if (kinds.size > MAX_INVOICE_ROWS) {
      setError(
        `A billing invoice can have at most ${MAX_INVOICE_ROWS} rows (different tone, dye process and fabric). With these receipts it would have ${kinds.size}. Choose fewer kinds of receipts for this invoice.`,
      );
      return;
    }
    setInvoice((cur) => [...cur, ...checkedWaiting].sort((a, b) => a.deliveryReceipt - b.deliveryReceipt || a.id - b.id));
    setChecked(new Set());
  }

  const lines = useMemo(() => invoice.map((d) => ({ weight: d.totalWt, unitPrice: d.unitPrice })), [invoice]);
  const gross = useMemo(() => invoiceTotals(lines).gross, [lines]);

  // the customer of the invoice: the one with the most receipts in it
  const invoiceCustomer = useMemo(() => {
    const count = new Map<number, { name: string; n: number }>();
    for (const d of invoice) count.set(d.customerId, { name: d.customerName, n: (count.get(d.customerId)?.n ?? 0) + 1 });
    const best = Array.from(count.entries()).sort((a, b) => b[1].n - a[1].n || a[0] - b[0])[0];
    return best ? { id: best[0], name: best[1].name } : null;
  }, [invoice]);
  const defaultRate = invoiceCustomer ? customerRates[invoiceCustomer.id] ?? 0 : 0;

  const num = (t: string) => {
    const n = Number(t.replace(/,/g, "").trim() === "" ? 0 : t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };
  const rate = pctTouched ? num(pctText) : defaultRate;
  const discountValue = discountManual !== null ? num(discountManual) : discountFromRate(gross, rate);
  const deductionValue = num(deductionText);
  const pctShown = discountManual !== null ? String(rateFromDiscount(gross, discountValue)) : pctTouched ? pctText : String(defaultRate);
  const totals = useMemo(
    () => invoiceTotals(lines, Number.isFinite(discountValue) ? discountValue : 0, Number.isFinite(deductionValue) ? deductionValue : 0),
    [lines, discountValue, deductionValue],
  );
  const adjustmentsBad =
    !Number.isFinite(discountValue) || discountValue < 0 || !Number.isFinite(deductionValue) || deductionValue < 0 || discountValue + deductionValue > totals.gross;
  // total delivered weight: Body + 1x1 + C+C of every receipt in the invoice
  const totalWeight = invoice.reduce((s, d) => s + d.totalWt, 0);
  const invoiceRows = new Set(invoice.map((d) => `${d.toneId ?? 0}|${d.dyeId ?? 0}|${d.fabricId ?? 0}`)).size;

  // the percentage was changed: offer to keep it as the customer's default
  function onRateCommit() {
    if (!invoiceCustomer || !pctTouched || discountManual !== null) return;
    const r = num(pctText);
    if (!Number.isFinite(r) || r < 0 || r > 100) return;
    setPctText(String(r));
    const key = `${invoiceCustomer.id}:${r}`;
    if (r !== defaultRate && !askedRates.current.has(key)) {
      askedRates.current.add(key);
      setAskRate({ customerId: invoiceCustomer.id, name: invoiceCustomer.name, rate: r });
    }
  }

  async function onSetDefaultRate() {
    if (!askRate) return;
    const { customerId, rate: r } = askRate;
    setAskRate(null);
    const res = await setCustomerDiscountRate(customerId, r);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCustomerRates((cur) => ({ ...cur, [customerId]: r }));
    setMessage(`${r}% is now the default discount rate of ${askRate.name}.`);
  }

  async function onSave() {
    if (aliasId == null || !ym) return;
    setError(null);
    setBusy(true);
    const res = await saveInvoice({ invoiceNumber, dateInvoice, aliasId, deliveryIds: invoice.map((d) => d.id), discount: String(discountValue), deduction: deductionText });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMessage(`Invoice ${res.invoiceNumber} saved with ${invoice.length} delivery receipt${invoice.length === 1 ? "" : "s"}.`);
    setInvoice([]);
    setInvoiceNumber("");
    resetAdjustments();
    setDateInvoice(defaultInvoiceDate(ym));
    void getLastInvoiceNumber().then((r) => setLastInvoice(r.last));
    await Promise.all([loadAliases(ym, aliasId), loadAvailable(ym, aliasId), loadSaved(ym)]);
  }

  const canSave = invoice.length > 0 && !adjustmentsBad && /^\d{1,12}$/.test(invoiceNumber) && /^\d{4}-\d{2}-\d{2}$/.test(dateInvoice) && !busy;

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
        {/* LEFT: a saved invoice (view / edit) or the invoice being made */}
        {viewInv ? (
          <InvoiceViewPanel inv={viewInv} onClose={() => setViewInv(null)} onUpdated={(t) => void onInvoiceUpdated(t)} />
        ) : (
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

          {/* totals: Gross Amount, Discount, Deduction, Vat, Service Income */}
          <div className="space-y-1 border-t-2 border-line px-3 py-3">
            <div className="flex justify-between text-sm text-ink-soft">
              <span>
                Total weight
                <span className="ml-3">
                  Rows on the billing invoice: {invoiceRows} of {MAX_INVOICE_ROWS}
                </span>
              </span>
              <span className="font-mono">{money(totalWeight)}</span>
            </div>
            <div className="flex items-baseline justify-between text-xl font-bold" style={{ color: ROYAL_BLUE }}>
              <span>Gross Amount</span>
              <span className="font-mono">{money(totals.gross)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 font-bold" style={{ color: RED }}>
              <label htmlFor="invoice-discount">Discount</label>
              <span className="flex items-center gap-2">
                <input
                  inputMode="decimal"
                  className="field-input w-20 !py-1 text-right font-mono font-bold"
                  style={{ color: RED }}
                  value={pctShown}
                  disabled={invoice.length === 0 || busy}
                  title={invoiceCustomer ? `Discount rate of ${invoiceCustomer.name} (percent). You can change it.` : "Discount rate (percent)"}
                  onChange={(e) => {
                    setPctText(e.target.value.replace(/[^0-9.]/g, ""));
                    setPctTouched(true);
                    setDiscountManual(null);
                  }}
                  onBlur={onRateCommit}
                  aria-label="Discount percentage"
                />
                <span>%</span>
                <input
                  id="invoice-discount"
                  inputMode="decimal"
                  className="field-input w-36 !py-1 text-right font-mono font-bold"
                  style={{ color: RED, borderColor: adjustmentsBad ? RED : undefined }}
                  value={discountManual !== null ? discountManual : fmtMoney(Number.isFinite(discountValue) ? discountValue : 0)}
                  disabled={invoice.length === 0 || busy}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.,]/g, "");
                    setDiscountManual(v === "" ? null : v);
                  }}
                  onBlur={() => {
                    if (discountManual !== null) {
                      const n = num(discountManual);
                      if (Number.isFinite(n)) setDiscountManual(fmtMoney(n));
                    }
                  }}
                  aria-label="Discount amount"
                />
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 font-bold" style={{ color: RED }}>
              <label htmlFor="invoice-deduction">Deduction</label>
              <input
                id="invoice-deduction"
                inputMode="decimal"
                className="field-input w-36 !py-1 text-right font-mono font-bold"
                style={{ color: RED, borderColor: adjustmentsBad ? RED : undefined }}
                value={deductionText}
                disabled={invoice.length === 0 || busy}
                placeholder="0.00"
                onChange={(e) => setDeductionText(e.target.value.replace(/[^0-9.,]/g, ""))}
                onBlur={() => {
                  const n = num(deductionText);
                  if (deductionText.trim() !== "" && Number.isFinite(n)) setDeductionText(fmtMoney(n));
                }}
                aria-label="Deduction amount"
              />
            </div>
            {adjustmentsBad && <p className="text-right text-xs" style={{ color: RED }}>The discount and the deduction cannot be negative or more than the gross amount together.</p>}
            <div className="flex items-baseline justify-between text-base font-semibold" style={{ color: RED }}>
              <span>Vat (uncollected)</span>
              <span className="font-mono">{money(totals.vat)}</span>
            </div>
            <div className="flex items-baseline justify-between border-t border-line pt-1 text-xl font-bold" style={{ color: GREEN }}>
              <span>Service Income</span>
              <span className="font-mono">{money(totals.serviceIncome)}</span>
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
                title="Double-click to fill in the next invoice number"
                onChange={(e) => setInvoiceNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
                onDoubleClick={async () => {
                  const r = await getLastInvoiceNumber();
                  setLastInvoice(r.last);
                  setInvoiceNumber(String((r.last ?? 0) + 1));
                }}
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
            <span
              className="rounded border px-2 py-1 font-bold"
              style={{ color: ORANGE, borderColor: ORANGE, backgroundColor: CREAM, fontSize: "14px" }}
              title="The biggest invoice number saved so far"
            >
              Last invoice no.: {lastInvoice ?? "none"}
            </span>
            <button type="button" className="btn-primary" disabled={!canSave} onClick={() => void onSave()}>
              {busy ? "Saving…" : "Save invoice"}
            </button>
          </div>
        </section>
        )}

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

      {/* invoices already saved for the period, and the printouts */}
      {ym && (
        <section className="rounded border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h2 className="text-base font-bold">
              Invoices of {MONTHS[month - 1]} {year} ({saved.length})
            </h2>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" disabled={saved.length === 0} onClick={() => window.open(`/invoicing/print?kind=list&ym=${ym}`, "_blank")}>
                Print invoice list
              </button>
              <button type="button" className="btn-secondary" disabled={saved.length === 0} onClick={() => window.open(`/invoicing/print?kind=customers&ym=${ym}`, "_blank")}>
                Print per customer
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[5rem_6rem_1fr_7.5rem_6rem_6rem_7.5rem_7rem_6.5rem] gap-2 border-b border-line px-4 py-1.5 text-xs font-semibold text-ink-soft">
            <span>INV No.</span>
            <span>Date</span>
            <span>Customer</span>
            <span className="text-right">Act Receivable</span>
            <span className="text-right">Discount</span>
            <span className="text-right">Deduction</span>
            <span className="text-right">Service Income</span>
            <span className="text-right">Uncollected</span>
            <span />
          </div>
          <div className="max-h-[20rem] overflow-y-auto">
            {saved.length === 0 && <p className="px-4 py-3 text-sm text-ink-soft">No invoices saved for this period yet.</p>}
            {saved.map((r) => (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                title="Click to view this invoice"
                onClick={() => void onViewInvoice(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onViewInvoice(r.id);
                }}
                className={
                  "grid cursor-pointer grid-cols-[5rem_6rem_1fr_7.5rem_6rem_6rem_7.5rem_7rem_6.5rem] items-center gap-2 border-b border-line px-4 py-1.5 text-sm hover:bg-[#eef3ff] " +
                  (viewInv?.id === r.id ? "bg-[#d9ecfb] font-medium" : "")
                }
              >
                <span className="font-mono">{r.invoiceNumber}</span>
                <span className="font-mono">{formatDate(r.dateInvoice)}</span>
                <span className="truncate">{r.aliasName}</span>
                <span className="text-right font-mono">{money(r.invoiceAmount)}</span>
                <span className="text-right font-mono">{money(r.discount)}</span>
                <span className="text-right font-mono">{money(r.deduction)}</span>
                <span className="text-right font-mono">{money(r.serviceIncome)}</span>
                <span className="text-right font-mono">{money(r.vat)}</span>
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs font-semibold text-white hover:opacity-90"
                  style={{ backgroundColor: GREEN }}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(`/invoicing/print?kind=invoice&id=${r.id}`, "_blank");
                  }}
                >
                  Print invoice
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {askRate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Set default discount rate">
          <div className="w-full max-w-md rounded bg-white p-5 shadow-xl">
            <h3 className="mb-2 text-base font-bold">Set as default discount rate?</h3>
            <p className="mb-4 text-sm">
              You changed the discount rate to <b>{askRate.rate}%</b>. Do you want to set it as the default discount rate of <b>{askRate.name}</b> for future invoices?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setAskRate(null)}>
                No, this invoice only
              </button>
              <button type="button" className="btn-primary" onClick={() => void onSetDefaultRate()}>
                Yes, set as default
              </button>
            </div>
          </div>
        </div>
      )}

      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}


/** A saved invoice: read-only until Edit (password) is used. The receipts on it cannot be changed here. */
function InvoiceViewPanel({ inv, onClose, onUpdated }: { inv: InvoiceDetail; onClose: () => void; onUpdated: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [askPw, setAskPw] = useState(false);
  const [number, setNumber] = useState(String(inv.invoiceNumber));
  const [date, setDate] = useState(inv.dateInvoice);
  const [discount, setDiscount] = useState(fmtMoney(inv.discount));
  const [deduction, setDeduction] = useState(fmtMoney(inv.deduction));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef("");

  // another invoice (or fresh values after a save): show its values and lock again
  useEffect(() => {
    setEditing(false);
    setAskPw(false);
    passwordRef.current = "";
    setNumber(String(inv.invoiceNumber));
    setDate(inv.dateInvoice);
    setDiscount(fmtMoney(inv.discount));
    setDeduction(fmtMoney(inv.deduction));
    setError(null);
  }, [inv]);

  const num = (t: string) => {
    const x = t.replace(/,/g, "").trim();
    const n = x === "" ? 0 : Number(x);
    return Number.isFinite(n) ? n : NaN;
  };
  const d = num(discount);
  const e = num(deduction);
  const bad = editing && (!Number.isFinite(d) || d < 0 || !Number.isFinite(e) || e < 0 || d + e > inv.gross);
  const live = adjustTotals(inv.gross, Number.isFinite(d) ? d : 0, Number.isFinite(e) ? e : 0);
  const shown = editing ? live : { gross: inv.gross, discount: inv.discount, deduction: inv.deduction, vat: inv.vat, serviceIncome: inv.serviceIncome };
  const totalWeight = inv.receipts.reduce((s, r) => s + r.totalWt, 0);

  async function onSaveEdit() {
    setBusy(true);
    setError(null);
    const res = await updateInvoice({ id: inv.id, invoiceNumber: number, dateInvoice: date, discount, deduction, password: passwordRef.current });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onUpdated(`Invoice ${number} saved.`);
  }

  function cancelEdit() {
    setEditing(false);
    passwordRef.current = "";
    setNumber(String(inv.invoiceNumber));
    setDate(inv.dateInvoice);
    setDiscount(fmtMoney(inv.discount));
    setDeduction(fmtMoney(inv.deduction));
    setError(null);
  }

  return (
    <section className="rounded border border-line" style={{ backgroundColor: "#d9ecfb" }}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-xs font-semibold text-ink-soft">
          Invoice {inv.invoiceNumber} · {inv.aliasName} ({inv.receipts.length} receipt{inv.receipts.length === 1 ? "" : "s"})
        </span>
        <button type="button" className="btn-secondary !px-2 !py-1 text-xs" onClick={onClose}>
          New invoice
        </button>
      </div>
      <div className="grid grid-cols-[4.5rem_5.5rem_1fr_5.5rem_5rem_6.5rem] gap-2 border-b border-line px-3 py-1.5 text-xs font-semibold text-ink-soft">
        <span>DR No.</span>
        <span>Date</span>
        <span>Customer</span>
        <span className="text-right">Weight</span>
        <span className="text-right">Price</span>
        <span className="text-right">Amount</span>
      </div>
      <div className="max-h-[18rem] overflow-y-auto">
        {inv.receipts.map((r) => (
          <div key={r.id} className="grid grid-cols-[4.5rem_5.5rem_1fr_5.5rem_5rem_6.5rem] items-center gap-2 border-b border-line px-3 py-1.5 text-sm">
            <span className="font-mono">{r.deliveryReceipt}</span>
            <span className="font-mono">{formatDate(r.dateDelivery)}</span>
            <span className="truncate">{r.customerName}</span>
            <span className="text-right font-mono">{money(r.totalWt)}</span>
            <span className="text-right font-mono">{money(r.unitPrice)}</span>
            <span className="text-right font-mono">{money(lineAmount(r.totalWt, r.unitPrice))}</span>
          </div>
        ))}
      </div>

      {error && <p className="mx-3 mt-3 rounded border border-danger bg-white px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="space-y-1 border-t-2 border-line px-3 py-3">
        <div className="flex justify-between text-sm text-ink-soft">
          <span>Total weight</span>
          <span className="font-mono">{money(totalWeight)}</span>
        </div>
        <div className="flex items-baseline justify-between text-xl font-bold" style={{ color: ROYAL_BLUE }}>
          <span>Gross Amount</span>
          <span className="font-mono">{money(shown.gross)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 font-bold" style={{ color: RED }}>
          <label htmlFor="view-discount">Discount</label>
          <input
            id="view-discount"
            inputMode="decimal"
            className="field-input w-36 !py-1 text-right font-mono font-bold"
            style={{ color: RED, borderColor: bad ? RED : undefined }}
            value={editing ? discount : fmtMoney(inv.discount)}
            readOnly={!editing}
            onChange={(ev) => setDiscount(ev.target.value.replace(/[^0-9.,]/g, ""))}
            onBlur={() => {
              const n = num(discount);
              if (editing && Number.isFinite(n)) setDiscount(fmtMoney(n));
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-3 font-bold" style={{ color: RED }}>
          <label htmlFor="view-deduction">Deduction</label>
          <input
            id="view-deduction"
            inputMode="decimal"
            className="field-input w-36 !py-1 text-right font-mono font-bold"
            style={{ color: RED, borderColor: bad ? RED : undefined }}
            value={editing ? deduction : fmtMoney(inv.deduction)}
            readOnly={!editing}
            onChange={(ev) => setDeduction(ev.target.value.replace(/[^0-9.,]/g, ""))}
            onBlur={() => {
              const n = num(deduction);
              if (editing && Number.isFinite(n)) setDeduction(fmtMoney(n));
            }}
          />
        </div>
        {bad && <p className="text-right text-xs" style={{ color: RED }}>The discount and the deduction cannot be negative or more than the gross amount together.</p>}
        <div className="flex items-baseline justify-between text-base font-semibold" style={{ color: RED }}>
          <span>Vat (uncollected)</span>
          <span className="font-mono">{money(shown.vat)}</span>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-1 text-xl font-bold" style={{ color: GREEN }}>
          <span>Service Income</span>
          <span className="font-mono">{money(shown.serviceIncome)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-t border-line px-3 py-3">
        <div>
          <label className="ledger-label mb-1 block">Invoice number</label>
          <input
            className="field-input w-40 font-mono"
            inputMode="numeric"
            value={number}
            readOnly={!editing}
            onChange={(ev) => setNumber(ev.target.value.replace(/\D/g, "").slice(0, 12))}
            aria-label="Invoice number"
          />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Invoice date</label>
          <input type="date" className="field-input" value={date} readOnly={!editing} onChange={(ev) => setDate(ev.target.value)} aria-label="Invoice date" />
        </div>
        {!editing ? (
          <button type="button" className="btn-secondary" onClick={() => setAskPw(true)}>
            Edit
          </button>
        ) : (
          <>
            <button type="button" className="btn-primary" disabled={busy || bad || !/^\d{1,12}$/.test(number) || !/^\d{4}-\d{2}-\d{2}$/.test(date)} onClick={() => void onSaveEdit()}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={cancelEdit}>
              Cancel
            </button>
          </>
        )}
        <button
          type="button"
          className="rounded px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          style={{ backgroundColor: GREEN }}
          onClick={() => window.open(`/invoicing/print?kind=invoice&id=${inv.id}`, "_blank")}
        >
          Print invoice
        </button>
      </div>

      {askPw && (
        <PasswordModal
          title="Edit invoice"
          message="Enter the password to edit this invoice."
          confirmLabel="Unlock"
          onSubmit={async (pw) => {
            const res = await verifyInvoicePassword(pw);
            if (res.error) return res.error;
            passwordRef.current = pw;
            setEditing(true);
            setAskPw(false);
            return null;
          }}
          onCancel={() => setAskPw(false)}
        />
      )}
    </section>
  );
}
