"use client";

import { useState } from "react";

export function PasswordModal({
  title,
  message,
  confirmLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  /** Resolve with an error message to show it, or with null when it worked (the caller closes the modal). */
  onSubmit: (password: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const err = await onSubmit(password);
    setBusy(false);
    if (err) {
      setError(err);
      setPassword("");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded border border-line bg-paper-raised p-6 shadow-sm">
        <h3 className="mb-2 font-display text-lg font-semibold text-ink">{title}</h3>
        <p className="mb-4 text-sm text-ink-soft">{message}</p>
        <label className="ledger-label mb-1 block">Password</label>
        <input
          type="password"
          autoComplete="off"
          autoFocus
          data-enter-submit
          className={error ? "field-input-error" : "field-input"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void submit();
            if (e.key === "Escape" && !busy) onCancel();
          }}
        />
        {error && (
          <p className="mt-2 rounded-sm bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary !bg-[#BD7777] hover:!bg-[#C98585] flex-1" onClick={submit} disabled={busy}>
            {busy ? "Checking…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
