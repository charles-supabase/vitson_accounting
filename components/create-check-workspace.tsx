"use client";

import { useEffect, useState, useTransition } from "react";
import { getVoucherDetail, type VoucherDetail, type VoucherOption } from "@/actions/voucher";
import {
  assignCheck,
  cancelCheck,
  cancelVoucher,
  getAssignedCheck,
  getAvailableChecks,
  getOpenVouchers,
  markCheckIssued,
  markVoucherPrinted,
  type AssignedCheck,
  type OpenVoucherRow,
} from "@/actions/voucher-check";
import { ComboBox } from "./combo-box";
import { ConfirmModal } from "./confirm-modal";
import { PasswordModal } from "./password-modal";
import { SuccessModal } from "./success-modal";
import { formatDate } from "@/lib/format";
import { fmtMoney } from "@/lib/inventory-format";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Option = { id: number; label: string };

export function CreateCheckWorkspace({
  initialVouchers,
  payables,
  banks,
  voucherOptions,
  initialVoucherNo,
}: {
  initialVouchers: OpenVoucherRow[];
  payables: Option[];
  banks: Option[];
  voucherOptions: VoucherOption[];
  initialVoucherNo: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  const [vouchers, setVouchers] = useState<OpenVoucherRow[]>(initialVouchers);
  const [voucher, setVoucher] = useState<VoucherDetail | null>(null);
  const [check, setCheck] = useState<AssignedCheck | null>(null);

  const [findId, setFindId] = useState<number | null>(null);
  const [findError, setFindError] = useState<string | null>(null);

  const [payableId, setPayableId] = useState<number | null>(null);
  const [bankId, setBankId] = useState<number | null>(null);
  const [availableChecks, setAvailableChecks] = useState<Option[]>([]);
  const [checkTxId, setCheckTxId] = useState<number | null>(null);
  const [dtCheck, setDtCheck] = useState(todayLocal());
  const [remark, setRemark] = useState("");

  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"check" | "voucher" | null>(null);

  useEffect(() => {
    if (initialVoucherNo != null) void loadByNo(initialVoucherNo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- loading ---------- */

  async function refreshList() {
    setVouchers(await getOpenVouchers());
  }

  function resetForm() {
    setPayableId(null);
    setBankId(null);
    setAvailableChecks([]);
    setCheckTxId(null);
    setRemark("");
    setAttempted(false);
    setError(null);
  }

  async function select(detail: VoucherDetail | null) {
    resetForm();
    setVoucher(detail);
    setFindId(detail?.id ?? null);
    setCheck(detail ? await getAssignedCheck(detail.id) : null);
  }

  async function loadById(id: number) {
    setFindError(null);
    await select(await getVoucherDetail({ id }));
  }

  async function loadByNo(no: string) {
    setFindError(null);
    const detail = await getVoucherDetail({ no });
    if (!detail) {
      setFindError(`Voucher ${no} was not found.`);
      return;
    }
    await select(detail);
  }

  function onPickVoucher(id: number | null) {
    if (id != null) void loadById(id);
  }

  async function reloadCurrent() {
    if (!voucher) return;
    const detail = await getVoucherDetail({ id: voucher.id });
    setVoucher(detail);
    setCheck(detail ? await getAssignedCheck(detail.id) : null);
    await refreshList();
  }

  async function onSelectBank(id: number | null) {
    setBankId(id);
    setCheckTxId(null);
    setAvailableChecks(id == null ? [] : await getAvailableChecks(id));
  }

  /* ---------- actions ---------- */

  function onAssign() {
    if (!voucher) return;
    setAttempted(true);
    setError(null);
    if (bankId == null || checkTxId == null || !dtCheck) return;
    if (voucher.isPettyCash && payableId == null) {
      setError("SM PETTY CASH cannot be the payee. Select a payee to continue.");
      return;
    }

    startTransition(async () => {
      const res = await assignCheck({ voucherId: voucher.id, checkTxId, date: dtCheck, payableId, remark });
      if (res.error) {
        setError(res.error);
        return;
      }
      const label = availableChecks.find((c) => c.id === checkTxId)?.label ?? "";
      setMessage(`Check ${label} assigned to voucher ${voucher.voucherNo}.`);
      resetForm();
      await reloadCurrent();
    });
  }

  /** Opens the print window right away (so it isn't blocked), then points it at the print page. */
  function printWith(action: (id: number) => Promise<{ error?: string }>, path: string) {
    if (!voucher) return;
    const id = voucher.id;
    setError(null);
    const win = window.open("", "_blank");
    startTransition(async () => {
      const res = await action(id);
      if (res.error) {
        win?.close();
        setError(res.error);
        return;
      }
      if (win) win.location.href = `${path}/${id}`;
      else window.location.href = `${path}/${id}`;
      await reloadCurrent();
    });
  }

  /** Runs after the password was typed; returns an error text for the popup, or null on success. */
  async function onCancelCheck(password: string): Promise<string | null> {
    if (!voucher) return "Select a voucher.";
    const res = await cancelCheck(voucher.id, password);
    if (res.error) return res.error;
    setConfirm(null);
    setMessage(`The check for voucher ${voucher.voucherNo} is cancelled. The voucher can be given a new check.`);
    await reloadCurrent();
    return null;
  }

  function onCancelVoucher() {
    if (!voucher) return;
    setConfirm(null);
    setError(null);
    startTransition(async () => {
      const res = await cancelVoucher(voucher.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      setMessage(`Voucher ${voucher.voucherNo} is cancelled. Its items are available for a new voucher.`);
      await select(null);
      await refreshList();
    });
  }

  /* ---------- derived ---------- */

  // Original vouchers: banks without the "Y_" prefix. Duplicate vouchers: only "Y_" banks.
  const banksForVoucher = banks.filter((b) =>
    voucher?.typeId === 2 ? b.label.startsWith("Y_") : !b.label.startsWith("Y_")
  );

  const live = !!voucher && !voucher.cancelled;
  const canPrintVoucher = live && !!check;
  const canPrintCheck = live && !!check;
  const canCancelCheck = live && !!check;
  const canCancelVoucher = live && !voucher!.checkIssued && !check;

  return (
    <div className="grid max-w-6xl gap-6 lg:grid-cols-[22rem_1fr]">
      {/* ---------- left: vouchers waiting for a check ---------- */}
      <section className="panel panel-burgundy">
        <div className="mb-3">
          <label className="ledger-label mb-1 block">Find voucher</label>
          <ComboBox
            options={voucherOptions.map((v) => ({ id: v.id, label: v.label, columns: v.columns }))}
            columnTemplate="4.5rem 6rem minmax(0,1fr) 7rem"
            listMinWidth="40rem"
            columnAlign={["right", "left", "left", "right"]}
            columnClasses={["font-bold text-blue-800", "text-orange-700", "text-ink", "font-semibold text-green-700"]}
            value={findId}
            onChange={onPickVoucher}
            placeholder={voucherOptions.length === 0 ? "No vouchers yet" : "Type a voucher number or supplier…"}
            disabled={voucherOptions.length === 0}
          />
        </div>
        {findError && <p className="mb-2 text-sm text-danger">{findError}</p>}

        <div className="mb-1 flex items-baseline justify-between">
          <span className="ledger-label">Vouchers ({vouchers.length})</span>
          <span className="flex items-center gap-3 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1">
              <Dot color="red" /> not printed
            </span>
            <span className="flex items-center gap-1">
              <Dot color="orange" /> printed
            </span>
            <span className="flex items-center gap-1">
              <Dot color="green" /> printed + check issued
            </span>
          </span>
        </div>
        <div className="h-[460px] overflow-y-auto rounded-sm border border-line bg-paper-raised" role="listbox" aria-label="Vouchers">
          {vouchers.length === 0 && <p className="px-3 py-3 text-sm text-ink-faint">No vouchers are waiting.</p>}
          {vouchers.map((v) => (
            <button
              key={v.id}
              type="button"
              role="option"
              aria-selected={voucher?.id === v.id}
              onClick={() => void loadById(v.id)}
              className={
                "flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left " +
                (voucher?.id === v.id ? "bg-accent-soft" : "hover:bg-paper")
              }
            >
              <Dot color={v.printed && v.checkIssued ? "green" : v.printed ? "orange" : "red"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">
                  <span className="font-mono">{v.voucherNo}</span> · {v.supplierName}
                </span>
                <span className="block text-[11px] text-ink-soft">
                  {formatDate(v.voucherDate)}
                  {v.hasCheck ? " · check assigned" : ""}
                </span>
              </span>
              <span className="font-mono text-sm text-ink">{fmtMoney(v.net)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ---------- right: voucher info + check assignment ---------- */}
      <section className="panel panel-green">
        {!voucher ? (
          <p className="rounded-sm border border-dashed border-line px-4 py-10 text-center text-sm text-ink-faint">
            Select a voucher from the list, or find one by number.
          </p>
        ) : (
          <div className="rounded-sm border border-line bg-paper-raised p-4">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-ink">
                Voucher <span className="font-mono">{voucher.voucherNo}</span>
                <span
                  className={
                    "ml-3 rounded px-2 py-0.5 text-xs font-extrabold tracking-wider " +
                    (voucher.typeId === 2 ? "bg-[#F59E0B] text-[#3b1d00]" : "bg-[#1D4ED8] text-white")
                  }
                >
                  {voucher.typeId === 2 ? "DUPLICATE" : "ORIGINAL"}
                </span>
              </h2>
              <div className="flex gap-2 text-[11px]">
                {voucher.cancelled && <Chip tone="danger">Cancelled</Chip>}
                <Chip>{voucher.printed ? "Printed" : "Not printed"}</Chip>
                <Chip>{voucher.checkIssued ? "Check issued" : "Check not issued"}</Chip>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Info label="Date" value={formatDate(voucher.voucherDate)} />
              <Info label="Supplier" value={voucher.supplierName} />
              <Info label="Sorting" value={voucher.sortingName ?? "\u2014"} />
              <Info label="Items" value={String(voucher.lines.length)} />
            </div>

            {voucher.deductions.length > 0 && (
              <ul className="mb-3 space-y-0.5 text-sm">
                {voucher.deductions.map((d, i) => (
                  <li key={i} className="flex justify-between text-ink-soft">
                    <span>
                      {d.deductionName}
                      {d.remarks ? ` · ${d.remarks}` : ""}
                    </span>
                    <span className="font-mono">{fmtMoney(d.amount)}</span>
                  </li>
                ))}
              </ul>
            )}

            <dl className="mb-5 grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
              <dt className="text-ink-soft">Gross amount</dt>
              <dd className="text-right font-mono text-ink">{fmtMoney(voucher.gross)}</dd>
              <dt className="text-ink-soft">Total deductions</dt>
              <dd className="text-right font-mono text-ink">{fmtMoney(voucher.totalDeductions)}</dd>
              <dt className="border-t border-line pt-1 font-medium text-ink">Net amount</dt>
              <dd className="border-t border-line pt-1 text-right font-mono font-semibold text-ink">{fmtMoney(voucher.net)}</dd>
            </dl>

            {/* assigned check, or the form to assign one */}
            {check ? (
              <div className="rounded-sm border border-line bg-paper p-3 text-sm">
                <div className="ledger-label mb-1">Assigned check</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <Info label="Bank" value={check.bankName ?? "\u2014"} />
                  <Info label="Check no" value={check.checkNo} />
                  <Info label="Date" value={formatDate(check.dtCheck)} />
                  <Info label="Amount" value={check.amount != null ? fmtMoney(check.amount) : "\u2014"} />
                  <Info label="Payee" value={check.payableName ?? voucher.supplierName} />
                  <Info label="Remark" value={check.remark ?? "\u2014"} />
                </div>
              </div>
            ) : voucher.cancelled ? null : (
              <div className="rounded-sm border border-line p-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="col-span-2">
                    <label className="ledger-label mb-1 block">Payee{voucher.isPettyCash ? " (required)" : ""}</label>
                    <ComboBox
                      options={payables}
                      value={payableId}
                      onChange={setPayableId}
                      placeholder={voucher.isPettyCash ? "Select the real payee" : `Defaults to ${voucher.supplierName}`}
                      inputClassName={attempted && voucher.isPettyCash && payableId == null ? "field-input-error" : "field-input"}
                    />
                  </div>
                  <div>
                    <label className="ledger-label mb-1 block">Bank</label>
                    <ComboBox
                      options={banksForVoucher}
                      value={bankId}
                      onChange={onSelectBank}
                      placeholder="Select a bank…"
                      inputClassName={attempted && bankId == null ? "field-input-error" : "field-input"}
                    />
                  </div>
                  <div>
                    <label className="ledger-label mb-1 block">Check / DM no</label>
                    <ComboBox
                      options={availableChecks}
                      value={checkTxId}
                      onChange={setCheckTxId}
                      placeholder={bankId == null ? "Select a bank first" : availableChecks.length === 0 ? "None available" : "Select a number…"}
                      disabled={bankId == null || availableChecks.length === 0}
                      inputClassName={attempted && checkTxId == null ? "field-input-error" : "field-input"}
                    />
                  </div>
                  <div>
                    <label className="ledger-label mb-1 block">Date</label>
                    <input
                      type="date"
                      className={attempted && !dtCheck ? "field-input-error" : "field-input"}
                      value={dtCheck}
                      onChange={(e) => setDtCheck(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="ledger-label mb-1 block">Remark</label>
                    <input className="field-input" value={remark} onChange={(e) => setRemark(e.target.value)} />
                  </div>
                </div>
                <button type="button" className="btn-primary mt-4" onClick={onAssign} disabled={isPending}>
                  {isPending ? "Saving…" : "Assign check"}
                </button>
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
              <button
                type="button"
                className={"btn-primary " + (voucher.printed ? "!bg-green-600 hover:!bg-green-700" : "!bg-orange-500 hover:!bg-orange-600")}
                disabled={!canPrintVoucher || isPending}
                title={check ? undefined : "Assign a check first"}
                onClick={() => printWith(markVoucherPrinted, "/voucher/print")}
              >
                Print Voucher
              </button>
              <button
                type="button"
                className={"btn-primary " + (voucher.checkIssued ? "!bg-green-600 hover:!bg-green-700" : "!bg-orange-500 hover:!bg-orange-600")}
                disabled={!canPrintCheck || isPending}
                title={check ? undefined : "Assign a check first"}
                onClick={() => printWith(markCheckIssued, "/voucher/print-check")}
              >
                Print Check
              </button>
              <button
                type="button"
                className="btn-secondary border-danger text-danger hover:bg-danger-soft"
                disabled={!canCancelCheck || isPending}
                onClick={() => setConfirm("check")}
              >
                Cancel Check
              </button>
              <button
                type="button"
                className="btn-secondary border-danger text-danger hover:bg-danger-soft"
                disabled={!canCancelVoucher || isPending}
                title={check ? "Cancel the check first" : voucher.checkIssued ? "A check was issued" : undefined}
                onClick={() => setConfirm("voucher")}
              >
                Cancel Voucher
              </button>
            </div>
          </div>
        )}
      </section>

      {confirm === "check" && voucher && (
        <PasswordModal
          title="Cancel check"
          message={`Cancel check ${check?.checkNo ?? ""} for voucher ${voucher.voucherNo}? The check number is used up and the voucher goes back to waiting for a check. Enter the check cancellation password to continue.`}
          confirmLabel="Cancel check"
          onSubmit={onCancelCheck}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "voucher" && voucher && (
        <ConfirmModal
          danger
          message={`Cancel voucher ${voucher.voucherNo}? Its items return to the list of items available for a voucher and its deductions are deleted.`}
          confirmLabel="Cancel voucher"
          cancelLabel="Keep"
          onConfirm={onCancelVoucher}
          onCancel={() => setConfirm(null)}
        />
      )}
      {message && <SuccessModal message={message} onClose={() => setMessage(null)} />}
    </div>
  );
}

function Dot({ color }: { color: "red" | "orange" | "green" }) {
  const bg = color === "red" ? "bg-red-500" : color === "orange" ? "bg-orange-400" : "bg-green-500";
  return <span aria-hidden className={"inline-block h-2.5 w-2.5 shrink-0 rounded-full " + bg} />;
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: "danger" }) {
  return (
    <span className={"rounded-full border px-2 py-0.5 " + (tone === "danger" ? "border-danger text-danger" : "border-line text-ink-soft")}>
      {children}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="ledger-label">{label}</div>
      <div className="text-ink">{value}</div>
    </div>
  );
}
