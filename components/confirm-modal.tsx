"use client";

import { useEffect } from "react";

export function ConfirmModal({
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      role="alertdialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded border border-line bg-paper-raised p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-danger-soft text-danger">
          !
        </div>
        <p className="mb-5 text-sm text-ink">{message}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary flex-1" autoFocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={"flex-1 " + (danger ? "btn-primary !bg-[#BD7777] hover:!bg-[#C98585]" : "btn-primary")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
