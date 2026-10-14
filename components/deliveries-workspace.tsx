"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ComboBox } from "./combo-box";
import { PasswordModal } from "./password-modal";
import { SuccessModal } from "./success-modal";
import {
  addJobOrderWithDelivery,
  getCustomerDefaultAliases,
  getDeliveryIndex,
  setCustomerDefaultAlias,
  updateDelivery,
  verifyDeliveryPassword,
  type DeliveryRecord,
} from "@/actions/deliveries";
import { formatDate } from "@/lib/format";
import { money } from "@/lib/report-format";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

const LEAVE_MESSAGE = "This delivery is not saved. If you leave, what you entered will be discarded. Leave anyway?";
const GREEN = "#15803d";
const RED = "#b91c1c";

const toNumber = (text: string) => Number(text.replace(/,/g, ""));
const fmtInput = (text: string) => {
  const n = toNumber(text);
  return text.trim() !== "" && Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : text;
};

export function DeliveriesWorkspace({
  types,
  customers,
  aliases,
  tones,
  fabrics,
  dyes,
}: {
  types: { id: number; name: string }[];
  customers: { id: number; name: string; no: number | null }[];
  aliases: { id: number; name: string; customerNos: number[] }[];
  tones: { id: number; name: string }[];
  fabrics: { id: number; name: string }[];
  dyes: { id: number; name: string }[];
}) {
  const { setDirty, confirmLeave } = useUnsavedChanges();

  // every saved delivery; the filters below work on this list
  const [index, setIndex] = useState<DeliveryRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriod] = useState(""); // yyyy-mm, empty = all periods
  // the three search fields work one at a time: choosing one empties the other two (the month and year stay)
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [drFilterId, setDrFilterId] = useState<number | null>(null); // a delivery picked in "Find delivery receipt"
  const [cusJoFilterId, setCusJoFilterId] = useState<number | null>(null); // a delivery picked in "Find Customer Job Order"

  // what the entry section shows: a saved delivery (locked until unlocked) or a new one
  const [editing, setEditing] = useState<DeliveryRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [locked, setLocked] = useState(true);
  const [showUnlock, setShowUnlock] = useState(false);
  const passwordRef = useRef("");

  // delivery fields
  const [dateDelivery, setDateDelivery] = useState("");
  const [receipt, setReceipt] = useState("");
  const [typeId, setTypeId] = useState<number | null>(null);
  // delivered weight and rolls are typed as Body, 1x1 and C+C; the totals below are computed
  const [bodyWtText, setBodyWtText] = useState("");
  const [bodyCtText, setBodyCtText] = useState("");
  const [x1WtText, setX1WtText] = useState("");
  const [x1CtText, setX1CtText] = useState("");
  const [ccWtText, setCcWtText] = useState("");
  const [ccCtText, setCcCtText] = useState("");
  const [aliasId, setAliasId] = useState<number | null>(null); // tbl_Deliveries.alias_id (empty = no alias; only Big receipts have one)
  const [defaultAliases, setDefaultAliases] = useState<Record<number, number>>({}); // customer id -> tbl_Customer.default_alias_id
  // job order fields (new records only)
  const [newCustomerId, setNewCustomerId] = useState<number | null>(null);
  const [newTicket, setNewTicket] = useState("");
  const [newCusJo, setNewCusJo] = useState("");
  const [newTicketWt, setNewTicketWt] = useState("");
  const [newTicketRolls, setNewTicketRolls] = useState("");
  const [newUnitPrice, setNewUnitPrice] = useState("");
  const [newColor, setNewColor] = useState("");
  const [newToneId, setNewToneId] = useState<number | null>(null);
  const [newFabricId, setNewFabricId] = useState<number | null>(null);
  const [newDyeId, setNewDyeId] = useState<number | null>(null);

  const [baseline, setBaseline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const numOf = (t: string) => {
    const n = toNumber(t.trim() === "" ? "0" : t);
    return Number.isFinite(n) ? n : 0;
  };
  const weightParts = [bodyWtText, x1WtText, ccWtText];
  const countParts = [bodyCtText, x1CtText, ccCtText];
  const weightText = weightParts.some((t) => t.trim() !== "") ? fmtInput(String(Math.round(weightParts.reduce((s, t) => s + numOf(t), 0) * 100) / 100)) : "";
  const rollsText = countParts.some((t) => t.trim() !== "") ? String(countParts.reduce((s, t) => s + numOf(t), 0)) : "";
  const deliveredParts = {
    bodyWt: numOf(bodyWtText),
    bodyCount: numOf(bodyCtText),
    x1Wt: numOf(x1WtText),
    x1Count: numOf(x1CtText),
    ccWt: numOf(ccWtText),
    ccCount: numOf(ccCtText),
  };

  const snap = [dateDelivery, receipt, typeId, bodyWtText, bodyCtText, x1WtText, x1CtText, ccWtText, ccCtText, aliasId].join("|");
  const newFilled =
    newCustomerId != null || newTicket !== "" || newCusJo !== "" || newTicketWt !== "" || newTicketRolls !== "" || newUnitPrice !== "" ||
    receipt !== "" || typeId != null || weightText !== "" || rollsText !== "" ||
    aliasId != null || newColor !== "" || newToneId != null || newFabricId != null || newDyeId != null;
  const hasUnsaved = editing ? !locked && snap !== baseline : adding ? newFilled : false;

  useEffect(() => {
    setDirty(hasUnsaved, LEAVE_MESSAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsaved]);
  useEffect(() => {
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadIndex();
    void getCustomerDefaultAliases().then((r) => setDefaultAliases(r.defaults));
    setDateDelivery(todayLocal());
  }, []);

  function todayLocal() {
    // today, in the user's own time zone (the server runs in UTC)
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  async function loadIndex() {
    const res = await getDeliveryIndex();
    setLoadError(res.error ?? null);
    setIndex(res.records ?? []);
    return res.records ?? [];
  }

  // ---- filtering: the period applies to all three search dropdowns and to the list
  const filtered = useMemo(() => index.filter((d) => !period || d.dateDelivery.startsWith(period)), [index, period]);

  const customerOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const d of filtered) if (d.customerId && !seen.has(d.customerId)) seen.set(d.customerId, d.customerName);
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filtered]);

  const drOptions = useMemo(
    () =>
      filtered.map((d) => ({
        id: d.id,
        label: String(d.deliveryReceipt),
        columns: [String(d.deliveryReceipt), formatDate(d.dateDelivery), d.customerName, d.jobTicket],
      })),
    [filtered]
  );
  const cusJoOptions = useMemo(
    () =>
      filtered
        .filter((d) => d.cusJoNo !== "")
        .sort((a, b) => b.cusJoNo.localeCompare(a.cusJoNo, undefined, { numeric: true }) || b.deliveryReceipt - a.deliveryReceipt)
        .map((d) => ({
          id: d.id,
          label: d.cusJoNo,
          columns: [d.cusJoNo, String(d.deliveryReceipt), formatDate(d.dateDelivery)],
        })),
    [filtered]
  );

  // the list: every delivery receipt of the period, narrowed by the one search field in use
  const pickedDr = drFilterId != null ? filtered.find((d) => d.id === drFilterId) : undefined;
  const pickedCusJo = cusJoFilterId != null ? filtered.find((d) => d.id === cusJoFilterId) : undefined;
  const listRows = useMemo(() => {
    const rows = pickedDr
      ? filtered.filter((d) => d.deliveryReceipt === pickedDr.deliveryReceipt)
      : pickedCusJo
        ? filtered.filter((d) => d.cusJoNo === pickedCusJo.cusJoNo)
        : customerId != null
          ? filtered.filter((d) => d.customerId === customerId)
          : filtered;
    // delivery receipt number, smallest first
    return [...rows].sort((a, b) => a.deliveryReceipt - b.deliveryReceipt || a.id - b.id);
  }, [filtered, pickedDr, pickedCusJo, customerId]);
  const filterNames = [
    period ? "Month/Year" : null,
    pickedDr ? "Delivery Receipt" : pickedCusJo ? "Job Order" : customerId != null ? "Customer" : null,
  ].filter(Boolean);
  const listTitle = `Available DR${filterNames.length > 0 ? ` for ${filterNames.join(" and ")}` : ""} (${listRows.length})`;
  const anyFilter = period !== "" || customerId != null || drFilterId != null || cusJoFilterId != null;

  // the alias dropdown only lists the aliases whose associated_customer contains the customer's customer_no
  const entryCustomerNo = editing ? editing.customerNo : customers.find((c) => c.id === newCustomerId)?.no ?? null;
  const entryCustomerId = editing ? editing.customerId : newCustomerId;
  const defaultAliasId = entryCustomerId != null ? defaultAliases[entryCustomerId] ?? null : null;
  // an alias can only be entered for a Big receipt (receivable_type_id = 1); any other receipt has none
  const aliasAllowed = typeId === 1;
  const aliasOptions = useMemo(() => {
    if (!aliasAllowed) return [];
    const list = aliases
      .filter((a) => a.id !== 0 && entryCustomerNo != null && a.customerNos.includes(entryCustomerNo))
      .map((a) => ({ id: a.id, label: a.name }));
    // the alias already saved on this delivery stays visible
    if (editing && aliasId != null && aliasId === editing.aliasId && !list.some((o) => o.id === aliasId)) {
      const cur = aliases.find((a) => a.id === aliasId);
      if (cur) list.push({ id: cur.id, label: cur.name });
    }
    return list;
  }, [aliases, entryCustomerNo, aliasAllowed, aliasId, editing]);
  // a new delivery drops an alias that no longer fits the chosen customer
  useEffect(() => {
    if (aliasId != null && !aliasOptions.some((o) => o.id === aliasId)) setAliasId(null);
  }, [aliasOptions, aliasId]);
  // a new delivery starts with the customer's default alias (the user can still change it)
  useEffect(() => {
    if (!adding || editing || !aliasAllowed || aliasId != null || defaultAliasId == null) return;
    if (aliasOptions.some((o) => o.id === defaultAliasId)) setAliasId(defaultAliasId);
  }, [adding, editing, aliasAllowed, aliasId, defaultAliasId, aliasOptions]);

  async function onSetDefault() {
    if (entryCustomerId == null || aliasId == null) return;
    setError(null);
    setBusy(true);
    const res = await setCustomerDefaultAlias(entryCustomerId, aliasId);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setDefaultAliases((cur) => ({ ...cur, [entryCustomerId]: aliasId }));
    const aliasName = aliases.find((a) => a.id === aliasId)?.name ?? "";
    const customerName = editing?.customerName ?? customers.find((c) => c.id === entryCustomerId)?.name ?? "";
    setMessage(`"${aliasName}" is now the default alias of ${customerName}.`);
  }

  // a selection that has no deliveries in a newly chosen period drops out of its filter
  useEffect(() => {
    if (customerId != null && !customerOptions.some((c) => c.id === customerId)) setCustomerId(null);
    if (drFilterId != null && !filtered.some((d) => d.id === drFilterId)) setDrFilterId(null);
    if (cusJoFilterId != null && !filtered.some((d) => d.id === cusJoFilterId)) setCusJoFilterId(null);
  }, [customerOptions, filtered, customerId, drFilterId, cusJoFilterId]);

  // ---- entry state
  function resetEntry() {
    setReceipt("");
    setTypeId(null);
    setBodyWtText("");
    setBodyCtText("");
    setX1WtText("");
    setX1CtText("");
    setCcWtText("");
    setCcCtText("");
    setDateDelivery(todayLocal());
    setNewCustomerId(null);
    setNewTicket("");
    setNewCusJo("");
    setNewTicketWt("");
    setNewTicketRolls("");
    setNewUnitPrice("");
    setNewColor("");
    setNewToneId(null);
    setNewFabricId(null);
    setNewDyeId(null);
    setAliasId(null);
    setBaseline("");
    setError(null);
  }

  function fillFrom(d: DeliveryRecord) {
    const bw = fmtInput(String(d.bodyWt));
    const xw = fmtInput(String(d.x1Wt));
    const cw = fmtInput(String(d.ccWt));
    setEditing(d);
    setAdding(false);
    setLocked(true);
    passwordRef.current = "";
    setDateDelivery(d.dateDelivery);
    setReceipt(String(d.deliveryReceipt));
    setTypeId(d.receivableTypeId);
    setBodyWtText(bw);
    setBodyCtText(String(d.bodyCount));
    setX1WtText(xw);
    setX1CtText(String(d.x1Count));
    setCcWtText(cw);
    setCcCtText(String(d.ccCount));
    // only Big receipts have an alias (an old 0 = "no alias" is shown as empty)
    const loadedAlias = d.receivableTypeId === 1 && d.aliasId !== 0 ? d.aliasId : null;
    setAliasId(loadedAlias);
    setBaseline([d.dateDelivery, String(d.deliveryReceipt), d.receivableTypeId, bw, String(d.bodyCount), xw, String(d.x1Count), cw, String(d.ccCount), loadedAlias].join("|"));
    setError(null);
  }

  /** Shows a saved delivery in the entry section (the filters stay as they are). */
  async function openDelivery(id: number): Promise<boolean> {
    const d = index.find((x) => x.id === id);
    if (!d) return false;
    if (d.id === editing?.id && !adding) return true;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return false;
    fillFrom(d);
    return true;
  }

  async function onPickDr(id: number | null) {
    if (id == null) {
      setDrFilterId(null);
      return;
    }
    if (!(await openDelivery(id))) return;
    setDrFilterId(id);
    setCustomerId(null);
    setCusJoFilterId(null);
  }

  async function onPickCusJo(id: number | null) {
    if (id == null) {
      setCusJoFilterId(null);
      return;
    }
    if (!(await openDelivery(id))) return;
    setCusJoFilterId(id);
    setCustomerId(null);
    setDrFilterId(null);
  }

  async function onPickCustomer(id: number | null) {
    if (id === customerId) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    setEditing(null);
    setAdding(false);
    setLocked(true);
    resetEntry();
    setCustomerId(id);
    setDrFilterId(null);
    setCusJoFilterId(null);
  }

  /** Choosing a month and year shows every delivery receipt of that period: the other search fields are emptied. */
  function onPickPeriod(value: string) {
    setPeriod(value);
    setCustomerId(null);
    setDrFilterId(null);
    setCusJoFilterId(null);
  }

  /** The All button: empties every filter field (month/year, customer, delivery receipt, job order). */
  function onClearFilters() {
    setPeriod("");
    setCustomerId(null);
    setDrFilterId(null);
    setCusJoFilterId(null);
  }

  async function onAddNew() {
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    setEditing(null);
    setLocked(true);
    passwordRef.current = "";
    resetEntry();
    setAdding(true);
  }

  /** Leaves the entry section without saving (asks first when something would be lost). */
  async function onCancel() {
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    setEditing(null);
    setAdding(false);
    setLocked(true);
    passwordRef.current = "";
    resetEntry();
  }

  async function onSave() {
    setError(null);
    setBusy(true);

    if (editing) {
      const res = await updateDelivery({
        id: editing.id,
        dateDelivery,
        deliveryReceipt: Number(receipt),
        receivableTypeId: typeId,
        parts: deliveredParts,
        aliasId,
        password: passwordRef.current,
      });
      setBusy(false);
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage(`Delivery receipt ${receipt} (job ticket ${editing.jobTicket}) updated.`);
      const records = await loadIndex();
      const fresh = records.find((r) => r.id === editing.id);
      if (fresh) fillFrom(fresh); // shows the saved values and locks the entry again
      return;
    }

    const res = await addJobOrderWithDelivery({
      customerId: newCustomerId,
      jobTicket: newTicket,
      cusJoNo: newCusJo,
      ticketWeight: toNumber(newTicketWt),
      ticketRolls: Number(newTicketRolls),
      unitPrice: toNumber(newUnitPrice),
      dateDelivery,
      deliveryReceipt: Number(receipt),
      receivableTypeId: typeId,
      parts: deliveredParts,
      aliasId,
      color: newColor,
      toneId: newToneId,
      fabricId: newFabricId,
      dyeProcessId: newDyeId,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMessage(`Job ticket ${newTicket.trim()} and its delivery saved.`);
    const savedCustomer = newCustomerId;
    const records = await loadIndex();
    const fresh = records.find((r) => r.id === res.deliveryId);
    if (fresh) {
      fillFrom(fresh);
      if (savedCustomer) {
        setCustomerId(savedCustomer);
        setDrFilterId(null);
        setCusJoFilterId(null);
      }
    } else {
      setAdding(false);
      resetEntry();
    }
  }

  // ---- weights and rolls table
  const entryOpen = editing != null || adding;
  const ticketWeight = editing ? editing.ticketWeight : toNumber(newTicketWt) || 0;
  const ticketRolls = editing ? editing.ticketRolls : Number(newTicketRolls) || 0;
  const deliveredWt = toNumber(weightText) || 0;
  const deliveredRolls = Number(rollsText) || 0;
  // loss = ((ticket weight - delivered weight) / ticket weight) * 100
  const lossPct = ticketWeight > 0 ? ((ticketWeight - deliveredWt) / ticketWeight) * 100 : 0;
  const rollBalance = ticketRolls - deliveredRolls;
  const weightShown = weightText !== "" && ticketWeight > 0;
  const weightPass = lossPct < 5;
  const rollsShown = rollsText !== "" && ticketRolls > 0;
  const rollsPass = rollBalance === 0;
  const deliveryDisabled = editing != null && locked;

  return (
    <div className="max-w-6xl">
      {/* filters */}
      <div className="mb-5 grid gap-4 md:grid-cols-4">
        <div>
          <label className="ledger-label mb-1 block">Month and year</label>
          <div className="flex gap-2">
            <input type="month" className="field-input" value={period} onChange={(e) => onPickPeriod(e.target.value)} />
            <button type="button" className="btn-secondary shrink-0 !px-3" disabled={!anyFilter} onClick={onClearFilters} title="Clear all filter fields">
              All
            </button>
          </div>
        </div>
        <div>
          <label className="ledger-label mb-1 block">Find customer</label>
          <ComboBox
            options={customerOptions}
            value={customerId}
            onChange={(id) => void onPickCustomer(id)}
            placeholder={customerOptions.length === 0 ? "No deliveries in this period" : "Select customer…"}
            disabled={customerOptions.length === 0}
          />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Find delivery receipt</label>
          <ComboBox
            options={drOptions}
            value={drFilterId}
            onChange={(id) => void onPickDr(id)}
            placeholder="Search delivery receipt…"
            columnTemplate="5rem 6.5rem 1fr 6rem"
            columnAlign={["right", "left", "left", "left"]}
            listMinWidth="32rem"
          />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Find Customer Job Order</label>
          <ComboBox
            options={cusJoOptions}
            value={cusJoFilterId}
            onChange={(id) => void onPickCusJo(id)}
            placeholder="Search Customer Job Order…"
            columnTemplate="1fr 5rem 6.5rem"
            columnAlign={["left", "right", "left"]}
            listMinWidth="26rem"
          />
        </div>
      </div>
      {loadError && <p className="mb-4 text-sm text-danger">{loadError}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_30rem]">
        {/* available delivery receipts (listbox), light blue: the period, narrowed by the search field in use */}
        <section className="self-start rounded border border-line" style={{ backgroundColor: "#d9ecfb" }}>
          <div className="border-b border-line px-3 py-2 text-xs font-semibold text-ink-soft">{listTitle}</div>
          <div className="grid grid-cols-[5rem_6.5rem_6rem_4rem_1fr] gap-3 border-b border-line px-3 py-1.5 text-xs font-semibold text-ink-soft">
            <span className="text-right">DR No.</span>
            <span>Date</span>
            <span className="text-right">Weight</span>
            <span className="text-right">Count</span>
            <span>Ticket No.</span>
          </div>
          <div className="max-h-[28rem] overflow-y-auto" role="listbox" aria-label="Available delivery receipts">
            {listRows.length === 0 && <p className="px-3 py-3 text-sm text-ink-soft">No delivery receipts for these filters.</p>}
            {listRows.map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={t.id === editing?.id}
                data-selected={t.id === editing?.id}
                onClick={() => void openDelivery(t.id)}
                className={
                  "combo-option grid w-full grid-cols-[5rem_6.5rem_6rem_4rem_1fr] gap-3 border-b border-line px-3 py-2 text-left text-sm " +
                  (t.id === editing?.id ? "font-medium" : "")
                }
              >
                <span className="text-right font-mono">{t.deliveryReceipt}</span>
                <span>{formatDate(t.dateDelivery)}</span>
                <span className="text-right font-mono">{money(t.totalDeliveredWt)}</span>
                <span className="text-right font-mono">{t.totalRollCount}</span>
                <span className="truncate font-mono">{t.jobTicket}</span>
              </button>
            ))}
          </div>
        </section>

        {/* data entry (right) */}
        <section className="panel panel-navy self-start">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold">
              {editing ? (
                <>
                  Delivery of job ticket <span className="font-mono">{editing.jobTicket}</span>
                </>
              ) : adding ? (
                "New job ticket and delivery"
              ) : (
                "Delivery entry"
              )}
            </h2>
            <span className="ml-auto" />
            <button type="button" className="btn-secondary !px-3 !py-1 text-xs" onClick={() => void onAddNew()} disabled={adding && !newFilled}>
              Add new
            </button>
          </div>

          {!entryOpen ? (
            <p className="text-sm opacity-85">Select a delivery receipt from the list, search a delivery receipt or Customer Job Order, or press Add new.</p>
          ) : (
            <div className="grid gap-4">
              {editing && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="opacity-90">
                    {editing.customerName}
                    {editing.cusJoNo ? ` · ${editing.cusJoNo}` : ""}
                  </span>
                  <span className="ml-auto" />
                  {locked ? (
                    <button type="button" className="btn-secondary !px-3 !py-1 text-xs" onClick={() => setShowUnlock(true)}>
                      Unlock to edit
                    </button>
                  ) : (
                    <span className="rounded-sm bg-white/20 px-2 py-0.5">Unlocked</span>
                  )}
                </div>
              )}

              {/* job order details of a saved delivery (they come from the job order, read only) */}
              {editing && (
                <div className="grid grid-cols-2 gap-3 border-b border-white/25 pb-4">
                  <div>
                    <label className="ledger-label mb-1 block">Color</label>
                    <input className="field-input opacity-60" value={editing.color} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className="ledger-label mb-1 block">Tone</label>
                    <input className="field-input opacity-60" value={editing.toneName} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className="ledger-label mb-1 block">Fabric</label>
                    <input className="field-input opacity-60" value={editing.fabricName} readOnly tabIndex={-1} />
                  </div>
                  <div>
                    <label className="ledger-label mb-1 block">Dye process</label>
                    <input className="field-input opacity-60" value={editing.dyeProcessName} readOnly tabIndex={-1} />
                  </div>
                </div>
              )}

              {/* job order information (new records) */}
              {adding && (
                <div className="grid gap-4 border-b border-white/25 pb-4">
                  <div>
                    <label className="ledger-label mb-1 block">Customer</label>
                    <ComboBox
                      options={customers.map((c) => ({ id: c.id, label: c.name }))}
                      value={newCustomerId}
                      onChange={setNewCustomerId}
                      placeholder="Select customer…"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="ledger-label mb-1 block">Job ticket</label>
                      <input className="field-input font-mono" value={newTicket} onChange={(e) => setNewTicket(e.target.value)} />
                    </div>
                    <div>
                      <label className="ledger-label mb-1 block">Customer Job Order</label>
                      <input className="field-input font-mono" value={newCusJo} onChange={(e) => setNewCusJo(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="ledger-label mb-1 block">Unit price</label>
                    <input
                      inputMode="decimal"
                      className="field-input text-right font-mono"
                      value={newUnitPrice}
                      onChange={(e) => setNewUnitPrice(e.target.value.replace(/[^0-9.,]/g, ""))}
                      onBlur={() => setNewUnitPrice(fmtInput(newUnitPrice))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="ledger-label mb-1 block">Color</label>
                      <input className="field-input" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
                    </div>
                    <div>
                      <label className="ledger-label mb-1 block">Tone</label>
                      <ComboBox options={tones.map((x) => ({ id: x.id, label: x.name }))} value={newToneId} onChange={setNewToneId} placeholder="Select tone…" />
                    </div>
                    <div>
                      <label className="ledger-label mb-1 block">Fabric</label>
                      <ComboBox options={fabrics.map((x) => ({ id: x.id, label: x.name }))} value={newFabricId} onChange={setNewFabricId} placeholder="Select fabric…" />
                    </div>
                    <div>
                      <label className="ledger-label mb-1 block">Dye process</label>
                      <ComboBox options={dyes.map((x) => ({ id: x.id, label: x.name }))} value={newDyeId} onChange={setNewDyeId} placeholder="Select dye process…" />
                    </div>
                  </div>
                </div>
              )}

              {/* delivered Body, 1x1 and C+C: columns are the types, rows are Weight and Rolls (the totals below are computed).
                  The inputs are in column order in the page, so Tab goes: body weight, body rolls, 1x1 weight, 1x1 rolls, C+C weight, C+C rolls. */}
              <div className="mb-3 grid gap-x-2 gap-y-1 text-xs" style={{ gridTemplateColumns: "3.5rem repeat(3, minmax(0, 1fr))" }}>
                {["Body", "1x1", "C+C"].map((label, i) => (
                  <span key={label} className="px-1 py-1 text-right font-medium opacity-90" style={{ gridColumn: i + 2, gridRow: 1 }}>
                    {label}
                  </span>
                ))}
                <span className="px-1 py-1 text-left font-medium opacity-90" style={{ gridColumn: 1, gridRow: 2 }}>
                  Weight
                </span>
                <span className="px-1 py-1 text-left font-medium opacity-90" style={{ gridColumn: 1, gridRow: 3 }}>
                  Rolls
                </span>
                {(
                  [
                    ["Body", bodyWtText, setBodyWtText, bodyCtText, setBodyCtText],
                    ["1x1", x1WtText, setX1WtText, x1CtText, setX1CtText],
                    ["C+C", ccWtText, setCcWtText, ccCtText, setCcCtText],
                  ] as const
                ).flatMap(([label, wt, setWt, ct, setCt], i) => [
                  <input
                    key={`${label}-wt`}
                    inputMode="decimal"
                    className="field-input !px-2 !py-1.5 text-right font-mono disabled:opacity-60"
                    style={{ gridColumn: i + 2, gridRow: 2 }}
                    value={wt}
                    disabled={deliveryDisabled}
                    onChange={(e) => setWt(e.target.value.replace(/[^0-9.,]/g, ""))}
                    onBlur={() => setWt(fmtInput(wt))}
                    placeholder="0.00"
                    aria-label={`${label} weight`}
                  />,
                  <input
                    key={`${label}-ct`}
                    inputMode="numeric"
                    className="field-input !px-2 !py-1.5 text-right font-mono disabled:opacity-60"
                    style={{ gridColumn: i + 2, gridRow: 3 }}
                    value={ct}
                    disabled={deliveryDisabled}
                    onChange={(e) => setCt(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="0"
                    aria-label={`${label} rolls`}
                  />,
                ])}
              </div>

              {/* totals: delivered box (computed) | ticket box | loss / balance message */}
              <table className="w-full table-fixed border-collapse text-xs">
                <thead>
                  <tr className="opacity-90">
                    <th className="w-12 px-1 py-1 text-left font-medium"></th>
                    <th className="px-1 py-1 text-right font-medium">Delivered</th>
                    <th className="px-1 py-1 text-right font-medium">Ticket</th>
                    <th className="w-32 px-1 py-1 text-center font-medium">Loss / Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th className="px-1 py-1 text-left font-medium opacity-90">Weight</th>
                    <td className="px-1 py-1">
                      <input
                        inputMode="decimal"
                        className="field-input !px-2 !py-1.5 text-right font-mono opacity-60"
                        value={weightText}
                        readOnly
                        tabIndex={-1}
                        placeholder="0.00"
                        aria-label="Total delivered weight (Body + 1x1 + C+C)"
                      />
                    </td>
                    <td className="px-1 py-1">
                      {adding ? (
                        <input
                          inputMode="decimal"
                          className="field-input !px-2 !py-1.5 text-right font-mono"
                          value={newTicketWt}
                          onChange={(e) => setNewTicketWt(e.target.value.replace(/[^0-9.,]/g, ""))}
                          onBlur={() => setNewTicketWt(fmtInput(newTicketWt))}
                          placeholder="0.00"
                          aria-label="Ticket weight"
                        />
                      ) : (
                        <input className="field-input !px-2 !py-1.5 text-right font-mono opacity-60" value={money(ticketWeight)} readOnly tabIndex={-1} aria-label="Ticket weight" />
                      )}
                    </td>
                    <td className="px-1 py-1 text-center">
                      <span
                        className="inline-block rounded bg-white px-2 py-1.5 font-mono text-[11px] font-bold"
                        style={{ color: weightShown ? (weightPass ? GREEN : RED) : "#8A94A6" }}
                      >
                        {weightShown ? `${weightPass ? "PASS" : "FAIL"} (${lossPct.toFixed(2)}%)` : "—"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th className="px-1 py-1 text-left font-medium opacity-90">Rolls</th>
                    <td className="px-1 py-1">
                      <input
                        inputMode="numeric"
                        className="field-input !px-2 !py-1.5 text-right font-mono opacity-60"
                        value={rollsText}
                        readOnly
                        tabIndex={-1}
                        aria-label="Total delivered rolls (Body + 1x1 + C+C)"
                      />
                    </td>
                    <td className="px-1 py-1">
                      {adding ? (
                        <input
                          inputMode="numeric"
                          className="field-input !px-2 !py-1.5 text-right font-mono"
                          value={newTicketRolls}
                          onChange={(e) => setNewTicketRolls(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          aria-label="Ticket rolls"
                        />
                      ) : (
                        <input className="field-input !px-2 !py-1.5 text-right font-mono opacity-60" value={String(ticketRolls)} readOnly tabIndex={-1} aria-label="Ticket rolls" />
                      )}
                    </td>
                    <td className="px-1 py-1 text-center">
                      <span
                        className="inline-block rounded bg-white px-2 py-1.5 font-mono text-[11px] font-bold"
                        style={{ color: rollsShown ? (rollsPass ? GREEN : RED) : "#8A94A6" }}
                      >
                        {rollsShown ? `${rollsPass ? "PASS" : "FAIL"} (${rollBalance})` : "—"}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div>
                <label className="ledger-label mb-1 block">Date delivered</label>
                <input type="date" className="field-input disabled:opacity-60" value={dateDelivery} disabled={deliveryDisabled} onChange={(e) => setDateDelivery(e.target.value)} />
              </div>
              <div>
                <label className="ledger-label mb-1 block">Delivery receipt</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="field-input font-mono disabled:opacity-60"
                  value={receipt}
                  disabled={deliveryDisabled}
                  onChange={(e) => setReceipt(e.target.value.replace(/\D/g, "").slice(0, 15))}
                />
              </div>
              <div>
                <label className="ledger-label mb-1 block">Receivable type</label>
                <select
                  className="field-input disabled:opacity-60"
                  value={typeId ?? ""}
                  disabled={deliveryDisabled}
                  onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Select…</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ledger-label mb-1 block">Alias</label>
                <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                <ComboBox
                  options={aliasOptions}
                  value={aliasId}
                  onChange={setAliasId}
                  disabled={deliveryDisabled || !aliasAllowed}
                  placeholder={
                    !aliasAllowed
                      ? "Alias is only for Big receipts"
                      : entryCustomerNo == null
                        ? "Select the customer first"
                        : aliasOptions.length === 0
                          ? "No alias linked to this customer"
                          : "Select alias…"
                  }
                />
                </div>
                {aliasAllowed && entryCustomerId != null && (
                  <button
                    type="button"
                    className="btn-secondary shrink-0"
                    disabled={busy || deliveryDisabled || aliasId == null || aliasId === defaultAliasId}
                    title={aliasId != null && aliasId === defaultAliasId ? "Already the default alias of this customer" : "Use this alias as the customer's default"}
                    onClick={() => void onSetDefault()}
                  >
                    Set default
                  </button>
                )}
                </div>
                {aliasAllowed && defaultAliasId != null && (
                  <p className="mt-1 text-xs text-ink-soft">Default alias: {aliases.find((a) => a.id === defaultAliasId)?.name ?? "—"}</p>
                )}
              </div>
              {error && <p className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
              <div className="flex gap-2">
                <button type="button" className="btn-primary" disabled={busy || deliveryDisabled} onClick={() => void onSave()}>
                  {editing ? "Update delivery" : "Save"}
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => void onCancel()}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {showUnlock && (
        <PasswordModal
          title="Unlock delivery"
          message="Enter the password to edit this delivery."
          confirmLabel="Unlock"
          onSubmit={async (pw) => {
            const res = await verifyDeliveryPassword(pw);
            if (res.error) return res.error;
            passwordRef.current = pw;
            setLocked(false);
            setShowUnlock(false);
            return null;
          }}
          onCancel={() => setShowUnlock(false)}
        />
      )}
      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}
