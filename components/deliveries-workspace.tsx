"use client";

import { useEffect, useState } from "react";
import { ComboBox } from "./combo-box";
import { SuccessModal } from "./success-modal";
import {
  getAvailableTickets,
  getCustomersWithTickets,
  saveDelivery,
  type AvailableTicket,
} from "@/actions/deliveries";
import { money } from "@/lib/report-format";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

const LEAVE_MESSAGE = "This delivery is not saved. If you leave, what you entered will be discarded. Leave anyway?";

const toNumber = (text: string) => Number(text.replace(/,/g, ""));
const fmtInput = (text: string) => {
  const n = toNumber(text);
  return text.trim() !== "" && Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : text;
};

export function DeliveriesWorkspace({ types }: { types: { id: number; name: string }[] }) {
  const { setDirty, confirmLeave } = useUnsavedChanges();

  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [tickets, setTickets] = useState<AvailableTicket[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<number | null>(null);

  // data entry
  const [dateDelivery, setDateDelivery] = useState("");
  const [receipt, setReceipt] = useState("");
  const [typeId, setTypeId] = useState<number | null>(null);
  const [weightText, setWeightText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const ticket = tickets.find((t) => t.id === ticketId) ?? null;
  const hasUnsaved = ticketId != null && (receipt !== "" || typeId != null || weightText !== "");

  useEffect(() => {
    setDirty(hasUnsaved, LEAVE_MESSAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsaved]);
  useEffect(() => {
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadCustomers();
    // today, in the user's own time zone (the server runs in UTC)
    const now = new Date();
    setDateDelivery(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`);
  }, []);

  async function loadCustomers() {
    const res = await getCustomersWithTickets();
    setLoadError(res.error ?? null);
    setCustomers(res.customers ?? []);
    setCustomersLoaded(true);
  }

  function clearEntry() {
    setReceipt("");
    setTypeId(null);
    setWeightText("");
    setError(null);
  }

  async function onPickCustomer(id: number | null) {
    if (id === customerId) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    clearEntry();
    setTicketId(null);
    setCustomerId(id);
    setTickets([]);
    if (id == null) return;
    const res = await getAvailableTickets(id);
    setLoadError(res.error ?? null);
    setTickets(res.tickets ?? []);
  }

  async function onPickTicket(t: AvailableTicket) {
    if (t.id === ticketId) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    clearEntry();
    setTicketId(t.id);
  }

  async function onSave() {
    setError(null);
    setBusy(true);
    const res = await saveDelivery({
      jobOrderId: ticketId,
      dateDelivery,
      deliveryReceipt: Number(receipt),
      receivableTypeId: typeId,
      totalDeliveredWt: toNumber(weightText),
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setMessage(`Delivery saved for job ticket ${ticket?.jobTicket ?? ""}.`);
    clearEntry();
    setTicketId(null);
    if (customerId != null) {
      const r = await getAvailableTickets(customerId);
      setTickets(r.tickets ?? []);
      // a customer with nothing left drops out of the dropdown
      if ((r.tickets ?? []).length === 0) {
        setCustomerId(null);
        await loadCustomers();
      }
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-5 w-96 max-w-full">
        <label className="ledger-label mb-1 block">Customer</label>
        <ComboBox
          options={customers.map((c) => ({ id: c.id, label: c.name }))}
          value={customerId}
          onChange={(id) => void onPickCustomer(id)}
          placeholder={customersLoaded && customers.length === 0 ? "No customer has an undelivered job ticket" : "Select customer…"}
          disabled={!customersLoaded || customers.length === 0}
        />
        {loadError && <p className="mt-2 text-sm text-danger">{loadError}</p>}
      </div>

      {customerId != null && (
        <div className="grid gap-5 lg:grid-cols-[24rem_1fr]">
          {/* data entry (left) */}
          <section className="panel panel-navy self-start">
            <h2 className="mb-3 text-sm font-semibold">
              {ticket ? (
                <>Delivery for job ticket <span className="font-mono">{ticket.jobTicket}</span></>
              ) : (
                "Delivery entry"
              )}
            </h2>
            {!ticket ? (
              <p className="text-sm opacity-85">Select a job ticket from the list to enter its delivery.</p>
            ) : (
              <div className="grid gap-4">
                <div className="grid grid-cols-3 gap-2 text-xs opacity-90">
                  <div>
                    <div className="ledger-label">Ticket weight</div>
                    <div className="font-mono text-sm">{money(ticket.totalWeight)}</div>
                  </div>
                  <div>
                    <div className="ledger-label">Rolls</div>
                    <div className="font-mono text-sm">{ticket.totalRolls}</div>
                  </div>
                  <div>
                    <div className="ledger-label">Unit price</div>
                    <div className="font-mono text-sm">{money(ticket.unitPrice)}</div>
                  </div>
                </div>
                <div>
                  <label className="ledger-label mb-1 block">Date delivered</label>
                  <input type="date" className="field-input" value={dateDelivery} onChange={(e) => setDateDelivery(e.target.value)} />
                </div>
                <div>
                  <label className="ledger-label mb-1 block">Delivery receipt</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="field-input font-mono"
                    value={receipt}
                    onChange={(e) => setReceipt(e.target.value.replace(/\D/g, "").slice(0, 15))}
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
                <div>
                  <label className="ledger-label mb-1 block">Total delivered weight</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="field-input text-right font-mono"
                    value={weightText}
                    onChange={(e) => setWeightText(e.target.value.replace(/[^0-9.,]/g, ""))}
                    onBlur={() => setWeightText(fmtInput(weightText))}
                    placeholder="0.00"
                  />
                </div>
                {error && <p className="rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
                <div className="flex gap-2">
                  <button type="button" className="btn-primary" disabled={busy} onClick={() => void onSave()}>
                    Save delivery
                  </button>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={clearEntry}>
                    Clear
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* available job tickets (listbox) */}
          <section className="rounded border border-line bg-paper-raised">
            <div className="border-b border-line px-3 py-2 text-xs font-semibold text-ink-soft">
              Available job tickets ({tickets.length})
            </div>
            <div className="max-h-[28rem] overflow-y-auto" role="listbox" aria-label="Available job tickets">
              {tickets.length === 0 && <p className="px-3 py-3 text-sm text-ink-faint">No job tickets waiting for a delivery.</p>}
              {tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={t.id === ticketId}
                  onClick={() => void onPickTicket(t)}
                  className={
                    "grid w-full grid-cols-[1fr_7rem_5rem_7rem] gap-3 border-b border-line px-3 py-2 text-left text-sm hover:bg-paper " +
                    (t.id === ticketId ? "bg-accent-soft font-medium" : "")
                  }
                >
                  <span className="truncate font-mono">{t.jobTicket}</span>
                  <span className="text-right font-mono">{money(t.totalWeight)}</span>
                  <span className="text-right font-mono">{t.totalRolls} rolls</span>
                  <span className="text-right font-mono">{money(t.unitPrice)}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}
