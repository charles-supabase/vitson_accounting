"use client";

import { useEffect, useRef } from "react";

/** In-app popup with one OK button (used instead of the browser's alert). */
export function NoticeModal({
  title,
  message,
  kind = "success",
  onClose,
}: {
  title: string;
  message: string;
  kind?: "success" | "error";
  onClose: () => void;
}) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ok.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded border border-line bg-paper-raised p-6 shadow-lg">
        <h2 className={`mb-2 font-display text-lg font-semibold ${kind === "error" ? "text-danger" : "text-success"}`}>{title}</h2>
        <p className="mb-5 text-sm text-ink-soft">{message}</p>
        <div className="text-right">
          <button ref={ok} type="button" className="btn-primary" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
