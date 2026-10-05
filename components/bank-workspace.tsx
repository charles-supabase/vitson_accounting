"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createChecks, createDms, getBankLedger, type BankFilter, type BankLedger, type BankOption } from "@/actions/bank";
import { ComboBox } from "./combo-box";
import { SuccessModal } from "./success-modal";
import { formatDate } from "@/lib/format";
import { currentYm, fmtMoney, monthLabel } from "@/lib/inventory-format";

export function BankWorkspace({ banks }: { banks: BankOption[] }) {
  const [bankId, setBankId] = useState<number | null>(null);
  // the inputs, and the filter that was actually applied with the Filter button
  const [yearStr, setYearStr] = useState(String(new Date().getFullYear()));
  const [monthStr, setMonthStr] = useState(""); // "" = whole year
  const [applied, setApplied] = useState<BankFilter | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [ledger, setLedger] = useState<BankLedger | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [modal, setModal] = useState<"check" | "dm" | null>(null);
  const requestId = useRef(0);

  const bank = banks.find((b) => b.id === bankId) ?? null;

  async function load(id: number | null = bankId) {
    if (id == null) {
      setLedger(null);
      return;
    }
    const mine = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getBankLedger(id, applied);
      if (mine === requestId.current) setLedger(result);
    } catch (e) {
      if (mine === requestId.current) setLoadError(e instanceof Error ? e.message : "Could not load transactions.");
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankId, applied]);

  const bf = ledger?.balanceForward ?? null;

  function onFilter() {
    const year = Number(yearStr);
    if (!Number.isInteger(year) || year < 2000 || year > 2099) {
      setFilterError("Enter a valid year.");
      return;
    }
    setFilterError(null);
    setApplied({ year, month: monthStr === "" ? null : Number(monthStr) });
  }

  const periodLabel = applied
    ? applied.month != null
      ? monthLabel(applied.year, applied.month)
      : `Year ${applied.year}`
    : null;

  return (
    <div className="max-w-5xl">
      <div className="panel panel-navy grid gap-4 md:grid-cols-[18rem_1fr_auto]">
        <div>
          <label className="ledger-label mb-1 block">Bank</label>
          <ComboBox options={banks} value={bankId} onChange={setBankId} placeholder="Select a bank…" />
        </div>

        <div>
          <label className="ledger-label mb-1 block">Date</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min="2000"
              max="2099"
              aria-label="Year"
              data-enter-submit
              className={(filterError ? "field-input-error" : "field-input") + " !w-24"}
              value={yearStr}
              onChange={(e) => setYearStr(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onFilter();
              }}
            />
            <select aria-label="Month" className="field-input !w-40" value={monthStr} onChange={(e) => setMonthStr(e.target.value)}>
              <option value="">Whole year</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {monthLabel(2000, i + 1).split(" ")[0]}
                </option>
              ))}
            </select>
            <button type="button" className="btn-primary" onClick={onFilter} disabled={bankId == null}>
              Filter
            </button>
            {applied && (
              <button
                type="button"
                className="text-sm text-ink-soft underline hover:text-ink"
                onClick={() => {
                  setApplied(null);
                  setFilterError(null);
                }}
              >
                Show all
              </button>
            )}
          </div>
          {filterError && <p className="mt-1 text-[11px] text-danger">{filterError}</p>}
        </div>

        <div className="flex items-end justify-start gap-2 md:justify-end">
          <button
            type="button"
            className="btn-secondary"
            disabled={bankId == null}
            onClick={() => {
              if (bankId == null) return;
              const qs = new URLSearchParams({ bank: String(bankId) });
              if (applied) {
                qs.set("year", String(applied.year));
                if (applied.month != null) qs.set("month", String(applied.month));
              }
              window.open(`/bank/print?${qs.toString()}`, "_blank");
            }}
          >
            Print
          </button>
          <button type="button" className="btn-secondary" disabled={bankId == null} onClick={() => setModal("check")}>
            Create Check
          </button>
          <button type="button" className="btn-secondary" disabled={bankId == null} onClick={() => setModal("dm")}>
            Create DM
          </button>
        </div>
      </div>

      {bank == null ? (
        <p className="mt-8 text-sm text-ink-soft">Select a bank to see its transactions.</p>
      ) : (
        <div className="panel panel-slate mt-4">
          <div className="mt-6 flex items-baseline justify-between border-b border-line pb-2">
            <h2 className="font-display text-lg font-semibold text-ink">{bank.label}</h2>
            <div className="text-right">
              <div className="ledger-label">
                {ledger?.balanceAsOf ? `Balance up to ${formatDate(ledger.balanceAsOf)}` : "Current balance"}
              </div>
              <div className="font-mono text-lg text-ink">{ledger ? fmtMoney(ledger.currentBalance) : "\u2014"}</div>
            </div>
          </div>

          {periodLabel && <p className="mt-3 text-sm text-ink-soft">Showing {periodLabel}, plus unused checks</p>}

          {loadError && (
            <p className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
              {loadError}
            </p>
          )}

          <div
            className="mt-3 max-h-[55vh] overflow-y-auto rounded border border-line bg-paper-raised"
            style={{ scrollbarGutter: "stable" }}
          >
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[9rem]" />
                <col className="w-[7rem]" />
                <col />
                <col className="w-[9rem]" />
                <col className="w-[9rem]" />
              </colgroup>
              <thead className="sticky top-0 bg-paper-raised">
                <tr className="border-b border-line text-left ledger-label">
                  <th className="px-4 py-2 font-normal">Check No</th>
                  <th className="px-4 py-2 font-normal">Date</th>
                  <th className="px-4 py-2 font-normal">Payee</th>
                  <th className="px-4 py-2 text-right font-normal">Deposit</th>
                  <th className="px-4 py-2 text-right font-normal">Withdrawn</th>
                </tr>
              </thead>
              <tbody>
                {bf != null && (
                  <tr className="border-b border-line bg-paper">
                    <td colSpan={3} className="px-4 py-2 font-medium text-ink">
                      BALANCE FORWARD
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-ink">{fmtMoney(bf)}</td>
                    <td className="px-4 py-2" />
                  </tr>
                )}
                {loading && !ledger && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-ink-faint">
                      Loading…
                    </td>
                  </tr>
                )}
                {ledger && ledger.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-ink-faint">
                      No transactions to show.
                    </td>
                  </tr>
                )}
                {ledger?.rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-1.5 font-mono text-ink">{r.checkNo}</td>
                    <td className="px-4 py-1.5 text-ink-soft">{formatDate(r.dtCheck)}</td>
                    <td className="truncate px-4 py-1.5 text-ink" title={r.payee ?? ""}>{r.payee ?? ""}</td>
                    <td className="px-4 py-1.5 text-right font-mono text-ink">{r.deposit != null ? fmtMoney(r.deposit) : ""}</td>
                    <td className="px-4 py-1.5 text-right font-mono text-ink">{r.withdrawal != null ? fmtMoney(r.withdrawal) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* totals for the filtered data, outside the list and lined up with its columns */}
          {ledger && (
            <div className="rounded-b border border-t-0 border-line bg-paper" style={{ scrollbarGutter: "stable", overflowY: "scroll" }}>
              <table className="w-full table-fixed text-sm">
                <colgroup>
                <col className="w-[9rem]" />
                <col className="w-[7rem]" />
                <col />
                <col className="w-[9rem]" />
                <col className="w-[9rem]" />
              </colgroup>
                <tbody>
                  <tr>
                    <td colSpan={3} className="px-4 py-2 text-ink-soft">
                      Total deposit and withdrawal{bf != null ? " (deposit includes balance forward)" : ""}
                    </td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-ink">{fmtMoney((bf ?? 0) + ledger.monthDeposit)}</td>
                    <td className="px-4 py-2 text-right font-mono font-medium text-ink">{fmtMoney(ledger.monthWithdrawal)}</td>
                  </tr>
                  <tr className="border-t border-line">
                    <td colSpan={3} className="px-4 py-2 font-medium text-ink">
                      Balance (deposits - withdrawals)
                    </td>
                    <td colSpan={2} className="px-4 py-2 text-right font-mono font-semibold text-ink">
                      {fmtMoney((bf ?? 0) + ledger.monthDeposit - ledger.monthWithdrawal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {ledger?.truncated && (
            <p className="mt-2 text-xs text-ink-faint">Showing the first 2,000 rows. Filter by month to narrow the list.</p>
          )}
        </div>
      )}

      {modal === "check" && bank && (
        <CreateChecksModal
          bank={bank}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            setModal(null);
            setMessage(msg);
            void load();
          }}
        />
      )}
      {modal === "dm" && bank && (
        <CreateDmModal
          bank={bank}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            setModal(null);
            setMessage(msg);
            void load();
          }}
        />
      )}
      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded border border-line bg-paper-raised p-6 shadow-sm">
        <h3 className="mb-4 font-display text-lg font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function CreateChecksModal({
  bank,
  onClose,
  onDone,
}: {
  bank: BankOption;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [start, setStart] = useState("");
  const [countStr, setCountStr] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = Number(countStr);
  const startOk = /^\d{1,15}$/.test(start.trim());
  const countOk = Number.isInteger(count) && count >= 1 && count <= 1000;

  function submit() {
    setAttempted(true);
    setError(null);
    if (!startOk || !countOk) return;
    startTransition(async () => {
      const res = await createChecks(bank.id, start, count);
      if (res.error) {
        setError(res.error);
        return;
      }
      onDone(`Created ${res.created} checks for ${bank.label}: ${res.first} to ${res.last}.`);
    });
  }

  return (
    <ModalFrame title={`Create checks · ${bank.label}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="ledger-label mb-1 block">Starting check number</label>
          <input
            className={attempted && !startOk ? "field-input-error" : "field-input"}
            inputMode="numeric"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Number of checks</label>
          <input
            type="number"
            min="1"
            max="1000"
            className={attempted && !countOk ? "field-input-error" : "field-input"}
            value={countStr}
            onChange={(e) => setCountStr(e.target.value)}
          />
          {attempted && !countOk && <p className="mt-1 text-[11px] text-danger">Enter a whole number from 1 to 1000.</p>}
        </div>
      </div>
      {error && (
        <p className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={isPending}>
          Cancel
        </button>
        <button type="button" className="btn-primary flex-1" onClick={submit} disabled={isPending}>
          {isPending ? "Creating…" : "Create"}
        </button>
      </div>
    </ModalFrame>
  );
}

function CreateDmModal({
  bank,
  onClose,
  onDone,
}: {
  bank: BankOption;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [ym, setYm] = useState(currentYm());
  const [countStr, setCountStr] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = Number(countStr);
  const ymOk = /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
  const countOk = Number.isInteger(count) && count >= 1 && count <= 500;

  function submit() {
    setAttempted(true);
    setError(null);
    if (!ymOk || !countOk) return;
    startTransition(async () => {
      const res = await createDms(bank.id, ym, count);
      if (res.error) {
        setError(res.error);
        return;
      }
      onDone(`Created ${res.created} DM${res.created === 1 ? "" : "s"} for ${bank.label}: ${res.first} to ${res.last}.`);
    });
  }

  return (
    <ModalFrame title={`Create DM · ${bank.label}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="ledger-label mb-1 block">Month and year</label>
          <input
            type="month"
            className={attempted && !ymOk ? "field-input-error" : "field-input"}
            value={ym}
            onChange={(e) => setYm(e.target.value)}
          />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Number of DMs</label>
          <input
            type="number"
            min="1"
            max="500"
            className={attempted && !countOk ? "field-input-error" : "field-input"}
            value={countStr}
            onChange={(e) => setCountStr(e.target.value)}
            autoFocus
          />
          {attempted && !countOk && <p className="mt-1 text-[11px] text-danger">Enter a whole number from 1 to 500.</p>}
        </div>
      </div>
      {error && (
        <p className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={isPending}>
          Cancel
        </button>
        <button type="button" className="btn-primary flex-1" onClick={submit} disabled={isPending}>
          {isPending ? "Creating…" : "Create"}
        </button>
      </div>
    </ModalFrame>
  );
}
