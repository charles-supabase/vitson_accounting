"use client";

import { useEffect, useRef, useState } from "react";
import { createChecks, createDms, getBankLedger, type BankFilter, type BankLedger, type BankOption } from "@/actions/bank";
import { CreateChecksModal, CreateDmModal } from "./create-check-modals";
import { ComboBox } from "./combo-box";
import { SuccessModal } from "./success-modal";
import { formatDate } from "@/lib/format";
import { fmtMoney, monthLabel } from "@/lib/inventory-format";

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
            title={bankId == null ? "Print the summary of all banks for the year / month above" : undefined}
            onClick={() => {
              if (bankId == null) {
                // no bank selected: summary of all banks for the chosen year and month ("Whole year" = the full year)
                const y = Number(yearStr);
                if (!Number.isInteger(y) || y < 2000 || y > 2099) {
                  setFilterError("Enter a valid year to print the summary of all banks.");
                  return;
                }
                setFilterError(null);
                const period = monthStr === "" ? String(y) : `${y}-${String(Number(monthStr)).padStart(2, "0")}`;
                window.open(`/bank/summary?ym=${period}`, "_blank");
                return;
              }
              const qs = new URLSearchParams({ bank: String(bankId) });
              if (applied) {
                qs.set("year", String(applied.year));
                if (applied.month != null) qs.set("month", String(applied.month));
              }
              window.open(`/bank/print?${qs.toString()}`, "_blank");
            }}
          >
            {bankId == null ? "Print Summary" : "Print"}
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
          createChecks={createChecks}
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
          createDms={createDms}
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
