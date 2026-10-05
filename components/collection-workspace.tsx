"use client";

import { useEffect, useState, useTransition } from "react";
import {
  createCustomerBank,
  depositCollection,
  getAlmostDue,
  getCheckOptions,
  getCollection,
  saveCollection,
  searchCollections,
  undoDeposit,
  type CheckOption,
  type CollectionDetail,
  type CollectionListRow,
  type CollectionLookups,
} from "@/actions/collection";
import { ComboBox } from "./combo-box";
import { ConfirmModal } from "./confirm-modal";
import { MoneyInput } from "./money-input";
import { InfoModal } from "./info-modal";
import { PasswordModal } from "./password-modal";
import { SuccessModal } from "./success-modal";
import { formatDate } from "@/lib/format";
import { fmtMoney, monthLabel } from "@/lib/inventory-format";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";

type DeductionRow = { key: number; typeId: number | null; amountStr: string; remarks: string };

const DEPOSIT_PENDING_MESSAGE =
  "A deposit date or bank is entered but the check was not deposited. Press DEPOSIT, or CLEAR the deposit date first. Leave anyway?";
const UNSAVED_MESSAGE = "This collection is not saved. If you leave, the changes will be discarded. Leave anyway?";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => monthLabel(2000, i + 1).split(" ")[0]);

export function CollectionWorkspace({ lookups }: { lookups: CollectionLookups }) {
  const { setDirty, confirmLeave } = useUnsavedChanges();
  const [isPending, startTransition] = useTransition();

  /* ---------- section 1: filters + list ---------- */
  const [checkOptions, setCheckOptions] = useState<CheckOption[]>([]);
  const [fCheckId, setFCheckId] = useState<number | null>(null);
  const [fAmount, setFAmount] = useState("");
  const [fCustomerId, setFCustomerId] = useState<number | null>(null);
  const [listMode, setListMode] = useState<"due" | "search">("due");
  const [rows, setRows] = useState<CollectionListRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  /* ---------- section 2: the collection ---------- */
  const [customerBanks, setCustomerBanks] = useState(lookups.customerBanks);
  const [loaded, setLoaded] = useState<CollectionDetail | null>(null);
  const [touched, setTouched] = useState(false);

  const [dateCollected, setDateCollected] = useState(todayLocal());
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerBankId, setCustomerBankId] = useState<number | null>(null);
  const [checkNoStr, setCheckNoStr] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [forYear, setForYear] = useState(String(new Date().getFullYear()));
  const [forMonth, setForMonth] = useState("");
  const [remarks, setRemarks] = useState("");
  const [deductions, setDeductions] = useState<DeductionRow[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const [depDate, setDepDate] = useState("");
  const [depBankId, setDepBankId] = useState<number | null>(null);

  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [askBank, setAskBank] = useState<string | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);

  const locked = !!loaded?.dateDeposited;
  const depositPending = !locked && (depDate !== "" || depBankId != null);
  const amount = Number(amountStr);
  const dedTotal = deductions.reduce((a, d) => a + (Number(d.amountStr) > 0 ? Number(d.amountStr) : 0), 0);

  useEffect(() => {
    setDirty(depositPending || touched, depositPending ? DEPOSIT_PENDING_MESSAGE : UNSAVED_MESSAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositPending, touched]);

  useEffect(() => {
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void refreshList();
    void loadCheckOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCheckOptions() {
    try {
      setCheckOptions(await getCheckOptions());
    } catch {
      /* the filter just stays empty */
    }
  }

  /* ---------- list ---------- */

  async function refreshList(mode: "due" | "search" = listMode) {
    setLoadingList(true);
    setListError(null);
    try {
      if (mode === "search") {
        const checkNo = checkOptions.find((o) => o.id === fCheckId)?.checkNo ?? "";
        setRows(await searchCollections({ checkNo, amount: fAmount, customerId: fCustomerId }));
      } else {
        setRows(await getAlmostDue(todayLocal()));
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load the list.");
    } finally {
      setLoadingList(false);
    }
  }

  async function onSearch() {
    const any = fCheckId != null || fAmount.trim() || fCustomerId != null;
    const mode = any ? "search" : "due";
    setListMode(mode);
    await refreshList(mode);
  }

  async function onClearFilters() {
    setFCheckId(null);
    setFAmount("");
    setFCustomerId(null);
    setListMode("due");
    setLoadingList(true);
    setListError(null);
    try {
      setRows(await getAlmostDue(todayLocal()));
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load the list.");
    } finally {
      setLoadingList(false);
    }
  }

  /* ---------- form ---------- */

  function resetForm(keepDate = true) {
    setLoaded(null);
    setTouched(false);
    if (!keepDate) setDateCollected(todayLocal());
    setCustomerId(null);
    setCustomerBankId(null);
    setCheckNoStr("");
    setCheckDate("");
    setAmountStr("");
    setForMonth("");
    setRemarks("");
    setDeductions([]);
    setDepDate("");
    setDepBankId(null);
    setAttempted(false);
    setError(null);
  }

  function applyDetail(d: CollectionDetail) {
    setLoaded(d);
    setTouched(false);
    setDateCollected(d.dateCollected);
    setCustomerId(d.customerId);
    setCustomerBankId(d.customerBankId);
    setCheckNoStr(String(d.checkNo));
    setCheckDate(d.checkDate);
    setAmountStr(String(d.checkAmount));
    const m = /^(\d{4})-(\d{2})$/.exec(d.forMonthOf);
    setForYear(m ? m[1] : String(new Date().getFullYear()));
    setForMonth(m ? String(Number(m[2])) : "");
    setRemarks(d.remarks ?? "");
    setDeductions(d.deductions.map((x, i) => ({ key: i + 1, typeId: x.typeId, amountStr: String(x.amount), remarks: x.remarks })));
    setNextKey(d.deductions.length + 1);
    setDepDate(d.dateDeposited ?? "");
    setDepBankId(d.bankId);
    setAttempted(false);
    setError(null);
  }

  /** Leaving this check: a half-done deposit blocks it; unsaved edits ask first. */
  async function canLeave(): Promise<boolean> {
    if (depositPending) {
      setNotice("A deposit date or bank is entered but the check was not deposited. Press DEPOSIT, or press CLEAR to clear the deposit date, before leaving this check.");
      return false;
    }
    return confirmLeave(touched, UNSAVED_MESSAGE);
  }

  async function openCollection(id: number) {
    if (loaded?.id === id) return;
    if (!(await canLeave())) return;
    const d = await getCollection(id);
    if (!d) {
      setError("That collection was not found.");
      return;
    }
    applyDetail(d);
  }

  async function onNew() {
    if (!(await canLeave())) return;
    resetForm(true);
  }

  async function reloadCurrent(id: number) {
    const d = await getCollection(id);
    if (d) applyDetail(d);
    await refreshList();
    void loadCheckOptions();
  }

  const touch = () => setTouched(true);

  function addDeduction() {
    setDeductions((prev) => [...prev, { key: nextKey, typeId: null, amountStr: "", remarks: "" }]);
    setNextKey((k) => k + 1);
    touch();
  }

  function patchDeduction(key: number, patch: Partial<DeductionRow>) {
    setDeductions((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    touch();
  }

  /* ---------- actions ---------- */

  function onSave() {
    setAttempted(true);
    setError(null);

    const checkNo = checkNoStr.trim();
    if (customerId == null || customerBankId == null) return;
    if (!checkNo || !checkDate || !(amount > 0) || !dateCollected || forMonth === "") return;
    if (!/^\d{4}$/.test(forYear)) return;
    for (const d of deductions) {
      if (d.typeId == null) return setError("Choose a type for every deduction row.");
      if (!(Number(d.amountStr) > 0)) return setError("Every deduction needs an amount greater than zero.");
    }

    startTransition(async () => {
      const res = await saveCollection({
        id: loaded?.id ?? null,
        dateCollected,
        customerId,
        customerBankId,
        checkNo,
        checkDate,
        checkAmount: amount,
        forMonthOf: `${forYear}-${String(Number(forMonth)).padStart(2, "0")}`,
        remarks,
        deductions: deductions.map((d) => ({ typeId: d.typeId as number, amount: Number(d.amountStr), remarks: d.remarks })),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage("Collection saved.");
      if (loaded) {
        await reloadCurrent(res.id!);
      } else {
        resetForm(true); // the date collected stays for the next entry
        await refreshList();
        void loadCheckOptions();
      }
    });
  }

  function onDeposit() {
    if (!loaded) return;
    setError(null);
    if (!depDate || depBankId == null) {
      setError("Enter the date deposited and choose the bank.");
      return;
    }
    startTransition(async () => {
      const res = await depositCollection(loaded.id, depDate, depBankId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage(`Check ${loaded.checkNo} deposited. It is now in the bank transactions and this record is locked.`);
      await reloadCurrent(loaded.id);
    });
  }

  function onClearDeposit() {
    setDepDate("");
    setDepBankId(null);
  }

  async function onUndoSubmit(password: string): Promise<string | null> {
    if (!loaded) return "Nothing selected.";
    const res = await undoDeposit(loaded.id, password);
    if (res.error) return res.error;
    setUndoOpen(false);
    setMessage(
      res.removed
        ? `Deposit undone. The bank deposit for check ${loaded.checkNo} was removed and the record is unlocked.`
        : `Record unlocked. No matching bank deposit for check ${loaded.checkNo} was found to remove.`
    );
    await reloadCurrent(loaded.id);
    return null;
  }

  function onSaveBank() {
    const name = askBank;
    setAskBank(null);
    if (!name) return;
    startTransition(async () => {
      const res = await createCustomerBank(name);
      if (res.error || !res.option) {
        setError(res.error ?? "Could not save the bank.");
        return;
      }
      const opt = res.option;
      setCustomerBanks((prev) => (prev.some((b) => b.id === opt.id) ? prev : [...prev, opt].sort((a, b) => a.label.localeCompare(b.label))));
      setCustomerBankId(opt.id);
      touch();
    });
  }

  /* ---------- render ---------- */

  const bad = (cond: boolean) => (attempted && cond ? "field-input-error" : "field-input");
  const lab = "mb-1 block text-xs font-medium uppercase tracking-wide";
  const today = todayLocal();

  return (
    <div className="grid max-w-7xl gap-4 lg:grid-cols-[26rem_1fr]">
      {/* ---------- section 1: burgundy ---------- */}
      <section className="rounded bg-[#7a1130] p-4 text-yellow-300">
        <h2 className="mb-3 font-display text-base font-semibold text-yellow-300">Find a check</h2>
        <div className="space-y-3 text-gray-900">
          <div>
            <label className={lab + " text-yellow-200"}>Check number</label>
            <ComboBox
              options={checkOptions.map((o) => ({
                id: o.id,
                label: o.checkNo,
                columns: [o.checkNo, o.customerName, fmtMoney(o.amount)],
              }))}
              value={fCheckId}
              onChange={setFCheckId}
              placeholder={checkOptions.length === 0 ? "No checks recorded" : "All check numbers"}
              disabled={checkOptions.length === 0}
              columnTemplate="6rem minmax(0,1fr) 7rem"
              columnAlign={["left", "left", "right"]}
              listMinWidth="26rem"
            />
          </div>
          <div>
            <label className={lab + " text-yellow-200"}>Customer</label>
            <ComboBox options={lookups.customers} value={fCustomerId} onChange={setFCustomerId} placeholder="All customers" />
          </div>
          <div>
            <label className={lab + " text-yellow-200"}>Check amount</label>
            <MoneyInput value={fAmount} onChange={setFAmount} placeholder="Any amount" onEnter={() => void onSearch()} />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" className="rounded bg-yellow-300 px-4 py-1.5 text-sm font-semibold text-[#7a1130] hover:bg-yellow-200" onClick={() => void onSearch()}>
            Search
          </button>
          <button type="button" className="rounded border border-yellow-300 px-4 py-1.5 text-sm text-yellow-300 hover:bg-white/10" onClick={() => void onClearFilters()}>
            Clear
          </button>
        </div>

        <div className="mb-1 mt-5 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-yellow-200">
            {listMode === "due" ? "Checks due within 3 days, not deposited" : "Search results"} ({rows.length})
          </span>
        </div>
        {listError && <p className="mb-2 text-sm text-white">{listError}</p>}
        <div className="h-[420px] overflow-y-auto rounded border border-yellow-300/40 bg-[#5c0c25]" role="listbox" aria-label="Checks">
          {loadingList && <p className="px-3 py-3 text-sm">Loading…</p>}
          {!loadingList && rows.length === 0 && (
            <p className="px-3 py-3 text-sm">{listMode === "due" ? "No checks are due soon." : "No checks match."}</p>
          )}
          {rows.map((r) => {
            const active = loaded?.id === r.id;
            const overdue = !r.dateDeposited && r.checkDate < today;
            return (
              <button
                key={r.id}
                type="button"
                role="option"
                aria-selected={active}
                title="Double-click to open"
                onDoubleClick={() => void openCollection(r.id)}
                className={
                  "block w-full border-b border-yellow-300/20 px-3 py-2 text-left " +
                  (active ? "bg-yellow-300 text-[#7a1130]" : "text-yellow-300 hover:bg-white/10")
                }
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{r.customerName}</span>
                  <span className="shrink-0 font-mono text-sm">{fmtMoney(r.checkAmount)}</span>
                </span>
                <span className="flex items-baseline justify-between gap-3 text-[11px] opacity-90">
                  <span>
                    Check {r.checkNo} · {formatDate(r.checkDate)} · {r.forMonthOf}
                  </span>
                  <span className="shrink-0 font-semibold">
                    {r.dateDeposited ? "deposited" : overdue ? "overdue" : r.checkDate === today ? "due today" : "due soon"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] opacity-80">Double-click a check to open it.</p>
      </section>

      {/* ---------- section 2: green ---------- */}
      <section className="rounded bg-[#1f6b3a] p-4 text-white">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold">
            {loaded ? `Collection C${loaded.id}` : "New collection"}
          </h2>
          <button type="button" className="rounded border border-white/60 px-3 py-1 text-sm hover:bg-white/10" onClick={() => void onNew()}>
            New collection
          </button>
        </div>

        {locked && loaded && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border-4 border-yellow-300 bg-[#0f3d20] px-4 py-3" role="status">
            <div>
              <div className="text-lg font-extrabold tracking-wider text-yellow-300">LOCKED · VIEW ONLY</div>
              <div className="text-sm">
                Deposited on {formatDate(loaded.dateDeposited)} to {loaded.bankName ?? "the bank"}. To change it, undo the deposit.
              </div>
            </div>
            <button type="button" className="btn-primary !bg-red-600 hover:!bg-red-700" onClick={() => setUndoOpen(true)}>
              Undo check deposit
            </button>
          </div>
        )}

        <fieldset disabled={locked} className="min-w-0 border-0 p-0">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className={lab}>Date collected</label>
              <input
                type="date"
                className={bad(!dateCollected)}
                value={dateCollected}
                onChange={(e) => {
                  setDateCollected(e.target.value);
                  touch();
                }}
              />
            </div>
            <div className="text-gray-900">
              <label className={lab + " text-white"}>Customer</label>
              <ComboBox
                options={lookups.customers}
                value={customerId}
                onChange={(id) => {
                  setCustomerId(id);
                  touch();
                }}
                placeholder="Select a customer…"
                disabled={locked}
                inputClassName={bad(customerId == null)}
              />
            </div>
            <div className="text-gray-900">
              <label className={lab + " text-white"}>Customer bank</label>
              <ComboBox
                options={customerBanks}
                value={customerBankId}
                onChange={(id) => {
                  setCustomerBankId(id);
                  touch();
                }}
                onCreateNew={(name) => setAskBank(name)}
                placeholder="Select or type a bank…"
                disabled={locked}
                inputClassName={bad(customerBankId == null)}
              />
            </div>
            <div>
              <label className={lab}>Check no</label>
              <input
                className={bad(checkNoStr.trim() === "")}
                value={checkNoStr}
                onChange={(e) => {
                  setCheckNoStr(e.target.value);
                  touch();
                }}
              />
            </div>
            <div>
              <label className={lab}>Check date</label>
              <input
                type="date"
                className={bad(!checkDate)}
                value={checkDate}
                onChange={(e) => {
                  setCheckDate(e.target.value);
                  touch();
                }}
              />
            </div>
            <div>
              <label className={lab}>Check amount</label>
              <MoneyInput
                className={bad(!(amount > 0))}
                value={amountStr}
                onChange={(v) => {
                  setAmountStr(v);
                  touch();
                }}
              />
            </div>
            <div className="md:col-span-2">
              <label className={lab}>For the month of</label>
              <div className="flex gap-2">
                <input
                  className={bad(!/^\d{4}$/.test(forYear)) + " !w-24"}
                  inputMode="numeric"
                  aria-label="Year"
                  value={forYear}
                  onChange={(e) => {
                    setForYear(e.target.value.replace(/\D/g, "").slice(0, 4));
                    touch();
                  }}
                />
                <select
                  className={bad(forMonth === "") + " !w-44"}
                  aria-label="Month"
                  value={forMonth}
                  onChange={(e) => {
                    setForMonth(e.target.value);
                    touch();
                  }}
                >
                  <option value="">Month…</option>
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={lab}>Remarks</label>
              <input
                className="field-input"
                value={remarks}
                onChange={(e) => {
                  setRemarks(e.target.value);
                  touch();
                }}
              />
            </div>
          </div>

          {/* deductions */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Deductions</h3>
              {!locked && (
                <button type="button" className="rounded border border-white/60 px-3 py-1 text-sm hover:bg-white/10" onClick={addDeduction}>
                  + Add deduction
                </button>
              )}
            </div>
            {deductions.length === 0 ? (
              <p className="text-sm opacity-80">No deductions.</p>
            ) : (
              <div className="space-y-2">
                {deductions.map((d) => (
                  <div key={d.key} className="grid items-center gap-2 md:grid-cols-[14rem_9rem_1fr_2rem]">
                    <select
                      className="field-input"
                      value={d.typeId ?? ""}
                      onChange={(e) => patchDeduction(d.key, { typeId: e.target.value === "" ? null : Number(e.target.value) })}
                    >
                      <option value="">Deduction type…</option>
                      {lookups.deductionTypes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <MoneyInput
                      placeholder="Amount"
                      value={d.amountStr}
                      onChange={(v) => patchDeduction(d.key, { amountStr: v })}
                    />
                    <input
                      className="field-input"
                      placeholder="Remarks"
                      value={d.remarks}
                      onChange={(e) => patchDeduction(d.key, { remarks: e.target.value })}
                    />
                    {!locked && (
                      <button
                        type="button"
                        aria-label="Remove deduction"
                        className="text-white/70 hover:text-white"
                        onClick={() => {
                          setDeductions((prev) => prev.filter((x) => x.key !== d.key));
                          touch();
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <p className="text-right text-xl font-bold text-yellow-300">
                  Total deductions <span className="ml-3 font-mono text-2xl">{fmtMoney(dedTotal)}</span>
                </p>
              </div>
            )}
          </div>
        </fieldset>

        {error && (
          <p className="mt-4 rounded-sm bg-red-100 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}

        {!locked && (
          <div className="mt-4">
            <button type="button" className="rounded bg-white px-5 py-2 text-sm font-semibold text-[#1f6b3a] hover:bg-green-50" onClick={onSave} disabled={isPending}>
              {isPending ? "Saving…" : loaded ? "SAVE CHANGES" : "SAVE COLLECTION"}
            </button>
          </div>
        )}

        {/* deposit */}
        <div className="mt-6 rounded border border-white/40 bg-[#175a30] p-3">
          <h3 className="mb-2 text-sm font-semibold">Deposit</h3>
          <div className="grid items-end gap-3 md:grid-cols-[11rem_1fr_auto_auto]">
            <div>
              <label className={lab}>Date deposited</label>
              <input
                type="date"
                className="field-input"
                value={depDate}
                disabled={locked || !loaded}
                onChange={(e) => setDepDate(e.target.value)}
              />
            </div>
            <div className="text-gray-900">
              <label className={lab + " text-white"}>Deposit to bank</label>
              <ComboBox
                options={lookups.banks}
                value={depBankId}
                onChange={setDepBankId}
                placeholder="Select a bank…"
                disabled={locked || !loaded}
              />
            </div>
            <button
              type="button"
              className="rounded bg-yellow-300 px-5 py-2 text-sm font-bold text-[#1f6b3a] hover:bg-yellow-200 disabled:opacity-40"
              disabled={locked || !loaded || !depDate || depBankId == null || touched || isPending}
              onClick={onDeposit}
              title={touched ? "Save the changes first" : undefined}
            >
              DEPOSIT
            </button>
            <button
              type="button"
              className="rounded border border-white/60 px-5 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
              disabled={locked || (depDate === "" && depBankId == null)}
              onClick={onClearDeposit}
            >
              CLEAR
            </button>
          </div>
          {!loaded && <p className="mt-2 text-xs opacity-80">Save the collection first, then open it to deposit.</p>}
          {depositPending && (
            <p className="mt-2 text-xs text-yellow-200">
              Press DEPOSIT to record this deposit, or CLEAR to remove the date before leaving.
            </p>
          )}
        </div>
      </section>

      {askBank && (
        <ConfirmModal
          message={`"${askBank}" is not in the customer banks list. Save it as a new customer bank?`}
          confirmLabel="Save bank"
          cancelLabel="Cancel"
          onConfirm={onSaveBank}
          onCancel={() => setAskBank(null)}
        />
      )}
      {undoOpen && loaded && (
        <PasswordModal
          title="Undo check deposit"
          message={`Unlock check ${loaded.checkNo}? Its deposit will be removed from the bank transactions. Enter the password to continue.`}
          confirmLabel="Undo deposit"
          onSubmit={onUndoSubmit}
          onCancel={() => setUndoOpen(false)}
        />
      )}
      {notice && <InfoModal message={notice} onClose={() => setNotice(null)} />}
      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}
