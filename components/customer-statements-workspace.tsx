"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SuccessModal } from "./success-modal";
import {
  getStatementCustomers,
  getStatementDeliveries,
  saveStatementEdits,
  type StatementEdit,
  type StatementCustomer,
  type StatementDelivery,
} from "@/actions/customer-statements";
import { formatDate } from "@/lib/format";
import { money } from "@/lib/report-format";
import { groupKeyOf, isValidPrice, priceMismatches, pricesAllConsistent } from "@/lib/price-check";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LEAVE_MESSAGE = "Some prices are changed but not saved. If you leave, those changes will be discarded. Leave anyway?";
const RED = "#b91c1c";
const ENTRY_GREEN = "#2f7d3b"; // data entry section
const ENTRY_GREEN_DARK = "#1f5c2a";
const INPUT_GREEN = "#dcf3e1"; // its input fields
const ORANGE = "#ab5709"; // the app's orange
const ROYAL_BLUE = "#4169e1";

const toNumber = (text: string) => Number(text.replace(/,/g, ""));
const fmtPrice = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cents = (n: number) => Math.round(n * 100);

type Group = { key: string; label: string; rows: StatementDelivery[] };

export function CustomerStatementsWorkspace() {
  const { setDirty, confirmLeave } = useUnsavedChanges();

  const [month, setMonth] = useState(1);
  const [yearText, setYearText] = useState("");
  const [customers, setCustomers] = useState<StatementCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<StatementDelivery[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [tab, setTab] = useState<1 | 2>(1); // 1 = Big, 2 = Small
  const [drafts, setDrafts] = useState<Record<number, string>>({}); // job order id -> typed price
  const [wDrafts, setWDrafts] = useState<Record<string, string>>({}); // "deliveryId:b|x|c" -> typed weight
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const customersRequest = useRef(0);
  const deliveriesRequest = useRef(0);

  // the period starts at the current month (the browser's date, not the server's)
  useEffect(() => {
    const now = new Date();
    setMonth(now.getMonth() + 1);
    setYearText(String(now.getFullYear()));
  }, []);

  const year = /^\d{4}$/.test(yearText) ? Number(yearText) : null;
  const ym = year != null && year >= 2000 && year <= 2100 ? `${year}-${String(month).padStart(2, "0")}` : null;
  const customer = customers.find((c) => c.id === customerId) ?? null;

  // ---- unsaved price and weight changes (one entry per changed row)
  const changes = useMemo(() => {
    const out: StatementEdit[] = [];
    for (const d of deliveries) {
      const edit: StatementEdit = { deliveryId: d.id, jobOrderId: d.jobOrderId };
      let changed = false;
      const p = drafts[d.jobOrderId];
      if (p !== undefined) {
        const n = toNumber(p);
        if (Number.isFinite(n) && cents(n) !== cents(d.unitPrice)) {
          edit.price = n;
          changed = true;
        }
      }
      const parts: [string, "bodyWt" | "x1Wt" | "ccWt", number][] = [
        ["b", "bodyWt", d.bodyWt],
        ["x", "x1Wt", d.x1Wt],
        ["c", "ccWt", d.ccWt],
      ];
      for (const [k, field, saved] of parts) {
        const t = wDrafts[`${d.id}:${k}`];
        if (t === undefined) continue;
        const n = toNumber(t.trim() === "" ? "0" : t);
        if (Number.isFinite(n) && cents(n) !== cents(saved)) {
          edit[field] = n;
          changed = true;
        }
      }
      if (changed) out.push(edit);
    }
    return out;
  }, [drafts, wDrafts, deliveries]);
  const hasUnsaved = changes.length > 0;

  useEffect(() => {
    setDirty(hasUnsaved, LEAVE_MESSAGE);
  }, [hasUnsaved, setDirty]);
  useEffect(() => {
    return () => setDirty(false);
  }, [setDirty]);

  // ---- customers of the period
  useEffect(() => {
    setCustomerId(null);
    setDeliveries([]);
    setDrafts({});
    setWDrafts({});
    setError(null);
    if (!ym) {
      setCustomers([]);
      return;
    }
    const id = ++customersRequest.current;
    setCustomersLoading(true);
    getStatementCustomers(ym).then((res) => {
      if (id !== customersRequest.current) return; // a newer period was chosen meanwhile
      setCustomersLoading(false);
      setCustomers(res.customers);
      if (res.error) setError(res.error);
    });
  }, [ym]);

  // applies the change at once; only asks first when there are unsaved prices
  function changePeriod(apply: () => void) {
    if (!hasUnsaved) {
      apply();
      return;
    }
    void confirmLeave(true, LEAVE_MESSAGE).then((ok) => {
      if (ok) apply();
    });
  }

  async function loadDeliveries(cid: number) {
    if (!ym) return;
    const id = ++deliveriesRequest.current;
    setDeliveriesLoading(true);
    const res = await getStatementDeliveries(ym, cid);
    if (id !== deliveriesRequest.current) return;
    setDeliveriesLoading(false);
    setDeliveries(res.deliveries);
    setDrafts({});
    setWDrafts({});
    setError(res.error ?? null);
    // open the tab that has deliveries
    if (!res.deliveries.some((d) => d.receivableTypeId === 1) && res.deliveries.some((d) => d.receivableTypeId === 2)) setTab(2);
    else setTab(1);
  }

  async function onSelectCustomer(c: StatementCustomer) {
    if (c.id === customerId) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    setCustomerId(c.id);
    await loadDeliveries(c.id);
  }

  async function onTab(t: 1 | 2) {
    if (t === tab) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    setDrafts({});
    setWDrafts({});
    setTab(t);
  }

  // ---- the two tabs
  const big = useMemo(() => deliveries.filter((d) => d.receivableTypeId === 1), [deliveries]);
  const small = useMemo(() => deliveries.filter((d) => d.receivableTypeId === 2), [deliveries]);
  const tabRows = tab === 1 ? big : small; // already by delivery receipt, ascending
  const totalWt = tabRows.reduce((s, d) => s + d.totalWt, 0);
  const totalRolls = tabRows.reduce((s, d) => s + d.totalRolls, 0);

  // ---- price check: tone, fabric, dye process groups; rows by date then delivery receipt
  const priceOf = (d: StatementDelivery) => {
    const text = drafts[d.jobOrderId];
    if (text === undefined) return d.unitPrice;
    const n = toNumber(text);
    return Number.isFinite(n) ? n : NaN;
  };
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const d of tabRows) {
      const key = groupKeyOf(d.toneId, d.fabricId, d.dyeId);
      const g = map.get(key) ?? { key, label: [d.toneName || "—", d.fabricName || "—", d.dyeName || "—"].join("  ·  "), rows: [] };
      g.rows.push(d);
      map.set(key, g);
    }
    const list = Array.from(map.values());
    for (const g of list) g.rows.sort((a, b) => a.dateDelivery.localeCompare(b.dateDelivery) || a.deliveryReceipt - b.deliveryReceipt || a.id - b.id);
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [tabRows]);
  /** Total weight and amount (weight x price) of a group, from the values as typed. */
  const groupTotal = (g: Group) => {
    let wt = 0;
    let amount = 0;
    for (const d of g.rows) {
      const part = (k: string, saved: number) => {
        const t = wDrafts[`${d.id}:${k}`];
        if (t === undefined) return saved;
        const n = toNumber(t.trim() === "" ? "0" : t);
        return Number.isFinite(n) ? n : saved;
      };
      const weight = part("b", d.bodyWt) + part("x", d.x1Wt) + part("c", d.ccWt);
      const price = priceOf(d);
      wt += weight;
      amount += weight * (Number.isFinite(price) ? price : 0);
    }
    return { wt: Math.round(wt * 100) / 100, amount: Math.round(amount * 100) / 100 };
  };
  const flagged = useMemo(
    () => priceMismatches(groups.flatMap((g) => g.rows.map((d) => ({ id: d.id, groupKey: g.key, price: priceOf(d) })))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, drafts],
  );
  const allSame = useMemo(
    () => pricesAllConsistent(groups.flatMap((g) => g.rows.map((d) => ({ id: d.id, groupKey: g.key, price: priceOf(d) })))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, drafts],
  );
  const canPrint = allSame && !hasUnsaved && !busy;

  /** Saves the given row (all changed rows when none is given). */
  async function onSave(only?: number) {
    const rows = only == null ? changes : changes.filter((c) => c.deliveryId === only);
    if (rows.length === 0) return;
    for (const c of rows) {
      if (c.price !== undefined && !isValidPrice(c.price)) {
        setError("Every price must be greater than zero.");
        return;
      }
    }
    setBusy(true);
    setError(null);
    const res = await saveStatementEdits(rows);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const byId = new Map(rows.map((c) => [c.deliveryId, c]));
    setDeliveries((cur) =>
      cur.map((d) => {
        const c = byId.get(d.id);
        if (!c) return d;
        const bodyWt = c.bodyWt !== undefined ? Math.round(c.bodyWt * 100) / 100 : d.bodyWt;
        const x1Wt = c.x1Wt !== undefined ? Math.round(c.x1Wt * 100) / 100 : d.x1Wt;
        const ccWt = c.ccWt !== undefined ? Math.round(c.ccWt * 100) / 100 : d.ccWt;
        return {
          ...d,
          unitPrice: c.price !== undefined ? Math.round(c.price * 100) / 100 : d.unitPrice,
          bodyWt,
          x1Wt,
          ccWt,
          totalWt: Math.round((bodyWt + x1Wt + ccWt) * 100) / 100,
        };
      }),
    );
    // the typed text of the rows that were not saved stays
    setDrafts((cur) => {
      const next = { ...cur };
      for (const c of rows) delete next[c.jobOrderId];
      return next;
    });
    setWDrafts((cur) => {
      const next = { ...cur };
      for (const c of rows) for (const k of ["b", "x", "c"]) delete next[`${c.deliveryId}:${k}`];
      return next;
    });
    const n = res.saved ?? rows.length;
    setMessage(only != null ? "Saved." : `${n} row${n === 1 ? "" : "s"} saved.`);
  }

  function onPrint(kind: "detailed" | "special") {
    if (!canPrint || !ym || customerId == null) return;
    window.open(`/customer-statements/print?ym=${ym}&customer=${customerId}&rt=${tab}&report=${kind}`, "_blank");
  }

  const tabButton = (t: 1 | 2, label: string, count: number) => (
    <button
      type="button"
      onClick={() => void onTab(t)}
      className={
        "flex items-baseline gap-3 rounded-t border border-b-0 px-6 py-2 " +
        (tab === t ? "border-[#1e3a8a] border-t-4 bg-white text-ink" : "border-line bg-[#e6ebf2] text-ink-soft hover:bg-[#eef3ff]")
      }
      aria-pressed={tab === t}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="font-mono text-2xl font-bold leading-none" style={{ color: ORANGE }}>
        {count}
      </span>
    </button>
  );

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
              const v = Number(e.target.value); // read now: after an await the browser has already reset the value
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
          {ym ? `${customers.length} customer${customers.length === 1 ? "" : "s"} with deliveries` : "Enter a 4-digit year between 2000 and 2100."}
        </p>
      </section>

      {error && <p className="rounded border border-danger px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)_minmax(0,2fr)]">
        {/* customers with a delivery in the period */}
        <section className="self-start rounded border border-line" style={{ backgroundColor: "#d9ecfb" }}>
          <div className="border-b border-line px-3 py-2 text-xs font-semibold text-ink-soft">
            Customers with deliveries in {ym ? `${MONTHS[month - 1]} ${year}` : "the period"} ({customers.length})
          </div>
          <div className="max-h-[36rem] overflow-y-auto" role="listbox" aria-label="Customers">
            {customersLoading && <p className="px-3 py-3 text-sm text-ink-soft">Loading…</p>}
            {!customersLoading && customers.length === 0 && <p className="px-3 py-3 text-sm text-ink-soft">No deliveries in this period.</p>}
            {customers.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={c.id === customerId}
                data-selected={c.id === customerId}
                onClick={() => void onSelectCustomer(c)}
                className={"combo-option flex w-full items-baseline justify-between gap-3 border-b border-line px-3 py-2 text-left text-sm " + (c.id === customerId ? "font-medium" : "")}
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 font-mono text-xs">{c.deliveries}</span>
              </button>
            ))}
          </div>
        </section>

        {/* delivery receipts of the chosen customer: Big and Small tabs */}
        <section>
          {customer == null ? (
            <p className="rounded border border-line bg-white px-4 py-6 text-sm text-ink-soft">Select a customer to see its delivery receipts.</p>
          ) : (
            <>
              <div className="flex items-end gap-1">
                {tabButton(1, "Big", big.length)}
                {tabButton(2, "Small", small.length)}
                <span className="ml-3 truncate pb-1 text-2xl font-bold" style={{ color: ROYAL_BLUE }}>
                  {customer.name}
                </span>
              </div>
              <div className="rounded-b rounded-tr border border-line" style={{ backgroundColor: "#d9ecfb" }}>
                <div className="grid grid-cols-[4.2rem_5.2rem_1fr_2.6rem_5.5rem] gap-2 border-b border-line px-3 py-2 text-xs font-semibold text-ink-soft">
                  <span>DR No.</span>
                  <span>Date</span>
                  <span className="text-right">Weight</span>
                  <span className="text-right">Rolls</span>
                  <span>Ticket No.</span>
                </div>
                <div className="max-h-[20rem] overflow-y-auto">
                  {deliveriesLoading && <p className="px-3 py-3 text-sm text-ink-soft">Loading…</p>}
                  {!deliveriesLoading && tabRows.length === 0 && (
                    <p className="px-3 py-3 text-sm text-ink-soft">No {tab === 1 ? "Big" : "Small"} delivery receipts for this customer in this period.</p>
                  )}
                  {tabRows.map((d) => (
                    <div key={d.id} className="grid grid-cols-[4.2rem_5.2rem_1fr_2.6rem_5.5rem] gap-2 border-b border-line px-3 py-1.5 text-sm">
                      <span className="font-mono">{d.deliveryReceipt}</span>
                      <span className="font-mono">{formatDate(d.dateDelivery)}</span>
                      <span className="text-right font-mono">{money(d.totalWt)}</span>
                      <span className="text-right font-mono">{d.totalRolls}</span>
                      <span className="truncate font-mono">{d.jobTicket}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-[4.2rem_5.2rem_1fr_2.6rem_5.5rem] gap-2 px-3 py-2 text-sm font-bold">
                  <span className="col-span-2">Total ({tabRows.length})</span>
                  <span className="text-right font-mono">{money(totalWt)}</span>
                  <span className="text-right font-mono">{totalRolls}</span>
                  <span />
                </div>
              </div>
            </>
          )}
        </section>

      {/* price check: customer > tone, fabric, dye process > date, customer JO, color, job ticket, price */}
      {customer != null && tabRows.length > 0 && (
        <section className="rounded border border-line text-white" style={{ backgroundColor: ENTRY_GREEN }}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/30 px-4 py-3">
            <div>
              <h2 className="text-base font-bold">{customer.name}</h2>
              <p className="text-xs text-white/85">
                Price check, {tab === 1 ? "Big" : "Small"} delivery receipts. The first price of each group is the reference; a different price shows in red bold.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary" disabled={!hasUnsaved || busy} onClick={() => void onSave()}>
                {busy ? "Saving…" : `Save all${hasUnsaved ? ` (${changes.length})` : ""}`}
              </button>
              <button type="button" className="btn-secondary" disabled={!canPrint} onClick={() => onPrint("detailed")} title="Detailed statement">
                Print detailed
              </button>
              <button type="button" className="btn-secondary" disabled={!canPrint} onClick={() => onPrint("special")} title="Statement with Body, 1x1 and C+C">
                Print special
              </button>
            </div>
          </div>
          {flagged.size > 0 ? (
            <p className="mx-4 mt-3 rounded bg-white px-3 py-2 text-sm font-semibold" style={{ color: RED }}>
              {flagged.size} price{flagged.size === 1 ? "" : "s"} differ{flagged.size === 1 ? "s" : ""} from the first price of their group. Correct them, then save, to enable printing.
            </p>
          ) : hasUnsaved ? (
            <p className="px-4 pt-3 text-sm text-white/90">Save the changed prices and weights to enable printing.</p>
          ) : null}

          <div className="space-y-4 p-4">
            {groups.map((g) => (
              <div key={g.key} className="rounded border border-white/30">
                <div
                  className="flex items-center justify-between gap-3 border-b border-white/30 px-3 py-1.5 text-sm font-bold"
                  style={{ backgroundColor: ENTRY_GREEN_DARK }}
                >
                  <span className="truncate">{g.label}</span>
                  <span className="shrink-0 font-mono" title="Total weight and amount (weight x price) of this group">
                    Total: {money(groupTotal(g).wt)} kgs · {money(groupTotal(g).amount)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[52rem]">
                <div className="grid grid-cols-[5.2rem_6.5rem_minmax(4rem,1fr)_6.5rem_5rem_5rem_5rem_6rem_3.6rem] gap-2 border-b border-white/30 px-3 py-1.5 text-xs font-semibold text-white/85">
                  <span>Date</span>
                  <span>Customer JO</span>
                  <span>Color</span>
                  <span>Job ticket</span>
                  <span className="text-right">Body wt</span>
                  <span className="text-right">1x1 wt</span>
                  <span className="text-right">C+C wt</span>
                  <span className="text-right">Price</span>
                  <span />
                </div>
                {g.rows.map((d) => {
                  const bad = flagged.has(d.id);
                  const locked = d.invoiceId !== 0;
                  const text = drafts[d.jobOrderId] ?? fmtPrice(d.unitPrice);
                  const changedRow = changes.some((c) => c.deliveryId === d.id);
                  const weightInput = (k: "b" | "x" | "c", saved: number, label: string) => {
                    const key = `${d.id}:${k}`;
                    return (
                      <input
                        inputMode="decimal"
                        className="field-input !px-2 !py-1 text-right font-mono text-ink disabled:opacity-60"
                        style={{ backgroundColor: INPUT_GREEN }}
                        value={wDrafts[key] ?? fmtPrice(saved)}
                        disabled={locked || busy}
                        title={locked ? "Invoiced: the weight cannot be changed" : undefined}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.,]/g, "");
                          setWDrafts((cur) => ({ ...cur, [key]: v }));
                        }}
                        onBlur={() => {
                          const t = wDrafts[key];
                          const n = toNumber(t ?? "");
                          if (t !== undefined && t.trim() !== "" && Number.isFinite(n)) setWDrafts((cur) => ({ ...cur, [key]: fmtPrice(n) }));
                        }}
                        aria-label={`${label} weight of ${d.jobTicket}`}
                      />
                    );
                  };
                  return (
                    <div key={d.id} className="grid grid-cols-[5.2rem_6.5rem_minmax(4rem,1fr)_6.5rem_5rem_5rem_5rem_6rem_3.6rem] items-center gap-2 border-b border-white/20 px-3 py-1 text-sm last:border-b-0">
                      <span className="font-mono">{formatDate(d.dateDelivery)}</span>
                      <span className="truncate font-mono">{d.cusJoNo}</span>
                      <span className="truncate">{d.color}</span>
                      <span className="truncate font-mono">{d.jobTicket}</span>
                      {weightInput("b", d.bodyWt, "Body")}
                      {weightInput("x", d.x1Wt, "1x1")}
                      {weightInput("c", d.ccWt, "C+C")}
                      <input
                        inputMode="decimal"
                        className="field-input !px-2 !py-1 text-right font-mono text-ink disabled:opacity-60"
                        style={bad ? { backgroundColor: INPUT_GREEN, color: RED, fontWeight: 700 } : { backgroundColor: INPUT_GREEN }}
                        value={text}
                        disabled={locked || busy}
                        title={locked ? "Invoiced: the price cannot be changed" : undefined}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.,]/g, "");
                          setDrafts((cur) => ({ ...cur, [d.jobOrderId]: v }));
                        }}
                        onBlur={() => {
                          const n = toNumber(drafts[d.jobOrderId] ?? "");
                          if (drafts[d.jobOrderId] !== undefined && Number.isFinite(n)) {
                            setDrafts((cur) => ({ ...cur, [d.jobOrderId]: fmtPrice(n) }));
                          }
                        }}
                        aria-label={`Price of ${d.jobTicket}`}
                      />
                      <button type="button" className="btn-secondary !px-2 !py-1 text-xs" disabled={!changedRow || busy} onClick={() => void onSave(d.id)}>
                        Save
                      </button>
                    </div>
                  );
                })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      </div>

      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}
