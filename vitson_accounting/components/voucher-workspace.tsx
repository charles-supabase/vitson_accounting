"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createVoucher,
  getVoucherableLines,
  getVoucherDetail,
  setSupplierDiscount,
  updateVoucher,
  voucherNoExists,
  type EwtType,
  type VoucherDeductionInput,
  type VoucherDetail,
  type VoucherLine,
  type VoucherLookups,
  type VoucherSupplierOption,
} from "@/actions/voucher";
import { ComboBox } from "./combo-box";
import { VoucherReportsBar } from "./voucher-reports-bar";
import { SuccessModal } from "./success-modal";
import { formatDate } from "@/lib/format";
import { fmtMoney } from "@/lib/inventory-format";
import { useUnsavedChanges } from "@/lib/unsaved-changes-context";
import { VOUCHER_SUFFIX, VOUCHER_TYPE_NAME, voucherDigits, type VoucherTypeId } from "@/lib/voucher-types";

const LEAVE_MESSAGE = "This voucher is not saved. If you leave, the changes will be discarded. Leave anyway?";

const EWT_TYPES: { value: EwtType; label: string; remark: string; rate: number }[] = [
  { value: "goods", label: "Purchase of goods (1%)", remark: "EWT (1%)", rate: 0.01 },
  { value: "service", label: "Purchase of service (2%)", remark: "EWT (2%)", rate: 0.02 },
  { value: "professional", label: "Professional fees (10%)", remark: "EWT (10%)", rate: 0.1 },
];

type Mode = "new" | "edit" | "view";

type DeductionRow = {
  key: number;
  deductionId: number | null;
  ewtType: EwtType | null;
  amountStr: string;
  rateStr: string; // manual discount rate, only used when the supplier has none stored
  remarks: string;
};

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function VoucherWorkspace({ lookups }: { lookups: VoucherLookups }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { setDirty, confirmLeave } = useUnsavedChanges();

  const [mode, setMode] = useState<Mode>("new");
  const [loaded, setLoaded] = useState<VoucherDetail | null>(null);
  const [viewReason, setViewReason] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Original (numbers end in -A) or Duplicate (-B)
  const [voucherType, setVoucherType] = useState<VoucherTypeId>(1);
  // received items: only the ones that normally belong to the tab, or every item of the supplier
  const [showAllItems, setShowAllItems] = useState(false);

  const [findId, setFindId] = useState<number | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [askStore, setAskStore] = useState<{ rate: number; payload: VoucherDeductionInput[] } | null>(null);

  const [voucherNoStr, setVoucherNoStr] = useState("");
  const [noTaken, setNoTaken] = useState(false);
  const [voucherDate, setVoucherDate] = useState(todayLocal());
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [sortingId, setSortingId] = useState<number | null>(null);
  const [sortingManual, setSortingManual] = useState(false); // the user picked a sorting by hand

  const [lines, setLines] = useState<VoucherLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [processed, setProcessed] = useState<VoucherLine[]>([]);

  const [deductions, setDeductions] = useState<DeductionRow[]>([]);
  const [nextKey, setNextKey] = useState(1);

  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const readOnly = mode === "view";

  // the "find voucher" list only shows vouchers of the tab that is open
  const tabVouchers = lookups.vouchers.filter((v) => v.typeId === voucherType);

  /* ---------- derived ---------- */

  // the loaded voucher's supplier may not be in the "has open items" list
  const supplierOptions: VoucherSupplierOption[] =
    loaded && !lookups.suppliers.some((s) => s.id === loaded.supplierId)
      ? [
          ...lookups.suppliers,
          { id: loaded.supplierId, label: loaded.supplierName, openLines: 0, discountPercent: loaded.supplierDiscountPercent },
        ]
      : lookups.suppliers;
  const supplier = supplierOptions.find((s) => s.id === supplierId) ?? null;
  const supplierRate = supplier?.discountPercent ?? null;

  const processedIds = new Set(processed.map((p) => p.receivingId));
  const available = lines.filter((l) => !processedIds.has(l.receivingId));
  const total = round2(processed.reduce((a, p) => a + p.amount, 0));

  const ewtId = lookups.deductions.find((d) => d.isEwt)?.id ?? null;
  const discountId = lookups.deductions.find((d) => d.isDiscount)?.id ?? null;

  /**
   * Amounts in row order. EWT is taken on (gross - deductions entered before it) and is not touched
   * by deductions added after it. A discount is taken on the gross amount.
   */
  const amounts: number[] = (() => {
    let running = 0;
    return deductions.map((r) => {
      let amt = 0;
      if (r.deductionId != null && r.deductionId === ewtId) {
        const rate = EWT_TYPES.find((t) => t.value === r.ewtType)?.rate ?? 0;
        amt = round2((Math.max(total - running, 0) / 1.12) * rate);
      } else if (r.deductionId != null && r.deductionId === discountId) {
        const rate = Number(r.rateStr);
        amt = r.rateStr.trim() !== "" && Number.isFinite(rate) && rate > 0 && rate <= 100 ? round2((total * rate) / 100) : 0;
      } else if (r.deductionId != null) {
        const n = Number(r.amountStr);
        amt = Number.isFinite(n) && n > 0 ? round2(n) : 0;
      }
      running = round2(running + amt);
      return amt;
    });
  })();

  const uniqueNames = (xs: (string | null)[]) => Array.from(new Set(xs.filter((x): x is string => !!x)));
  const itemSortingIds = Array.from(new Set(processed.map((p) => p.accSortingId).filter((x): x is number => x != null)));
  const sortingFromItems = itemSortingIds.length === 1;
  const catNames = uniqueNames(processed.map((p) => p.accCategoryName));
  const bookNames = uniqueNames(processed.map((p) => p.accBookName));

  const totalDeductions = round2(amounts.reduce((a, n) => a + n, 0));
  const net = round2(total - totalDeductions);

  const hasUnsaved =
    mode === "new"
      ? voucherNoStr.trim() !== "" || processed.length > 0 || deductions.length > 0
      : mode === "edit"
        ? touched
        : false;

  // the sorting follows the items; it is only picked by hand for older items that have none
  useEffect(() => {
    if (!readOnly && !sortingManual && sortingFromItems && sortingId !== itemSortingIds[0]) setSortingId(itemSortingIds[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortingFromItems, itemSortingIds[0], readOnly, sortingManual]);

  useEffect(() => {
    setDirty(hasUnsaved, LEAVE_MESSAGE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnsaved]);

  useEffect(() => {
    return () => setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- handlers ---------- */

  function resetToNew() {
    setMode("new");
    setLoaded(null);
    setFindId(null);
    setSortingManual(false);
    setViewReason(null);
    setTouched(false);
    setVoucherNoStr("");
    setNoTaken(false);
    setShowAllItems(false);
    setVoucherDate(todayLocal());
    setSupplierId(null);
    setSortingId(null);
    setLines([]);
    setPicked(new Set());
    setProcessed([]);
    setDeductions([]);
    setAttempted(false);
    setError(null);
  }

  async function onNewVoucher() {
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    resetToNew();
  }

  async function loadVoucher(no: string, skipConfirm = false) {
    setFindError(null);
    if (!skipConfirm && !(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;

    const detail = await getVoucherDetail({ no });
    if (!detail) {
      setFindError(`Voucher ${no} was not found.`);
      return;
    }

    const editable = !detail.printed && !detail.cancelled && !detail.checkIssued && !detail.hasCheck;
    let reason: string | null = null;
    if (detail.cancelled) reason = "This voucher was cancelled. It is view only.";
    else if (detail.printed) reason = "This voucher has been printed. It is view only.";
    else if (detail.checkIssued || detail.hasCheck) reason = "A check is assigned to this voucher. It is view only until the check is cancelled.";

    let extra: VoucherLine[] = [];
    const detailType: VoucherTypeId = detail.typeId === 2 ? 2 : 1;
    if (editable) extra = await getVoucherableLines(detail.supplierId, detailType, false);

    setVoucherType(detailType);
    setShowAllItems(false);
    setMode(editable ? "edit" : "view");
    setLoaded(detail);
    setFindId(detail.id);
    setSortingManual(true); // keep the sorting that was saved on the voucher
    setViewReason(reason);
    setTouched(false);
    setVoucherNoStr(voucherDigits(detail.voucherNo));
    setNoTaken(false);
    setVoucherDate(detail.voucherDate);
    setSupplierId(detail.supplierId);
    setSortingId(detail.sortingId);
    setProcessed(detail.lines);
    setLines(
      [...extra, ...detail.lines].sort((a, b) => a.dtRecieved.localeCompare(b.dtRecieved) || a.receivingId - b.receivingId)
    );
    setPicked(new Set());
    setDeductions(
      detail.deductions.map((d, i) => ({
        key: i + 1,
        deductionId: d.deductionId,
        ewtType: d.ewtType,
        amountStr: d.deductionId === ewtId || d.deductionId === discountId ? "" : String(d.amount),
        rateStr: d.discountRate != null ? String(d.discountRate) : "",
        remarks: d.remarks ?? "",
      }))
    );
    setNextKey(detail.deductions.length + 1);
    setAttempted(false);
    setError(null);
  }

  function onPickVoucher(id: number | null) {
    if (id == null) return;
    const opt = lookups.vouchers.find((v) => v.id === id);
    if (opt) void loadVoucher(opt.no);
  }

  async function onSelectSupplier(id: number | null) {
    if (id === supplierId) return;
    if (processed.length > 0 || deductions.length > 0) {
      const ok = await confirmLeave(true, "Changing the supplier clears the items and deductions entered. Continue?");
      if (!ok) return;
    }
    setSupplierId(id);
    setPicked(new Set());
    setProcessed([]);
    setDeductions([]);
    setError(null);
    if (id == null) {
      setLines([]);
      return;
    }
    await reloadLines(id, showAllItems, []);
  }

  /** Lists the supplier's received items; showAll lifts the Original/Duplicate invoice-number filter. */
  async function reloadLines(supplier: number, showAll: boolean, keepRows: VoucherLine[]) {
    setLoadingLines(true);
    try {
      const fresh = await getVoucherableLines(supplier, voucherType, showAll);
      // keep the rows of a saved voucher that are being edited
      const keep = keepRows.filter((p) => !fresh.some((f) => f.receivingId === p.receivingId));
      setLines(
        [...fresh, ...keep].sort((a, b) => a.dtRecieved.localeCompare(b.dtRecieved) || a.receivingId - b.receivingId)
      );
    } finally {
      setLoadingLines(false);
    }
  }

  async function toggleShowAll() {
    const next = !showAllItems;
    setShowAllItems(next);
    if (supplierId != null) await reloadLines(supplierId, next, processed);
  }

  /** Changing tab starts a fresh voucher of the other type. */
  async function switchTab(t: VoucherTypeId) {
    if (t === voucherType) return;
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    resetToNew();
    setVoucherType(t);
  }

  function togglePick(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onProcess() {
    const chosen = available.filter((l) => picked.has(l.receivingId));
    if (chosen.length === 0) return;
    const combos = new Set([...processed, ...chosen].map((l) => `${l.accBookId}|${l.accCategoryId}`));
    if (combos.size > 1) {
      setError("These items belong to different accounting books or categories and can't share a voucher.");
      return;
    }
    setProcessed((prev) => [...prev, ...chosen]);
    setPicked(new Set());
    setTouched(true);
    setError(null);
  }

  /** Back to the Received items list; for a saved voucher the release happens when it is saved. */
  function returnItem(id: number) {
    if (readOnly) return;
    setProcessed((prev) => prev.filter((p) => p.receivingId !== id));
    setTouched(true);
  }

  function addDeduction() {
    setDeductions((prev) => [...prev, { key: nextKey, deductionId: null, ewtType: null, amountStr: "", rateStr: "", remarks: "" }]);
    setNextKey((k) => k + 1);
    setTouched(true);
  }

  function patchDeduction(key: number, patch: Partial<DeductionRow>) {
    setDeductions((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setTouched(true);
  }

  async function onVoucherNoBlur() {
    const n = Number(voucherNoStr);
    if (mode !== "new" || !Number.isInteger(n) || n <= 0) return;
    setNoTaken(await voucherNoExists(n, voucherType));
  }

  function onSave() {
    setAttempted(true);
    setError(null);

    const voucherNo = Number(voucherNoStr);
    if (mode === "new" && (!Number.isInteger(voucherNo) || voucherNo <= 0 || noTaken)) return;
    if (!voucherDate || supplierId == null || sortingId == null) return;
    if (processed.length === 0) return;

    for (let i = 0; i < deductions.length; i++) {
      const r = deductions[i];
      if (r.deductionId == null) return setError("Choose a type for every deduction row.");
      if (r.deductionId === ewtId && r.ewtType == null) return setError("Choose the EWT type for the EWT deduction.");
      if (r.deductionId === discountId && !(Number(r.rateStr) > 0 && Number(r.rateStr) <= 100)) {
        return setError("Enter a discount rate between 0 and 100.");
      }
      if (amounts[i] <= 0) return setError("Every deduction needs an amount greater than zero.");
    }
    if (net < 0) return setError("Total deductions cannot exceed the gross amount.");

    const payload: VoucherDeductionInput[] = deductions.map((r, i) => ({
      deductionId: r.deductionId as number,
      amount: amounts[i],
      ewtType: r.deductionId === ewtId ? r.ewtType : null,
      discountRate: r.deductionId === discountId ? Number(r.rateStr) : null,
      remarks: r.remarks,
    }));

    // a discount rate that differs from the supplier's stored one: ask whether to keep it
    const newRate = payload.find((d) => d.discountRate != null && d.discountRate !== supplierRate)?.discountRate;
    if (newRate != null) {
      setAskStore({ rate: newRate, payload });
      return;
    }
    commit(payload, null);
  }

  /** Writes the voucher; storeRate (when set) is also saved on the supplier for future lookups. */
  function commit(payload: VoucherDeductionInput[], storeRate: number | null) {
    const voucherNo = Number(voucherNoStr);
    const sid = supplierId;
    if (sid == null || sortingId == null) return;
    const sort = sortingId;

    startTransition(async () => {
      let saved = false;

      if (mode === "edit" && loaded) {
        const res = await updateVoucher({
          voucherId: loaded.id,
          voucherDate,
          sortingId: sort,
          receivingIds: processed.map((p) => p.receivingId),
          deductions: payload,
        });
        if (res.error) {
          setError(res.error);
          return;
        }
        saved = true;
        if (storeRate != null) await setSupplierDiscount(sid, storeRate);
        setMessage(
          `Voucher ${loaded.voucherNo} updated. Net amount ${fmtMoney(res.net ?? net)}.` +
            (storeRate != null ? ` Discount rate ${storeRate}% stored for ${supplier?.label ?? "the supplier"}.` : "")
        );
        await loadVoucher(loaded.voucherNo, true);
        router.refresh();
      } else {
        const res = await createVoucher({
          voucherNo,
          typeId: voucherType,
          voucherDate,
          supplierId: sid,
          sortingId: sort,
          receivingIds: processed.map((p) => p.receivingId),
          deductions: payload,
        });
        if (res.error) {
          setError(res.error);
          if (/already exists/i.test(res.error)) setNoTaken(true);
          return;
        }
        saved = true;
        if (storeRate != null) await setSupplierDiscount(sid, storeRate);
        setMessage(
          `Voucher ${res.voucherNo} saved. Net amount ${fmtMoney(res.net ?? net)}.` +
            (storeRate != null ? ` Discount rate ${storeRate}% stored for ${supplier?.label ?? "the supplier"}.` : "")
        );
        resetToNew();
        router.refresh();
      }
      void saved;
    });
  }

  async function onCreateCheck() {
    if (!(await confirmLeave(hasUnsaved, LEAVE_MESSAGE))) return;
    router.push(loaded ? `/voucher/create-check?voucher=${loaded.voucherNo}` : "/voucher/create-check");
  }

  const voucherNoNum = Number(voucherNoStr);
  const voucherNoInvalid =
    mode === "new" && (noTaken || (attempted && (!Number.isInteger(voucherNoNum) || voucherNoNum <= 0)));

  /* ---------- render ---------- */

  return (
    <div className="max-w-6xl">
      {/* ORIGINAL / DUPLICATE tabs: loud on purpose, so nobody mixes the two up */}
      <div className="mb-4 flex items-end gap-2" role="tablist" aria-label="Voucher type">
        <button
          type="button"
          role="tab"
          aria-selected={voucherType === 1}
          onClick={() => void switchTab(1)}
          className={
            "rounded-t-lg border-4 border-b-0 px-10 py-3 text-2xl font-black tracking-[0.2em] transition-colors " +
            (voucherType === 1
              ? "border-[#1D4ED8] bg-[#1D4ED8] text-white shadow-lg"
              : "border-[#BFD3FA] bg-[#E8F0FE] text-[#5b7bc0] hover:bg-[#d7e5fd]")
          }
        >
          ORIGINAL
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={voucherType === 2}
          onClick={() => void switchTab(2)}
          className={
            "rounded-t-lg border-4 border-b-0 px-10 py-3 text-2xl font-black tracking-[0.2em] transition-colors " +
            (voucherType === 2
              ? "border-[#C2410C] bg-[#F59E0B] text-[#3b1d00] shadow-lg"
              : "border-[#F8D9A6] bg-[#FEF3E0] text-[#b8782a] hover:bg-[#fde9c4]")
          }
        >
          DUPLICATE
        </button>
      </div>
      {/* find an existing voucher */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded border border-line bg-paper-raised px-4 py-3">
        <div className="w-80 max-w-full">
          <label className="ledger-label mb-1 block">Find voucher</label>
          <ComboBox
            options={tabVouchers.map((v) => ({ id: v.id, label: v.label, columns: v.columns }))}
            columnTemplate="4.5rem 6rem minmax(0,1fr) 7rem"
            listMinWidth="40rem"
            columnAlign={["right", "left", "left", "right"]}
            columnClasses={["font-bold text-blue-800", "text-orange-700", "text-ink", "font-semibold text-green-700"]}
            value={findId}
            onChange={onPickVoucher}
            placeholder={tabVouchers.length === 0 ? `No ${VOUCHER_TYPE_NAME[voucherType].toLowerCase()} vouchers yet` : "Type a voucher number or supplier…"}
            disabled={tabVouchers.length === 0}
          />
        </div>
        <button type="button" className="btn-secondary" onClick={onNewVoucher} disabled={mode === "new" && !hasUnsaved}>
          New voucher
        </button>
        {findError && <span className="pb-2 text-sm text-danger">{findError}</span>}
      </div>

      <VoucherReportsBar />

      {mode === "view" && loaded && (
        <div className="mb-5 rounded border-4 border-red-600 bg-red-50 px-6 py-4 text-center" role="status">
          <div className="text-4xl font-extrabold tracking-[0.3em] text-red-700">READ ONLY</div>
          <div className="mt-1 text-sm text-red-800">{viewReason}</div>
        </div>
      )}
      {mode === "edit" && loaded && (
        <p className="mb-4 rounded-sm bg-accent-soft px-3 py-2 text-sm text-ink">
          Editing voucher {loaded.voucherNo}. Items returned to the left list are released when you save.
        </p>
      )}

      <section className={"panel " + (voucherType === 1 ? "panel-slate" : "panel-burgundy")}>
      {/* header */}
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="ledger-label mb-1 block">Voucher No</label>
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-stretch">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                className={(voucherNoInvalid ? "field-input-error" : "field-input") + " !rounded-r-none"}
                value={voucherNoStr}
                disabled={mode !== "new"}
                onChange={(e) => {
                  setVoucherNoStr(e.target.value.replace(/\D/g, ""));
                  setNoTaken(false);
                }}
                onBlur={onVoucherNoBlur}
              />
              <span
                className={
                  "flex items-center rounded-r-sm px-3 text-lg font-black " +
                  (voucherType === 1 ? "bg-[#1D4ED8] text-white" : "bg-[#F59E0B] text-[#3b1d00]")
                }
                title="Added automatically when the voucher is saved"
              >
                {VOUCHER_SUFFIX[voucherType]}
              </span>
            </div>
            <span
              className="whitespace-nowrap rounded bg-[#8EC5FF] px-3 py-1.5 font-mono text-lg font-bold text-[#0b1f4d]"
              title="Last voucher number"
              aria-label="Last voucher number"
            >
              {lookups.latestVoucherNos[voucherType] ?? "-"}
            </span>
          </div>
          {noTaken && <p className="mt-1 text-[11px] text-danger">This voucher number already exists.</p>}
        </div>
        <div>
          <label className="ledger-label mb-1 block">Date</label>
          <input
            type="date"
            className={attempted && !voucherDate ? "field-input-error" : "field-input"}
            value={voucherDate}
            disabled={readOnly}
            onChange={(e) => {
              setVoucherDate(e.target.value);
              setTouched(true);
            }}
          />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Supplier</label>
          <ComboBox
            options={supplierOptions.map((s) => ({ id: s.id, label: s.label }))}
            value={supplierId}
            onChange={onSelectSupplier}
            placeholder={lookups.suppliers.length === 0 ? "No received items to voucher" : "Select a supplier…"}
            disabled={mode !== "new" || (lookups.suppliers.length === 0 && !loaded)}
            inputClassName={attempted && supplierId == null ? "field-input-error" : "field-input"}
          />
        </div>
      </div>

      {/* accounting: category, book and sorting */}
      <div className="mt-4 grid gap-4 rounded border border-yellow-300 bg-yellow-100 p-3 md:grid-cols-3">
        <div>
          <label className="ledger-label mb-1 block">Acc category</label>
          <input readOnly tabIndex={-1} className="field-input bg-white/70" value={catNames.length > 1 ? "Mixed" : (catNames[0] ?? "")} placeholder="From the items" />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Acc book</label>
          <input readOnly tabIndex={-1} className="field-input bg-white/70" value={bookNames.length > 1 ? "Mixed" : (bookNames[0] ?? "")} placeholder="From the items" />
        </div>
        <div>
          <label className="ledger-label mb-1 block">Sorting</label>
          <ComboBox
            options={lookups.sortings}
            value={sortingId}
            onChange={(id) => {
              setSortingId(id);
              setSortingManual(true);
              setTouched(true);
            }}
            placeholder="Select a sorting…"
            disabled={readOnly}
            inputClassName={attempted && sortingId == null ? "field-input-error" : "field-input"}
          />
        </div>
      </div>

      {/* two listboxes */}
      <div className="mt-6 grid gap-3 lg:grid-cols-[1fr_auto_1fr]">
        <section>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="ledger-label">Received items</span>
            {!readOnly && supplierId != null && (
              <button
                type="button"
                onClick={() => void toggleShowAll()}
                className="rounded border border-white/60 px-2 py-0.5 text-[11px] font-semibold hover:bg-white/10"
                title={
                  showAllItems
                    ? "Show only the items that normally belong to this tab"
                    : "Show every received item of this supplier"
                }
              >
                {showAllItems
                  ? voucherType === 1
                    ? "Filter: items with invoice no."
                    : "Filter: items without invoice no."
                  : "Show all items"}
              </button>
            )}
            {supplierId != null && !loadingLines && !readOnly && (
              <span className="text-[11px] text-ink-faint">
                {picked.size} selected · {available.length} available
              </span>
            )}
          </div>
          <div className="h-[280px] overflow-auto rounded-sm border border-line bg-paper-raised" role="listbox" aria-multiselectable="true">
            <LineHeader />
            {readOnly && <p className="px-3 py-3 text-sm text-ink-faint">Not available while viewing.</p>}
            {!readOnly && supplierId == null && <p className="px-3 py-3 text-sm text-ink-faint">Choose a supplier to list received items.</p>}
            {!readOnly && supplierId != null && loadingLines && <p className="px-3 py-3 text-sm text-ink-faint">Loading…</p>}
            {!readOnly && supplierId != null && !loadingLines && available.length === 0 && (
              <p className="px-3 py-3 text-sm text-ink-faint">No items waiting for a voucher.</p>
            )}
            {!readOnly &&
              available.map((l) => (
                <button
                  key={l.receivingId}
                  type="button"
                  role="option"
                  aria-selected={picked.has(l.receivingId)}
                  onClick={() => togglePick(l.receivingId)}
                  className={
                    "grid w-full grid-cols-[5.5rem_3.5rem_5.5rem_1fr_6rem] gap-2 border-b border-line px-3 py-1.5 text-left text-xs " +
                    (picked.has(l.receivingId) ? "bg-accent-soft" : "hover:bg-paper")
                  }
                >
                  <LineCells l={l} />
                </button>
              ))}
          </div>
        </section>

        <div className="flex flex-row items-center justify-center gap-2 lg:flex-col">
          <button type="button" className="btn-primary" onClick={onProcess} disabled={readOnly || picked.size === 0}>
            Process →
          </button>
          <button type="button" className="btn-secondary" onClick={onCreateCheck}>
            Create Check
          </button>
        </div>

        <section>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="ledger-label">On this voucher</span>
            <span className="text-[11px] text-ink-faint">
              {processed.length} {processed.length === 1 ? "item" : "items"} · total{" "}
              <span className="font-mono text-ink">{fmtMoney(total)}</span>
            </span>
          </div>
          <div
            className={
              "h-[280px] overflow-auto rounded-sm border bg-paper-raised " +
              (attempted && processed.length === 0 ? "border-red-500" : "border-line")
            }
          >
            <LineHeader />
            {processed.length === 0 && <p className="px-3 py-3 text-sm text-ink-faint">Select items on the left and press Process.</p>}
            {processed.map((l) => (
              <div
                key={l.receivingId}
                title={readOnly ? undefined : "Double-click to return this item to Received items"}
                onDoubleClick={() => returnItem(l.receivingId)}
                className={
                  "grid grid-cols-[5.5rem_3.5rem_5.5rem_1fr_6rem] items-center gap-2 border-b border-line px-3 py-1.5 text-xs " +
                  (readOnly ? "" : "cursor-pointer select-none hover:bg-paper")
                }
              >
                <LineCells l={l} />
              </div>
            ))}
          </div>
          {!readOnly && processed.length > 0 && (
            <p className="mt-1 text-[11px] text-ink-faint">Double-click an item to return it to Received items.</p>
          )}
        </section>
      </div>
      </section>

      {/* deductions */}
      <section className="panel panel-green mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Deductions</h2>
          <button type="button" className="btn-secondary" onClick={addDeduction} disabled={readOnly || processed.length === 0}>
            + Add deduction
          </button>
        </div>

        {deductions.length === 0 ? (
          <p className="text-sm text-ink-soft">No deductions.</p>
        ) : (
          <div className="space-y-2">
            {deductions.map((r, idx) => {
              const isEwt = r.deductionId != null && r.deductionId === ewtId;
              const isDiscount = r.deductionId != null && r.deductionId === discountId;
              return (
                <div key={r.key} className="grid items-center gap-2 md:grid-cols-[13rem_14rem_9rem_1fr_2rem]">
                  <select
                    className="field-input"
                    value={r.deductionId ?? ""}
                    disabled={readOnly}
                    onChange={(e) => {
                      const id = e.target.value === "" ? null : Number(e.target.value);
                      patchDeduction(r.key, {
                        deductionId: id,
                        ewtType: null,
                        amountStr: "",
                        rateStr: id != null && id === discountId && supplierRate != null ? String(supplierRate) : "",
                        remarks: "",
                      });
                    }}
                  >
                    <option value="">Deduction type…</option>
                    {lookups.deductions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>

                  {isEwt ? (
                    <select
                      className="field-input"
                      value={r.ewtType ?? ""}
                      disabled={readOnly}
                      onChange={(e) => {
                        const t = (e.target.value || null) as EwtType | null;
                        const label = EWT_TYPES.find((x) => x.value === t)?.remark ?? "";
                        const wasDefault = r.remarks === "" || EWT_TYPES.some((x) => x.remark === r.remarks);
                        patchDeduction(r.key, { ewtType: t, ...(wasDefault ? { remarks: label } : {}) });
                      }}
                    >
                      <option value="">EWT type…</option>
                      {EWT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  ) : isDiscount ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        max="100"
                        className="field-input !w-20 text-right font-mono"
                        placeholder="Rate"
                        aria-label="Discount rate"
                        value={r.rateStr}
                        disabled={readOnly}
                        onChange={(e) => patchDeduction(r.key, { rateStr: e.target.value })}
                      />
                      <span className="text-xs text-ink-soft">
                        % {supplierRate != null ? `(stored ${supplierRate}%)` : "(none stored)"}
                      </span>
                    </div>
                  ) : (
                    <span />
                  )}

                  {isEwt || isDiscount ? (
                    <input
                      readOnly
                      tabIndex={-1}
                      className="field-input bg-paper text-right font-mono"
                      value={amounts[idx] > 0 ? fmtMoney(amounts[idx]) : ""}
                    />
                  ) : (
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      className="field-input text-right font-mono"
                      placeholder="Amount"
                      value={r.amountStr}
                      disabled={readOnly || r.deductionId == null}
                      onChange={(e) => patchDeduction(r.key, { amountStr: e.target.value })}
                    />
                  )}

                  <input
                    className="field-input"
                    placeholder="Remarks"
                    value={r.remarks}
                    disabled={readOnly || r.deductionId == null}
                    onChange={(e) => patchDeduction(r.key, { remarks: e.target.value })}
                  />

                  {!readOnly && (
                    <button
                      type="button"
                      aria-label="Remove deduction"
                      className="text-ink-faint hover:text-danger"
                      onClick={() => {
                        setDeductions((prev) => prev.filter((x) => x.key !== r.key));
                        setTouched(true);
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <dl className="mt-5 grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-ink-soft">Gross amount</dt>
          <dd className="text-right font-mono text-ink">{fmtMoney(total)}</dd>
          <dt className="text-ink-soft">Total deductions</dt>
          <dd className="text-right font-mono text-ink">{fmtMoney(totalDeductions)}</dd>
          <dt className="border-t border-line pt-1 font-medium text-ink">Net amount</dt>
          <dd className={"border-t border-line pt-1 text-right font-mono font-semibold " + (net < 0 ? "text-danger" : "text-ink")}>
            {fmtMoney(net)}
          </dd>
        </dl>
      </section>

      {error && (
        <p className="mt-4 max-w-xl rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {!readOnly && (
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-primary" onClick={onSave} disabled={isPending}>
            {isPending ? "Saving…" : mode === "edit" ? "Save changes" : "Save voucher"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={isPending || (mode === "new" && !hasUnsaved)}
            onClick={onNewVoucher}
          >
            {mode === "edit" ? "Discard changes" : "Clear"}
          </button>
        </div>
      )}

      {askStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-sm rounded border border-line bg-paper-raised p-6 text-center shadow-sm">
            <p className="mb-5 text-sm text-ink">
              {supplierRate == null
                ? `${supplier?.label ?? "This supplier"} has no stored discount rate.`
                : `${supplier?.label ?? "This supplier"} has a stored discount rate of ${supplierRate}%.`}{" "}
              Store {askStore.rate}% for future vouchers?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className="btn-primary"
                autoFocus
                onClick={() => {
                  const a = askStore;
                  setAskStore(null);
                  commit(a.payload, a.rate);
                }}
              >
                Yes, store {askStore.rate}%
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  const a = askStore;
                  setAskStore(null);
                  commit(a.payload, null);
                }}
              >
                No, use it for this voucher only
              </button>
              <button type="button" className="text-sm text-ink-soft underline hover:text-ink" onClick={() => setAskStore(null)}>
                Back to the voucher
              </button>
            </div>
          </div>
        </div>
      )}
      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}

function LineHeader() {
  return (
    <div className="sticky top-0 grid grid-cols-[5.5rem_3.5rem_5.5rem_1fr_6rem] gap-2 border-b border-line bg-paper px-3 py-1 text-[11px] uppercase tracking-wide text-ink-faint">
      <span>Date</span>
      <span>PO no</span>
      <span>DR / Inv</span>
      <span>Item</span>
      <span className="text-right">Amount</span>
    </div>
  );
}

function LineCells({ l }: { l: VoucherLine }) {
  return (
    <>
      <span className="text-ink-soft">{formatDate(l.dtRecieved)}</span>
      <span className="font-mono text-ink">{l.poNo ?? "\u2014"}</span>
      <span className="truncate text-ink-soft" title={l.newInvNo ? `DR ${l.drInvNo} / INV ${l.newInvNo}` : `DR ${l.drInvNo}`}>
        {l.newInvNo ? `${l.drInvNo} / ${l.newInvNo}` : l.drInvNo}
      </span>
      <span className="truncate text-ink">{l.itemName}</span>
      <span className="text-right font-mono text-ink">{fmtMoney(l.amount)}</span>
    </>
  );
}
