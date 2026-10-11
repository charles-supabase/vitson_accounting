"use client";

import { useState } from "react";
import { ConfirmModal } from "./confirm-modal";
import { MONTH_NAMES } from "@/lib/report-format";

type RowError = { row: number; problems: string[] };
type ErrorInfo = { message: string; rowErrors?: RowError[]; totalInvalidRows?: number; truncated?: boolean };

const GENERIC = "Something went wrong. Please try again; if it keeps happening, contact the administrator.";

/**
 * POPULATE button for Accounts Receivable.
 * Copies the selected month (the Month / Year filter) from the Google Sheet
 * "Sales Statement" into tbl_Account_Receivables through /api/import-receivables,
 * replacing that month's existing Big and Small entries.
 */
export function ArPopulateButton({
  month,
  year,
  disabled,
  canStart,
  onImported,
}: {
  month: number;
  year: string;
  disabled?: boolean;
  /** lets the screen ask about unsaved changes first; return false to cancel */
  canStart: () => Promise<boolean>;
  onImported: (message: string) => void;
}) {
  const label = `${MONTH_NAMES[month - 1]} ${year}`;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [emptyPrompt, setEmptyPrompt] = useState<{ existing: number | null } | null>(null);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!(await canStart())) return;
    setConfirmOpen(true);
  }

  async function run(allowEmptyReplacement: boolean) {
    setConfirmOpen(false);
    setEmptyPrompt(null);
    setBusy(true);
    try {
      const res = await fetch("/api/import-receivables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, year: Number(year), allowEmptyReplacement }),
      });
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        /* non-JSON response */
      }

      if (res.ok && data?.success) {
        onImported(
          `${data.periodLabel} imported from Google Sheets: ${Number(data.inserted).toLocaleString("en-US")} entries added, ` +
            `${Number(data.removed).toLocaleString("en-US")} previous entries replaced.`,
        );
        return;
      }

      const err = data?.error;
      if (err?.code === "NO_RECORDS_FOUND") {
        setEmptyPrompt({ existing: typeof err.details?.existingRows === "number" ? err.details.existingRows : null });
        return;
      }
      if (res.status === 401) {
        setErrorInfo({ message: "Your session has ended. Please sign in again." });
        return;
      }
      if (res.status === 403) {
        setErrorInfo({ message: "You do not have permission to import receivables." });
        return;
      }
      setErrorInfo({
        message: err?.message ?? GENERIC,
        rowErrors: err?.details?.rowErrors,
        totalInvalidRows: err?.details?.totalInvalidRows,
        truncated: err?.details?.truncated,
      });
    } catch {
      setErrorInfo({ message: "Could not reach the server. Please check the connection and try again. Nothing was changed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-primary"
        disabled={disabled || busy}
        onClick={() => void onClick()}
        title="Copy this month's sales from the Google Sheet"
      >
        {busy ? "Importing…" : "Populate"}
      </button>

      {confirmOpen && (
        <ConfirmModal
          danger
          message={`Import ${label} from the Google Sheet? The existing ${label} sales entries (Big and Small) will be replaced by the sheet's data.`}
          confirmLabel="Import"
          cancelLabel="Cancel"
          onConfirm={() => void run(false)}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {emptyPrompt && (
        <ConfirmModal
          danger
          message={`No records for ${label} were found in the Google Sheet, so nothing was changed. ${
            emptyPrompt.existing
              ? `Replace ${label} with nothing? This deletes its ${emptyPrompt.existing.toLocaleString("en-US")} existing entries.`
              : `Replace ${label} with nothing anyway?`
          }`}
          confirmLabel="Replace with nothing"
          cancelLabel="Keep existing"
          onConfirm={() => void run(true)}
          onCancel={() => setEmptyPrompt(null)}
        />
      )}

      {errorInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="alertdialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded border border-line bg-paper-raised p-5 shadow-xl">
            <p className="mb-3 text-sm font-medium text-danger">{errorInfo.message}</p>
            {errorInfo.rowErrors && errorInfo.rowErrors.length > 0 && (
              <ul className="mb-3 space-y-2 text-sm">
                {errorInfo.rowErrors.map((r) => (
                  <li key={r.row} className="rounded-sm bg-danger-soft px-3 py-2">
                    <span className="font-bold">Sheet row {r.row}:</span> {r.problems.join(" ")}
                  </li>
                ))}
              </ul>
            )}
            {errorInfo.truncated && (
              <p className="mb-3 text-sm text-ink-soft">
                Showing the first {errorInfo.rowErrors?.length} of {errorInfo.totalInvalidRows} problem rows. Fix these and import again to see the rest.
              </p>
            )}
            <div className="flex justify-end">
              <button type="button" className="btn-primary" onClick={() => setErrorInfo(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
